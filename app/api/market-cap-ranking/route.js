import { YAHOO_USER_AGENT } from "@/lib/userAgent";
import { memo } from "@/lib/memo";
import { pool } from "@/lib/pool";
import { rsi } from "@/lib/indicators";
import { countriesForSymbols, yahooSession } from "@/lib/symbolProfile";
import {
  countryLabel,
  dropOtcDuplicates,
  EXCHANGE_FLAGS,
  filterByMarketCapFloor,
  marketOf,
  rankMarketRows,
} from "@/lib/market";

// The companies-by-market-cap board: the largest listings, each with its P/E,
// a three-month price line and a 14-day RSI.
//
// Two upstreams, both already used elsewhere in the app. Yahoo's equity
// screener ranks by market cap server-side, which is the only sane way to find
// the biggest listings out of twenty thousand. Yahoo's spark endpoint then
// prices those in chunks - one request per twenty names covers both the
// sparkline and the RSI, since RSI is computed from the same closes.
//
// US listings only, the same region filter the stock screener uses. Yahoo
// reports a foreign line's market cap in its own currency, so a worldwide
// screen ranks a Colombian cross-listing of NVDA above NVDA itself on a number
// that is pesos, not dollars. The US screen still carries the foreign majors
// that matter (TSM, ASML, NVO) through their US listings, priced in USD.
const REGION = "us";
// Yahoo caps one screener response at 250. Keep paging until its cap-ordered
// results cross $30B so the board has a financial boundary, not an arbitrary
// row count that changes meaning as the market grows.
const SCREEN_PAGE = 250;
const MARKET_CAP_FLOOR = 30_000_000_000;
const MAX_SCREEN_ROWS = 1000;

const RANKINGS = {
  marketCap: { sortField: "intradaymarketcap" },
  earnings: { sortField: "netincomeis.lasttwelvemonths" },
  revenue: { sortField: "totalrevenues.lasttwelvemonths" },
  employees: { sortField: "fulltimeemployees" },
};

// Spark rejects more than 20 symbols per request, so the larger floor-based
// board is split into bounded requests and fetched with limited concurrency.
const CHUNK_SIZE = 20;
const CONCURRENCY = 6;

// Three months of daily closes: enough for a 14-day RSI to be warmed up
// (Wilder's smoothing needs a good run of bars before it settles) and a
// sparkline with enough shape to read.
const RANGE = "3mo";
const RSI_PERIOD = 14;

// The board is the same for everyone and changes with the market, not with the
// reader. The upstream screener is a POST, which Next's data cache never
// stores, so it is held here instead.
const TTL = 300_000;
const boards = memo(TTL, { max: 8 });

// Building a board costs ~12s: a paged screener POST, then ~35 spark chunks
// and the country lookups for ~700 rows. With a plain TTL the reader who
// happens to arrive after it expires pays that whole cost, which is what made
// the section feel slow. So the last good board is kept past its TTL and
// served immediately while a refresh runs behind it; only the very first
// caller after a cold start waits.
let lastBoard = new Map();
let refreshing = new Map();

// `full` distinguishes the 50-row first paint from the whole enriched board,
// so the two are cached and revalidated independently.
function boardWithRevalidate(mode, full) {
  const key = full ? `${mode}:full` : `${mode}:first`;
  const build = () => buildBoard(mode, full ? Infinity : FIRST_PAGE_ROWS);
  const cached = lastBoard.get(key);
  const fresh = cached && Date.now() - cached.at < TTL;
  if (cached && !fresh && !refreshing.has(key)) {
    const run = boards(key, build)
      .then((value) => lastBoard.set(key, { at: Date.now(), value }))
      .catch(() => {})
      .finally(() => refreshing.delete(key));
    refreshing.set(key, run);
  }
  if (cached) return Promise.resolve(cached.value);
  return boards(key, build).then((value) => {
    lastBoard.set(key, { at: Date.now(), value });
    return value;
  });
}

async function runScreen(session, offset, sortField) {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v1/finance/screener?crumb=${encodeURIComponent(session.crumb)}&lang=en-US&region=US&formatted=false`,
    {
      method: "POST",
      headers: {
        "User-Agent": YAHOO_USER_AGENT,
        Cookie: session.cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        size: SCREEN_PAGE,
        offset,
        sortField,
        sortType: "DESC",
        // Companies, not funds or trusts.
        quoteType: "EQUITY",
        query: {
          operator: "AND",
          operands: [
            { operator: "eq", operands: ["region", REGION] },
            { operator: "gte", operands: ["intradaymarketcap", MARKET_CAP_FLOOR] },
          ],
        },
        userId: "",
        userIdType: "guid",
      }),
      cache: "no-store",
    }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const result = json?.finance?.result?.[0];
  if (!result) throw new Error(json?.finance?.error?.description ?? "No screener result");
  return result;
}

// Closes for a chunk of symbols, from the same spark endpoint the stock maps
// read. Downsampled for the sparkline because the row draws it about 90px
// wide - sixty points is more than that can show.
const SPARK_POINTS = 30;

function sparkline(closes) {
  if (closes.length <= SPARK_POINTS) return closes;
  const step = (closes.length - 1) / (SPARK_POINTS - 1);
  return Array.from({ length: SPARK_POINTS }, (_, i) => closes[Math.round(i * step)]);
}

async function fetchChunk(symbols) {
  const url = `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${symbols.join(",")}&range=${RANGE}&interval=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": YAHOO_USER_AGENT },
    next: { revalidate: 900 },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const out = {};
  for (const symbol of symbols) {
    const closes = (json?.[symbol]?.close ?? []).filter((c) => typeof c === "number" && c > 0);
    // RSI needs more than its own period of bars to mean anything; below that
    // the row shows no number rather than a warm-up artefact.
    if (closes.length <= RSI_PERIOD + 1) continue;
    const series = rsi(closes, RSI_PERIOD);
    const last = series[series.length - 1];
    const first = closes[0];
    out[symbol] = {
      rsi: last == null ? null : Math.round(last * 10) / 10,
      spark: sparkline(closes).map((c) => Math.round(c * 100) / 100),
      // The sparkline's own direction, so the line can be coloured by what it
      // draws rather than by the day's change.
      sparkChangePct: first ? ((closes[closes.length - 1] - first) / first) * 100 : null,
    };
  }
  return out;
}

function metricValue(quote, mode) {
  if (mode === "marketCap") return quote.marketCap ?? null;
  if (mode === "earnings") {
    return quote.netIncomeToCommon ?? quote.netIncome ?? quote["netincomeis.lasttwelvemonths"] ?? null;
  }
  if (mode === "revenue") {
    return quote.totalRevenue ?? quote["totalrevenues.lasttwelvemonths"] ?? null;
  }
  return quote.fullTimeEmployees ?? quote["fulltimeemployees"] ?? null;
}

// How many rows the first response enriches. Matches PAGE_SIZE in
// components/MarketCapRanking.jsx: the reader only ever sees one page, so
// pricing the other ~650 before showing anything is work nobody is waiting
// on. The rest arrives from a second request.
export const FIRST_PAGE_ROWS = 50;

async function buildBoard(mode, enrichLimit = Infinity) {
  const session = await yahooSession();
  const pages = [];
  let total = null;
  for (let offset = 0; offset < MAX_SCREEN_ROWS; offset += SCREEN_PAGE) {
    const result = await runScreen(session, offset, RANKINGS[mode].sortField);
    const quotes = result.quotes ?? [];
    if (total == null) total = result.total ?? null;
    pages.push(...quotes);
    if (quotes.length < SCREEN_PAGE || pages.length >= (total ?? Infinity)) break;
  }

  let rows = pages.map((q) => ({
    symbol: q.symbol,
    name: q.longName ?? q.shortName ?? q.symbol,
    market: marketOf(q.fullExchangeName),
    flag: EXCHANGE_FLAGS[q.exchange] ?? null,
    exchangeCode: q.exchange ?? null,
    price: q.regularMarketPrice ?? null,
    changePct: q.regularMarketChangePercent ?? null,
    marketCap: q.marketCap ?? null,
    [mode]: metricValue(q, mode),
    pe: q.trailingPE ?? null,
    forwardPe: q.forwardPE ?? null,
  }));

  // A row with no size can't be ranked by size - preferred lines and trusts
  // come back under EQUITY with the parent's fundamentals and no cap of their
  // own. Same reasoning as the stock screener.
  rows = rows.filter((r) => r.marketCap != null);
  rows = dropOtcDuplicates(rows);

  // One company, one row. Alphabet files two share classes that both carry the
  // company's whole market cap, so leaving both in ranks Alphabet twice and
  // counts it twice - the bigger listing stays. Rows are already cap-ordered,
  // so the first of a pair is the one to keep.
  const byName = new Set();
  rows = rows.filter((r) => {
    const key = r.name.toLowerCase();
    if (byName.has(key)) return false;
    byName.add(key);
    return true;
  });

  rows = filterByMarketCapFloor(rows, MARKET_CAP_FLOOR);
  rows = rankMarketRows(rows, mode);

  // Spark and country are the expensive half of this build (~35 chunked price
  // requests plus one profile request per symbol). Both are limited to the
  // rows this response actually enriches.
  const enriched = rows.slice(0, enrichLimit);
  const chunks = [];
  for (let i = 0; i < enriched.length; i += CHUNK_SIZE) chunks.push(enriched.slice(i, i + CHUNK_SIZE));
  const results = await pool(chunks, CONCURRENCY, (chunk) =>
    fetchChunk(chunk.map((r) => r.symbol)).catch(() => null)
  );
  const priced = Object.assign({}, ...results.filter(Boolean));

  // Company domicile, not the listing's exchange: TSM and TM trade in New
  // York but are Taiwanese and Japanese. The profile endpoint answers one
  // symbol at a time, so this rides the same bounded pool and hour-long cache
  // as the other profile reads, and falls back to the exchange's country so a
  // row is never blank because one lookup failed.
  const countries = await countriesForSymbols(enriched.map((r) => r.symbol));
  const labelled = rows.map((r) => {
    const { country, flag } = countryLabel(countries.get(r.symbol));
    return { ...r, country, flag: flag ?? r.flag };
  });

  return {
    asOf: new Date().toISOString(),
    total: total ?? rows.length,
    marketCapFloor: MARKET_CAP_FLOOR,
    // Rank is the market-cap order the board arrived in, so a row keeps its
    // "#4 by size" identity after the reader sorts by RSI or P/E.
    mode,
    rows: labelled.map((r) => ({
      ...r,
      rsi: priced[r.symbol]?.rsi ?? null,
      spark: priced[r.symbol]?.spark ?? null,
      sparkChangePct: priced[r.symbol]?.sparkChangePct ?? null,
    })),
  };
}

export async function GET(request) {
  const requestedMode = request.nextUrl.searchParams.get("mode") ?? "marketCap";
  const mode = Object.hasOwn(RANKINGS, requestedMode) ? requestedMode : "marketCap";
  // Default is the fast first-page board; the client asks for ?full=1 once it
  // has painted, to fill in the remaining rows.
  const full = request.nextUrl.searchParams.get("full") === "1";
  try {
    return Response.json(await boardWithRevalidate(mode, full), {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" },
    });
  } catch {
    return Response.json(
      { error: "The ranking is temporarily unavailable. Try again in a moment.", retryable: true },
      { status: 503 }
    );
  }
}
