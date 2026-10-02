// Self-check for a manager's chart data: `node scripts/test-fund-charts.mjs`.
//
// The part worth pinning down is that none of these four quietly invent a
// number. A 13F is a snapshot of weights, so a replication of it is only worth
// drawing where the holdings actually priced - and a chart that fills a gap by
// joining the line across it is making a claim about a period nothing was
// known about.
import assert from "node:assert/strict";
import {
  replicationSeries,
  sectorsByQuarter,
  topHoldingsByQuarter,
  mapHoldings,
  treemapHoldings,
} from "../lib/fundCharts.js";

// Newest first, the way the filings are read.
const books = [
  { period: "2026-06-30", stockValue: 300, rows: [{ ticker: "AAA", name: "A", value: 200 }, { ticker: "BBB", name: "B", value: 100 }] },
  { period: "2026-03-31", stockValue: 200, rows: [{ ticker: "AAA", name: "A", value: 100 }, { ticker: "BBB", name: "B", value: 100 }] },
];

// A price table: ticker → quarter end → close.
const prices = {
  AAA: { "2026-03-31": 100, "2026-06-30": 120 },
  BBB: { "2026-03-31": 100, "2026-06-30": 90 },
  SPY: { "2026-03-31": 100, "2026-06-30": 105 },
};
const priceAt = (t, d) => prices[t]?.[d] ?? null;

// --- 1. Replication ---------------------------------------------------------

const series = replicationSeries(books, priceAt);
assert.deepEqual(
  series.map((p) => p.period),
  ["2026-03-31", "2026-06-30"],
  "runs forwards from the oldest quarter"
);
assert.equal(series[0].fund, 100, "both lines start level");
assert.equal(series[0].benchmark, 100);
// Q1 book was half AAA, half BBB: (+20% + -10%) / 2 = +5%.
assert.equal(series[1].fund, 105);
assert.equal(series[1].benchmark, 105);

// The weights are the ones filed at the START of the interval, not the end.
// Getting this backwards is the classic way to accidentally chart hindsight:
// the Q2 book is 2/3 AAA, which would have returned +10% rather than +5%.
assert.notEqual(series[1].fund, 110, "must not weight by the book filed at the end");

// A quarter nothing prices ends the line rather than being drawn through.
const blind = replicationSeries(books, (t, d) => (d === "2026-06-30" ? null : 100));
assert.deepEqual(blind, [], "no priced end means no line at all");

// Most of the book unpriced is a guess, not an estimate.
const lopsided = [
  { period: "2026-06-30", rows: [{ ticker: "AAA", value: 100 }, { ticker: "BBB", value: 100 }] },
  { period: "2026-03-31", rows: [{ ticker: "AAA", value: 900 }, { ticker: "BBB", value: 100 }] },
];
const blindToA = (t, d) => (t === "AAA" ? null : (prices[t]?.[d] ?? null));
assert.deepEqual(replicationSeries(lopsided, blindToA), [], "under the priced floor the series stops");

// The floor is "at least half", not "more than half" - the same boundary
// lib/fundReturn.js draws, and the two have to agree or the same book is an
// estimate on one page and n/a on the other. Here AAA and BBB are equal, so
// pricing one of them is exactly half and still counts.
const exactlyHalf = replicationSeries(books, blindToA);
assert.equal(exactlyHalf.length, 2, "exactly half priced is still an estimate");
assert.equal(exactlyHalf[1].fund, 90, "and it is weighted across what priced");

// One quarter is a point, not a performance.
assert.deepEqual(replicationSeries(books.slice(0, 1), priceAt), []);

// --- 2. Top holdings per quarter --------------------------------------------

const top = topHoldingsByQuarter(books, 1);
assert.deepEqual(top.periods, ["2026-03-31", "2026-06-30"]);
// Only the top 1 of each quarter is named, but both quarters are AAA-led, so
// AAA is the only band - and it carries its real weight in each quarter.
assert.deepEqual(top.series.map((s) => s.ticker), ["AAA"]);
assert.deepEqual(top.series[0].points, [50, (200 / 300) * 100]);

// A ticker that leaves the top N keeps its weight in the quarters it's still
// held, rather than dropping to zero and reading as sold.
const fell = topHoldingsByQuarter(
  [
    { period: "2026-06-30", rows: [{ ticker: "AAA", value: 90 }, { ticker: "BBB", value: 10 }] },
    { period: "2026-03-31", rows: [{ ticker: "BBB", value: 90 }, { ticker: "AAA", value: 10 }] },
  ],
  1
);
assert.deepEqual(fell.series.find((s) => s.ticker === "BBB").points, [90, 10]);

// --- 3. Treemap -------------------------------------------------------------

const map = treemapHoldings(books, 1);
assert.equal(map.period, "2026-06-30", "the newest quarter, not the oldest");
assert.deepEqual(map.rows.map((r) => r.ticker), ["AAA"]);
assert.equal(Math.round(map.covered), 67, "says how much of the book it covers");
assert.deepEqual(treemapHoldings([], 20), { period: null, rows: [], covered: 0 });

// --- 3b. The holdings map ---------------------------------------------------

const describe = (t) =>
  ({
    AAA: { name: "Alpha Inc", sector: "Technology", industry: "Software" },
    BBB: { name: "Beta Corp", sector: "Healthcare", industry: "Biotech" },
  })[t] ?? null;

const drawn = mapHoldings(books, describe, 10);
assert.equal(drawn.period, "2026-06-30", "the newest quarter, not the oldest");
assert.deepEqual(
  drawn.rows.map((r) => [r.symbol, r.sector, r.industry]),
  [
    ["AAA", "Technology", "Software"],
    ["BBB", "Healthcare", "Biotech"],
  ]
);

// One tile per ticker. A book keeps two share classes of an issuer apart by
// CUSIP, but the map is keyed and priced by symbol - Berkshire's two Lennar
// lines drew two tiles with the same key, and React drops one of those.
const twoClasses = mapHoldings(
  [
    {
      period: "2026-06-30",
      rows: [
        { ticker: "LEN", name: "Lennar", value: 119 },
        { ticker: "OTH", name: "Other", value: 78 },
        { ticker: "LEN", name: "Lennar", value: 3 },
      ],
    },
  ],
  () => null,
  10
);
assert.deepEqual(twoClasses.rows.map((r) => r.symbol), ["LEN", "OTH"], "merged, and re-sorted");
assert.equal(twoClasses.rows[0].value, 122, "the two lines add up");

// A position nothing could be classified for is still real money the fund
// reported, so it gets a tile rather than being dropped.
assert.equal(mapHoldings(books, () => null, 10).rows[0].sector, "Unclassified");

// A line with no ticker cannot be priced, linked or keyed, so it is not a tile.
const untickered = mapHoldings(
  [{ period: "2026-06-30", rows: [{ ticker: null, name: "Private placement", value: 50 }, { ticker: "AAA", value: 50 }] }],
  () => null,
  10
);
assert.deepEqual(untickered.rows.map((r) => r.symbol), ["AAA"]);

assert.deepEqual(mapHoldings([], () => null, 20), { period: null, rows: [], covered: 0 });

// --- 4. Sectors -------------------------------------------------------------

const sectors = sectorsByQuarter(books, (t) => (t === "AAA" ? "Tech" : null));
assert.deepEqual(sectors.periods, ["2026-03-31", "2026-06-30"]);
// Unknown sectors land in "Other" rather than being dropped, so each quarter
// still adds up to the whole book.
assert.deepEqual(sectors.series.map((s) => s.sector), ["Tech", "Other"]);
for (let i = 0; i < sectors.periods.length; i++) {
  const sum = sectors.series.reduce((a, s) => a + s.points[i], 0);
  assert.ok(Math.abs(sum - 100) < 1e-9, `quarter ${i} adds up to its whole book`);
}
// "Other" sorts last however big it is.
const mostlyOther = sectorsByQuarter(
  [{ period: "2026-06-30", rows: [{ ticker: "AAA", value: 1 }, { ticker: "ZZZ", value: 99 }] }],
  (t) => (t === "AAA" ? "Tech" : null)
);
assert.deepEqual(mostlyOther.series.map((s) => s.sector), ["Tech", "Other"]);

// Nothing to chart is empty, not a crash.
assert.deepEqual(topHoldingsByQuarter([], 10), { periods: [], series: [] });
assert.deepEqual(sectorsByQuarter([], () => null), { periods: [], series: [] });

console.log("fund charts: ok");
