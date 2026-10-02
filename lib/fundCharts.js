// The four charts on a manager's page, derived from the quarters of its book
// that lib/thirteenF.js reads.
//
// Everything here is a pure function of books and prices, so the arithmetic -
// which is the part worth being sure about - can be checked without going near
// EDGAR or Yahoo: scripts/test-fund-charts.mjs. Fetching lives in the route.
//
// A book is { period, stockValue, rows: [{ ticker, name, value }] }, newest
// first, exactly as `fundQuarterBooks` returns it.

// How many holdings the replication prices. The largest positions carry the
// book's movement and the tail is a long line of rounding errors, so this is
// where the weight stops mattering and the request count starts to - the same
// bar lib/fundReturn.js draws, for the same reason.
export const PRICED_HOLDINGS = 25;

// Below this share of the sampled book priced, the interval is a guess rather
// than an estimate and the series stops instead of inventing a number.
const MIN_PRICED = 0.5;

// ---------------------------------------------------------------------------
// 1. What the filed book did, against SPY

// One quarter's move, value-weighted across whatever priced.
//
// A holding with no price has to leave the average rather than enter it as a
// zero, which would quietly drag every quarter toward flat.
function bookMove(rows, from, to, priceAt) {
  let priced = 0;
  let weighted = 0;
  const sampled = rows.reduce((a, h) => a + h.value, 0);
  for (const h of rows) {
    const a = priceAt(h.ticker, from);
    const b = priceAt(h.ticker, to);
    if (!a || !b) continue;
    priced += h.value;
    weighted += h.value * (b / a - 1);
  }
  if (!sampled || priced < sampled * MIN_PRICED) return null;
  return weighted / priced;
}

// The book as an index against SPY, one point per quarter end.
//
// This is a replication, not a return: it holds each filing's reported weights
// until the next filing and rebalances there. A 13F says nothing about what
// was paid, nothing about shorts, options, cash or leverage, and nothing about
// the trades between two filings - so this measures the disclosed long book
// and not the fund. Both lines start at 100 on the oldest quarter end so the
// comparison is of shape rather than of level.
export function replicationSeries(books, priceAt, benchmark = "SPY") {
  // Oldest first: a performance line runs forwards.
  const quarters = [...books].reverse();
  if (quarters.length < 2) return [];

  const points = [{ period: quarters[0].period, fund: 100, benchmark: 100 }];
  let fund = 100;
  let bench = 100;

  for (let i = 0; i < quarters.length - 1; i++) {
    const from = quarters[i].period;
    const to = quarters[i + 1].period;
    const move = bookMove(quarters[i].rows.slice(0, PRICED_HOLDINGS), from, to, priceAt);
    const a = priceAt(benchmark, from);
    const b = priceAt(benchmark, to);
    // One unpriceable quarter ends the line rather than being drawn through -
    // a gap joined up is a claim about a period nothing was known about.
    if (move == null || !a || !b) break;
    fund *= 1 + move;
    bench *= b / a;
    points.push({ period: to, fund, benchmark: bench });
  }

  return points.length > 1 ? points : [];
}

// ---------------------------------------------------------------------------
// 2. The biggest holdings, quarter by quarter

// Every ticker that was in some quarter's top N, and its share of the book in
// each quarter - including the quarters it wasn't in the top N, where it still
// has a weight and a line that drops to it rather than vanishing.
export function topHoldingsByQuarter(books, top = 10) {
  const quarters = [...books].reverse();
  const named = new Set();
  for (const q of quarters) {
    for (const h of q.rows.slice(0, top)) named.add(h.ticker);
  }

  const series = [...named].map((ticker) => ({
    ticker,
    points: quarters.map((q) => {
      const total = q.rows.reduce((a, h) => a + h.value, 0);
      const held = q.rows.find((h) => h.ticker === ticker);
      return total && held ? (held.value / total) * 100 : 0;
    }),
  }));

  // Biggest average weight first, so the legend reads in the order the bands
  // are stacked rather than in whatever order the set happened to fill.
  series.sort(
    (a, b) =>
      b.points.reduce((x, y) => x + y, 0) / b.points.length -
      a.points.reduce((x, y) => x + y, 0) / a.points.length
  );

  return { periods: quarters.map((q) => q.period), series };
}

// ---------------------------------------------------------------------------
// 3. The current book as blocks

// The largest holdings of the newest quarter, with the share of the book each
// one is. Everything past the cut is dropped rather than collapsed into an
// "Other" block: this chart is about the shape of the top of the book, and one
// block worth more than all the named ones would be the only thing on it.
export function treemapHoldings(books, top = 20) {
  const book = books[0];
  if (!book) return { period: null, rows: [], covered: 0 };
  const total = book.rows.reduce((a, h) => a + h.value, 0);
  if (!total) return { period: book.period, rows: [], covered: 0 };
  const rows = book.rows.slice(0, top).map((h) => ({
    ticker: h.ticker,
    name: h.name,
    value: h.value,
    pct: (h.value / total) * 100,
  }));
  return {
    period: book.period,
    rows,
    // What share of the whole book these blocks account for, so the chart can
    // say so rather than looking like the entire fund.
    covered: rows.reduce((a, h) => a + h.pct, 0),
  };
}

// The newest book as tiles for the stock map: the position, what share of the
// book it is, and the sector and industry to group it under.
//
// Unlike the flat treemap this keeps whatever the profile lookup returned, so
// the map can group by sector the way the index maps do. A position nothing
// could be classified for is grouped under "Unclassified" rather than dropped:
// it is real money the fund reported, and leaving it out would make the tiles
// add up to less than the note above them claims.
//
// `describe` is a lookup from ticker to { sector, industry, name }.
export function mapHoldings(books, describe, top = 60) {
  const book = books[0];
  if (!book) return { period: null, rows: [], covered: 0 };
  const total = book.rows.reduce((a, h) => a + h.value, 0);
  if (!total) return { period: book.period, rows: [], covered: 0 };

  // Same ticker, one tile. A book keeps its lines apart by the whole nine
  // characters of the CUSIP - two share classes of one issuer are two
  // positions and adding them would hide one - but the map is built on the
  // symbol: it is what the tile is keyed by, priced by and linked to. So
  // Berkshire's two Lennar lines and two Liberty Live lines become one tile
  // each here, holding their combined value. Leaving them separate drew two
  // tiles with the same key and the same color, which React drops one of.
  const merged = new Map();
  for (const h of book.rows) {
    // A position with no ticker cannot be priced or linked, and the map is
    // built on the symbol - those are the odd foreign lines and private
    // placements, and they belong in the tail rather than as a blank tile.
    if (!h.ticker) continue;
    const held = merged.get(h.ticker);
    if (held) held.value += h.value;
    else merged.set(h.ticker, { ticker: h.ticker, name: h.name, value: h.value });
  }

  const rows = [...merged.values()]
    // Merging can reorder: two mid-sized lines of one issuer together outweigh
    // a single larger one, and the map wants the biggest tiles first.
    .sort((a, b) => b.value - a.value)
    .slice(0, top)
    .map((h) => {
      const info = describe(h.ticker);
      return {
        symbol: h.ticker,
        name: info?.name || h.name,
        sector: info?.sector || "Unclassified",
        industry: info?.industry || null,
        value: h.value,
        pct: (h.value / total) * 100,
      };
    });

  return {
    period: book.period,
    rows,
    // What share of the whole book these tiles account for, so the map can say
    // so rather than looking like the entire fund.
    covered: rows.reduce((a, h) => a + h.pct, 0),
  };
}

// ---------------------------------------------------------------------------
// 4. Where the book sits, quarter by quarter

// Each quarter's book split by sector, as a percentage of that quarter.
//
// `sectorOf` is a lookup from ticker to sector name; anything it has no answer
// for lands in "Other" rather than being dropped, so every quarter still adds
// up to its whole book.
export function sectorsByQuarter(books, sectorOf) {
  const quarters = [...books].reverse();
  const names = new Set();
  const columns = quarters.map((q) => {
    const total = q.rows.reduce((a, h) => a + h.value, 0);
    const by = new Map();
    for (const h of q.rows) {
      const sector = sectorOf(h.ticker) || "Other";
      by.set(sector, (by.get(sector) ?? 0) + h.value);
      names.add(sector);
    }
    return { total, by };
  });

  const series = [...names].map((sector) => ({
    sector,
    points: columns.map((c) => (c.total ? ((c.by.get(sector) ?? 0) / c.total) * 100 : 0)),
  }));

  // Largest sector first, and "Other" last however big it is - it isn't a
  // sector and shouldn't sit among them in the legend.
  series.sort((a, b) => {
    if (a.sector === "Other") return 1;
    if (b.sector === "Other") return -1;
    const mean = (s) => s.points.reduce((x, y) => x + y, 0) / s.points.length;
    return mean(b) - mean(a);
  });

  return { periods: quarters.map((q) => q.period), series };
}
