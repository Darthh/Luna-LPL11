// Self-check for the screener's exchange label: `node scripts/test-market.mjs`.
// The table matches by prefix and takes the first hit, so its order is load-
// bearing in a way nothing about reading it makes obvious. Get it wrong and
// every NYSE Arca and NYSE American row quietly relabels itself "NYSE" - a
// wrong answer that looks exactly like a right one.
import assert from "node:assert/strict";
import * as market from "../lib/market.js";

const {
  dropOtcDuplicates,
  filterByMarketCapFloor,
  formatUsdPrice,
  marketOf,
  paginateMarketRows,
  rankMarketRows,
} = market;

// The tier suffix is what the prefix match exists to strip.
assert.equal(marketOf("NasdaqGS"), "Nasdaq");
assert.equal(marketOf("NasdaqGM"), "Nasdaq");
assert.equal(marketOf("NasdaqCM"), "Nasdaq");
assert.equal(marketOf("NASDAQ"), "Nasdaq");

// The ones the ordering protects.
assert.equal(marketOf("NYSE"), "NYSE");
assert.equal(marketOf("NYSEArca"), "NYSE Arca");
assert.equal(marketOf("NYSEAmerican"), "NYSE American");

assert.equal(marketOf("BATS"), "Cboe BZX");
assert.equal(marketOf("Cboe BZX"), "Cboe BZX");
assert.equal(marketOf("OTC Markets"), "OTC");
assert.equal(marketOf("Pink Sheets"), "OTC");

// A market the table hasn't met shows itself rather than vanishing.
assert.equal(marketOf("Toronto"), "Toronto");

// A row with no exchange renders no chip at all.
assert.equal(marketOf(null), null);
assert.equal(marketOf(undefined), null);
assert.equal(marketOf(""), null);

console.log("ok - exchange labels");

// ---------------------------------------------------------------------------
// Dropping a company's OTC line when it also has a real US listing. Every case
// below is a real pair out of one 250-row screen of Yahoo's US region.
const symbols = (rows) => dropOtcDuplicates(rows).map((r) => r.symbol);

const toyota = [
  { symbol: "TM", name: "Toyota Motor Corporation", exchangeCode: "NYQ" },
  { symbol: "TOYOF", name: "Toyota Motor Corporation", exchangeCode: "PNK" },
];
assert.deepEqual(symbols(toyota), ["TM"]);
// Order of arrival doesn't decide it - the listing does.
assert.deepEqual(symbols([...toyota].reverse()), ["TM"]);

// The suffix is exactly what the name match has to see through.
assert.deepEqual(
  symbols([
    { symbol: "SONY", name: "Sony Group Corporation", exchangeCode: "NYQ" },
    { symbol: "SNEJF", name: "Sony Group Corp", exchangeCode: "PNK" },
  ]),
  ["SONY"]
);

// Two share classes are two securities, not a duplicate, and neither is OTC.
assert.deepEqual(
  symbols([
    { symbol: "GOOG", name: "Alphabet Inc.", exchangeCode: "NMS" },
    { symbol: "GOOGL", name: "Alphabet Inc.", exchangeCode: "NMS" },
  ]),
  ["GOOG", "GOOGL"]
);

// Nothing here ever listed in the US, so dropping either one would drop the
// only way to screen Roche at all.
assert.deepEqual(
  symbols([
    { symbol: "RHHBY", name: "Roche Holding AG", exchangeCode: "OQX" },
    { symbol: "RHHBF", name: "Roche Holding AG", exchangeCode: "OQX" },
  ]),
  ["RHHBY", "RHHBF"]
);

// Every OTC tier Yahoo hands back counts as OTC, not just OTCPK.
assert.deepEqual(
  symbols([
    { symbol: "NVS", name: "Novartis AG", exchangeCode: "NYQ" },
    { symbol: "NVSEF", name: "Novartis AG", exchangeCode: "OID" },
  ]),
  ["NVS"]
);

// Unrelated companies stay unrelated, and the rest of the screen keeps its
// market-cap order.
assert.deepEqual(
  symbols([
    { symbol: "AAPL", name: "Apple Inc.", exchangeCode: "NMS" },
    { symbol: "TM", name: "Toyota Motor Corporation", exchangeCode: "NYQ" },
    { symbol: "TOYOF", name: "Toyota Motor Corporation", exchangeCode: "PNK" },
    { symbol: "NSRGY", name: "Nestlé S.A.", exchangeCode: "OID" },
  ]),
  ["AAPL", "TM", "NSRGY"]
);

console.log("ok - OTC duplicate lines");

// The ranking promises to include the full $30B boundary, while excluding the
// first smaller company returned by the cap-ordered Yahoo screen.
assert.equal(typeof filterByMarketCapFloor, "function", "market-cap floor helper is exported");
assert.deepEqual(
  filterByMarketCapFloor(
    [
      { symbol: "BIG", marketCap: 31_000_000_000 },
      { symbol: "EDGE", marketCap: 30_000_000_000 },
      { symbol: "SMALL", marketCap: 29_999_999_999 },
      { symbol: "UNKNOWN", marketCap: null },
    ],
    30_000_000_000
  ).map((row) => row.symbol),
  ["BIG", "EDGE"]
);

assert.equal(typeof formatUsdPrice, "function", "USD price formatter is exported");
assert.equal(formatUsdPrice(1234.5), "$1,234.50");
assert.equal(formatUsdPrice(null), "n/a");

console.log("ok - market-cap floor and USD prices");

assert.equal(typeof rankMarketRows, "function", "metric ranking helper is exported");
assert.deepEqual(
  rankMarketRows(
    [
      { symbol: "A", marketCap: 50, revenue: 20 },
      { symbol: "B", marketCap: 40, revenue: null },
      { symbol: "C", marketCap: 30, revenue: 90 },
    ],
    "revenue"
  ).map((row) => [row.symbol, row.rank]),
  [["C", 1], ["A", 2], ["B", 3]],
  "the selected metric sets global rank and missing values stay last"
);

assert.equal(typeof paginateMarketRows, "function", "market pagination helper is exported");
const numbered = Array.from({ length: 205 }, (_, index) => ({ symbol: String(index + 1) }));
assert.deepEqual(
  paginateMarketRows(numbered, 2, 100),
  { page: 2, pageCount: 3, rows: numbered.slice(100, 200) },
  "a page contains exactly 100 rows"
);
assert.deepEqual(
  paginateMarketRows(numbered, 99, 100),
  { page: 3, pageCount: 3, rows: numbered.slice(200) },
  "an out-of-range page clamps to the final section"
);

console.log("ok - metric ranking and 100-row pagination");
