import { filingStore } from "@/lib/filingStore";
import {
  MANAGERS,
  NoFilingError,
  fundHoldings,
  fundList,
  fundPositionHistory,
  fundQuarterBooks,
  fundTickerRows,
  fundValueHistory,
  costBasis,
  isKnownManager,
  isPeriod,
  isRoster,
  minValueFor,
  rosterOf,
  valueChangeYoy,
} from "@/lib/thirteenF";
import { HEDGE_QUARTERS } from "@/lib/hedgeFundQuarters";
import {
  PRICED_HOLDINGS,
  mapHoldings,
  replicationSeries,
  sectorsByQuarter,
  topHoldingsByQuarter,
} from "@/lib/fundCharts";
import { quarterCloses } from "@/lib/quarterCloses";
import { describeSymbols } from "@/lib/symbolProfile";
import { rankAggregates } from "@/lib/hedgeFundAggregate";
import { HEDGE_TOP20 } from "@/lib/hedgeFundTop20";
import { HEDGE_AGGREGATES } from "@/lib/hedgeFundAggregates";
import { estimatedYoy, yoyChange } from "@/lib/fundReturn";
import { memo } from "@/lib/memo";
import { pool } from "@/lib/pool";
import { clamp } from "@/lib/num";

// Building the list cold is two EDGAR requests per manager, and they're paced
// to stay inside the SEC's ten-a-second - so the first caller after a cold
// start waits somewhere north of ten seconds. Everyone after that is served
// from the cache below.
export const maxDuration = 60;

// Without `cik`: the managers whose last 13F clears $10B, biggest first.
// With one: that manager's book, a page of holdings at a time.
// With `view=aggregate`: the same two leaderboards every 13F site runs, over
// every manager on the list at once.

// A 13F never changes once filed, so the only reason to rebuild any of these
// is a new quarter. Held in the server's memory as well as at the CDN, because
// assembling the list is twenty round trips to EDGAR and a single fund's
// information table is several megabytes to fetch and parse.
const TTL = 21_600_000;

// A book is the whole book rather than its top 25, which for the largest
// managers is thousands of positions and megabytes of objects. Holding every
// manager anyone has clicked would grow without a ceiling, so books get their
// own memo with a ceiling and evict oldest-first. The list has one entry and
// sits in its own, which is what keeps a run of fund clicks from pushing it
// out and making the next visitor wait for twenty EDGAR round trips again.
const fundBooks = memo(TTL, { max: 8 });

// Parsing a manager's filing costs several seconds and can't be done in
// pieces, so once a book has been read it is kept past its TTL and served
// while a refresh runs behind it. Without this the reader who arrives after
// the six hours are up pays the whole parse. Mirrors the market cap board.
const lastFundBook = new Map();
const refreshingFundBook = new Map();

function fundBookWithRevalidate(key, build) {
  const cached = lastFundBook.get(key);
  const fresh = cached && Date.now() - cached.at < TTL;
  if (cached && !fresh && !refreshingFundBook.has(key)) {
    const run = fundBooks(key, build)
      .then((value) => lastFundBook.set(key, { at: Date.now(), value }))
      .catch(() => {})
      .finally(() => refreshingFundBook.delete(key));
    refreshingFundBook.set(key, run);
  }
  if (cached) return Promise.resolve(cached.value);
  return fundBooks(key, build).then((value) => {
    lastFundBook.set(key, { at: Date.now(), value });
    return value;
  });
}
const lists = memo(TTL);

// The cost basis walked out of a manager's last fourteen filings. Same TTL and
// the same reason as the books above - a filed 13F never changes - but it is
// kept apart from them because it is per-manager rather than per-quarter, and
// because it is the expensive half: fourteen filings read one after another,
// which is most of the wait on a click. Without this it was rebuilt on every
// page turn and every Added/Reduced toggle, re-reading all fourteen to serve
// twenty-five rows the server already had.
const fundBasis = memo(TTL, { max: 8 });

// Same bucket the parsed filings use, and optional for the same reason:
// outside Lambda no bucket is configured and everything is built live.
const basisStore = filingStore;

// Prices move all day, so unlike everything else here this one is worth
// rebuilding within a quarter - hourly, which is also what Yahoo is cached for.
const returns = memo(3_600_000);
const RETURN_CACHE_HEADER = { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" };

// A year-over-year estimate for every manager on the list, off the weights baked
// into the quarterly snapshot. Yahoo is asked once per ticker rather than once
// per fund holding it: forty-eight books of megacaps overlap heavily, and the
// same symbol priced fifteen times is fifteen requests for one answer.
async function fundReturns() {
  const weights = HEDGE_TOP20.weights ?? {};
  const tickers = [...new Set(Object.values(weights).flat().map((h) => h.ticker))];
  const changes = await pool(tickers, 6, yoyChange);
  const priced = new Map(tickers.map((t, i) => [t, changes[i]]));
  const entries = await Promise.all(
    Object.entries(weights).map(async ([cik, holdings]) => [
      cik,
      await estimatedYoy(holdings, (t) => priced.get(t) ?? null),
    ])
  );
  return Object.fromEntries(entries);
}

const CACHE_HEADER = { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" };

// A filed total never changes. Compute each quarter's YoY from the frozen
// lists rather than repricing the latest book or returning to EDGAR.
function frozenList(roster, period) {
  const rows = HEDGE_QUARTERS.rosters[roster]?.[period];
  if (!rows) return null;
  const priorPeriod = `${Number(period.slice(0, 4)) - 1}${period.slice(4)}`;
  const prior = new Map(
    (HEDGE_QUARTERS.rosters[roster]?.[priorPeriod] ?? []).map((fund) => [fund.cik, fund])
  );
  return rows.map((fund) => {
    const before = prior.get(fund.cik)?.totalValue;
    return {
      ...fund,
      yoy: before ? ((fund.totalValue - before) / before) * 100 : null,
      yoyPriorPeriod: before ? priorPeriod : null,
    };
  });
}

// ---------------------------------------------------------------------------
// The market-wide aggregates
//
// Every manager's information table, twice over - the quarter and the one
// before it - which is a few hundred megabytes of XML and minutes of EDGAR's
// rate limit. Too long for one request to hold open, so a call does a slice of
// the work, banks it, and reports how far along it is. The client polls; each
// poll pushes it further, and a serverless instance that gets recycled halfway
// resumes from whatever the next one has rather than starting over.
const AGGREGATE_BUDGET_MS = 20_000;
const AGGREGATE_CONCURRENCY = 3;

// One build per quarter. Switching quarters is the whole point of the picker,
// and a single set of books would mean each switch threw away the minutes the
// reader just spent on the quarter they came from. Not a memo entry: the steps
// before the last one return a progress report rather than an answer, and a
// memo would cache the first of those as though it were the answer.
const builds = new Map();

function buildFor(period) {
  const existing = builds.get(period);
  if (existing && Date.now() - existing.startedAt < TTL) return existing;
  const fresh = { books: new Map(), startedAt: Date.now(), done: null, run: null };
  builds.set(period, fresh);
  return fresh;
}

async function aggregateStep(period) {
  const build = buildFor(period);
  if (build.done) return build.done;

  const deadline = Date.now() + AGGREGATE_BUDGET_MS;
  const todo = MANAGERS.filter((m) => !build.books.has(m.cik));
  await pool(todo, AGGREGATE_CONCURRENCY, async (m) => {
    // Checked before starting a manager rather than during: a table already
    // being downloaded is cheaper to finish than to abandon and refetch.
    if (Date.now() > deadline) return;
    // A manager whose filing can't be read - or that filed nothing for this
    // quarter at all - is banked empty, so the build doesn't retry it on every
    // poll and never finish.
    build.books.set(m.cik, await fundTickerRows(m.cik, period).catch(() => []));
  });

  if (build.books.size < MANAGERS.length) {
    return { building: true, read: build.books.size, total: MANAGERS.length };
  }
  const books = [...build.books.values()];
  build.done = {
    ...rankAggregates(books),
    // Managers that filed for this quarter, not managers on the list.
    funds: books.filter((rows) => rows.length).length,
    asOf: period,
  };
  return build.done;
}

// One build at a time per quarter, however many tabs are watching it.
function aggregate(period) {
  const build = buildFor(period);
  if (!build.run) build.run = aggregateStep(period).finally(() => (build.run = null));
  return build.run;
}

// ---------------------------------------------------------------------------
// The charts on a manager's page
//
// Five quarters of one manager's information tables, which for the largest
// filers is tens of megabytes of XML - so this has its own small memo and is
// only built when the charts tab is actually opened.
const chartBooks = memo(TTL, { max: 4 });

// How many names the map and the sector split look at. The whole book runs to
// thousands of positions worth a rounding error each; the sector mix is
// settled long before the tail and the tiles stop being visible well before it.
const SECTOR_HOLDINGS = 60;
// The map draws more names than the flat treemap did - it groups them by
// sector, and a map of twenty tiles has nothing to group. This is the slice
// it lays out, and the same slice sectors are looked up for.
const MAP_HOLDINGS = 60;

async function fundChartData(cik) {
  const books = await fundQuarterBooks(cik);
  if (!books.length) throw new NoFilingError(`CIK ${cik} has no readable filings`);

  const periods = books.map((b) => b.period);

  // Sectors and prices are asked about a bounded slice of each book rather
  // than all of it: both cost a request per symbol, and a manager reporting
  // fifteen thousand positions would otherwise be fifteen thousand of them.
  const sectorTickers = [
    ...new Set(
      books.flatMap((b) => b.rows.slice(0, Math.max(SECTOR_HOLDINGS, MAP_HOLDINGS)).map((h) => h.ticker))
    ),
  ];
  const priceTickers = [...new Set(books.flatMap((b) => b.rows.slice(0, PRICED_HOLDINGS).map((h) => h.ticker)))];

  const [described, priceAt, valueHistory] = await Promise.all([
    describeSymbols(sectorTickers.map((symbol) => ({ symbol }))).catch(() => []),
    quarterCloses([...priceTickers, "SPY"], periods),
    // Off the cover pages, so this reaches every quarter the manager filed -
    // not only the ones whose information table parsed into `books`.
    fundValueHistory(cik).catch(() => []),
  ]);

  const sectorBy = new Map(described.map((d) => [d.symbol, d.sector]));
  // Only the slice sectors were looked up for, so the percentages are of what
  // was classified rather than of a book mostly filed under "Other".
  const sectorBooks = books.map((b) => ({ ...b, rows: b.rows.slice(0, SECTOR_HOLDINGS) }));

  return {
    cik,
    periods,
    performance: replicationSeries(books, priceAt),
    topHoldings: topHoldingsByQuarter(books, 10),
    // What the whole filed table was worth each quarter, oldest first so the
    // line reads left to right the way every other chart on the page does.
    valueHistory: [...valueHistory].reverse(),
    // The newest book as map tiles: what the fund holds, how much of the book
    // each is, and the sector to group it under. Performance is not here - the
    // map colors by it and that is live, so the page asks /api/stock-map for
    // the quotes exactly as the index maps do.
    map: mapHoldings(books, (t) => described.find((d) => d.symbol === t) ?? null, MAP_HOLDINGS),
    sectors: sectorsByQuarter(sectorBooks, (t) => sectorBy.get(t) ?? null),
    // What the two sampled charts actually looked at, so the page can say so.
    sectorSample: SECTOR_HOLDINGS,
    pricedSample: PRICED_HOLDINGS,
  };
}

// ---------------------------------------------------------------------------

// Fifty rows a page, matching the market cap board. The whole book is already
// parsed and held in memory by the time this slices it, so a larger page costs
// nothing but the bytes.
const PAGE_SIZE = 50;

export async function GET(request) {
  const params = request.nextUrl.searchParams;
  const cik = params.get("cik");

  // Only the managers this page knows about. The CIK reaches EDGAR as a URL
  // path, so it isn't something to pass through from a query string unchecked.
  if (cik && !isKnownManager(cik)) {
    return Response.json({ error: "Unknown manager" }, { status: 400 });
  }

  // Which quarter to read, absent meaning the newest. Only ever matched against
  // a manager's filing history, but it's also part of a cache key, so a shape
  // is required rather than trusted.
  const period = params.get("period");
  if (period && !isPeriod(period)) {
    return Response.json({ error: "Bad quarter" }, { status: 400 });
  }

  // Which list to show. Checked rather than trusted - it indexes both the
  // snapshot and a cache key.
  const roster = params.get("roster") ?? "hedgefunds";
  if (!isRoster(roster)) {
    return Response.json({ error: "Unknown roster" }, { status: 400 });
  }
  // Distinguishes "the newest quarter" from a quarter that happens to be the
  // newest, so the two never share a cache entry.
  const at = period ?? "latest";

  try {
    if (params.get("view") === "returns") {
      return Response.json({ returns: await returns("yoy", fundReturns) }, { headers: RETURN_CACHE_HEADER });
    }

    if (params.get("view") === "aggregate") {
      // The snapshot is one quarter's boards, already read - see
      // lib/hedgeFundTop20.js - so it answers for that quarter and no other.
      // Any other quarter is built here, which is minutes of EDGAR the first
      // time and why this endpoint reports progress instead of blocking.
      // `fresh=1` is the build script asking for the real thing.
      const requested = period ?? HEDGE_TOP20.asOf;
      const snapshot = !params.get("fresh")
        ? HEDGE_AGGREGATES[requested] ?? (requested === HEDGE_TOP20.asOf ? HEDGE_TOP20 : null)
        : null;
      if (snapshot) {
        // Without the weights: they're a page of numbers the leaderboards have
        // no use for, and `view=returns` is what turns them into one.
        const { weights, ...boards } = snapshot;
        return Response.json(boards, { headers: CACHE_HEADER });
      }
      // Which quarter to build. Without one that's the newest, and the list is
      // what knows which quarter that is.
      const asOf = period ?? (await lists("list:latest", () => fundList())).asOf;
      if (!asOf) return Response.json({ error: "No filings to aggregate" }, { status: 503 });
      const payload = await aggregate(asOf);
      // A part-built answer must not be cached as the answer.
      return Response.json(payload, {
        headers: payload.building ? { "Cache-Control": "no-store" } : CACHE_HEADER,
      });
    }

    if (!cik) {
      // The precomputed lists answer first. Every quarter of both rosters is
      // in lib/hedgeFundQuarters.js - a filed 13F never changes, so this is
      // the same answer building it live would take twenty EDGAR round trips
      // to reach. `fresh=1` is the build script asking for the real thing.
      const frozen = !params.get("fresh") && HEDGE_QUARTERS.quarters.length;
      const asOf = period ?? HEDGE_QUARTERS.quarters[0];
      const recorded = frozen ? frozenList(roster, asOf) : null;
      if (recorded) {
        return Response.json(
          { funds: recorded, periods: HEDGE_QUARTERS.quarters, asOf, roster },
          { headers: CACHE_HEADER }
        );
      }
      // A quarter the snapshot doesn't carry - an older one than it was built
      // for, or a roster added since - still reads live rather than 404ing.
      return Response.json(
        {
          ...(await lists(`list:${roster}:${at}`, () =>
            fundList(period, rosterOf(roster), minValueFor(roster))
          )),
          roster,
        },
        { headers: CACHE_HEADER }
      );
    }

    // The charts read every quarter at once, so unlike the table below they
    // don't take a quarter - the picker above them chooses which quarter the
    // holdings are read at, and these are about the span.
    if (params.get("view") === "charts") {
      return Response.json(await chartBooks(cik, () => fundChartData(cik)), { headers: CACHE_HEADER });
    }

    const fund = await fundBookWithRevalidate(`${cik}:${at}`, async () => {
      const book = await fundHoldings(cik, period);
      // The value history is cover pages only - a couple of kilobytes each -
      // so pairing this quarter with the same quarter a year ago costs far
      // less than the information table already being read beside it.
      const [yoyReturn, history] = await Promise.all([
        estimatedYoy(book.holdings),
        fundValueHistory(cik).catch(() => []),
      ]);
      return { ...book, yoyReturn, valueYoy: valueChangeYoy(history, book.period) };
    });

    // Both books are held whole in the cache and one is sent a page at a time -
    // Citadel's shares alone are 5,960 rows, which is not a response, and its
    // options are more. The two rings above the table are small enough to go
    // with every page, so switching sides only re-reads the table.
    const { holdings: shares, optionHoldings, ...rest } = fund;
    const kind = params.get("kind") === "options" ? "options" : "shares";
    const rawBook = kind === "options" ? optionHoldings : shares;

    // Average cost and P/L, walked forward from every filing this manager has.
    // Only an estimate - see costBasis - and only worth the extra filings when
    // the reader is looking at a specific manager's table, which is here.
    // A failure leaves the columns empty rather than the page broken: this is
    // supplementary to a book that reads fine without it.
    // Both bases are built on the one pass through the filings: the reader who
    // switches to the options table has already paid for it, and the two
    // together are a fraction of the read that produced them.
    const bases = await fundBasis(cik, async () => {
      // The filings behind this are cached in KV (see readFiling), but walking
      // fourteen of them back into a basis is still work a cold isolate would
      // redo on the first click it serves. The result is derived from filings
      // that never change, so it is stored the same way - keyed by the newest
      // filing, which is what a new quarter changes.
      const store = await basisStore();
      const key = `b:${cik}:${at}`;
      if (store) {
        const hit = await store.get(key).catch(() => null);
        if (hit) return { shares: new Map(hit.shares), options: new Map(hit.options) };
      }

      const priorBooks = await fundPositionHistory(cik).catch(() => []);
      const built = {
        shares: costBasis(priorBooks),
        options: costBasis(priorBooks.map((b) => ({ period: b.period, positions: b.options }))),
      };
      if (store) {
        try {
          await store.put(
            key,
            JSON.stringify({ shares: [...built.shares], options: [...built.options] })
          );
        } catch {
          /* the basis stands on its own */
        }
      }
      return built;
    });
    const basis = bases[kind];
    const book = rawBook.map((h) => {
      const held = basis.get(h.key);
      // Marked against the price this quarter's filing implies, which is the
      // same number the Price column shows - so the P/L is the spread between
      // the two prices on the row, times the shares held.
      const estPnl = held && h.price != null ? (h.price - held.avgPrice) * h.shares : null;
      return {
        ...h,
        avgPrice: held?.avgPrice ?? null,
        heldSince: held?.since ?? null,
        estPnl,
        estPnlPct: held?.spent > 0 && estPnl != null ? (estPnl / held.spent) * 100 : null,
      };
    });

    // Added / reduced, measured against the quarter before. Applied here
    // rather than in the browser because the table is paginated server-side:
    // filtering a single page would only ever show the additions that happened
    // to fall on it, and the row count under the table would still be the
    // whole book. A position opened this quarter counts as added - it grew
    // from nothing, which is why it carries no percentage of its own.
    //
    // `sharesChange` is null when there is no prior filing to compare with, so
    // a manager's first quarter filters to an empty list rather than claiming
    // every position is new.
    const change = params.get("change");
    let rows =
      change === "added"
        ? book.filter((h) => h.isNew || h.sharesChange > 0)
        : change === "reduced"
          ? book.filter((h) => !h.isNew && h.sharesChange < 0)
          : book;

    // No sorting here. A column click reorders the 25 rows already on the
    // reader's screen, done in the client off the response it already has -
    // the same click-to-sort the manager list uses. Re-ranking 6,000+ rows
    // per click was a request the reader waited on for a page they were
    // already looking at.
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const page = clamp(Number(params.get("page")) || 1, 1, pages);
    return Response.json(
      {
        ...rest,
        kind,
        change: change === "added" || change === "reduced" ? change : "all",
        holdings: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
        rowCount: rows.length,
        // The unfiltered size, so the toggle can say what it is filtering from.
        bookCount: book.length,
        page,
        pages,
        pageSize: PAGE_SIZE,
      },
      { headers: CACHE_HEADER }
    );
  } catch (e) {
    // A manager that didn't file that quarter is a real, final answer, and
    // telling the reader to try again in a moment would be a lie.
    // Two shapes of the same final answer: no filing for that quarter, or a
    // filing that reported no holdings - Norges Bank's Q3 2024 is a single
    // placeholder row at zero value. Either way there is no book to show and
    // no amount of retrying will produce one.
    if (e instanceof NoFilingError) {
      return Response.json(
        { error: "This manager reported no 13F holdings for that quarter." },
        { status: 404 }
      );
    }
    // EDGAR is the only source for this; there's no static list to fall back
    // on the way the preset maps have.
    return Response.json(
      { error: "SEC filings are unavailable right now. Try again in a moment." },
      { status: 503 }
    );
  }
}
