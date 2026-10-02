// Self-check for the market-wide 13F leaderboards: `node scripts/test-hedge-aggregate.mjs`.
//
// The part worth pinning down is that the two tables answer two different
// questions. "Most owned" is a stock of value and "increased" is a flow, and
// mixing them up produces a table that looks right - the mega caps everyone
// holds - while saying nothing about what anyone actually bought.
import assert from "node:assert/strict";
import { rankAggregates } from "../lib/hedgeFundAggregate.js";

const row = (ticker, value, added = 0, extra = {}) => ({
  ticker,
  name: ticker,
  value,
  added,
  reduced: false,
  isNew: false,
  ...extra,
});

const { increased, mostOwned } = rankAggregates([
  // Fund A: huge in AAPL and holding it flat, small in MSFT and buying.
  [row("AAPL", 100e9), row("MSFT", 1e9, 900e6)],
  // Fund B: also holds AAPL, and trimmed it.
  [row("AAPL", 50e9, 0, { reduced: true }), row("MSFT", 2e9, 1e9)],
  // Fund C: opened MSFT this quarter.
  [row("MSFT", 3e9, 3e9, { isNew: true })],
]);

// Owned is the value held, so the flat mega position leads it.
assert.deepEqual(
  mostOwned.map((e) => e.ticker),
  ["AAPL", "MSFT"]
);
assert.equal(mostOwned[0].value, 150e9);
assert.equal(mostOwned[0].funds, 2);
assert.equal(mostOwned[0].reduces, 1);
assert.equal(mostOwned[0].adds, 0);

// Increased is the value bought, so the one nobody touched drops off entirely
// rather than leading on size.
assert.deepEqual(
  increased.map((e) => e.ticker),
  ["MSFT"]
);
const msft = increased[0];
assert.equal(msft.added, 4.9e9);
assert.equal(msft.adds, 3, "three managers bought");
assert.equal(msft.funds, 3, "three managers hold it");
assert.equal(msft.opened, 1, "one of them opened the position");

// A manager reporting one ticker on several lines is still one manager. The
// value adds up, the counters don't.
const classes = rankAggregates([
  [
    row("GOOGL", 10e9, 1e9),
    row("GOOGL", 2e9, 2e9, { isNew: true }),
    row("GOOGL", 1e9, 0, { reduced: true }),
  ],
]);
const googl = classes.mostOwned[0];
assert.equal(googl.value, 13e9, "every line counts toward what's held");
assert.equal(googl.funds, 1, "one manager, however many lines it files");
assert.equal(googl.adds, 1);
assert.equal(googl.reduces, 1, "added one class and trimmed another");
assert.equal(googl.opened, 0, "a new class of a name already held isn't new");
assert.equal(classes.increased[0].added, 3e9);

// Twenty is the cut, and it's a cut of the ranking rather than of the input.
const many = rankAggregates([
  Array.from({ length: 30 }, (_, i) => row(`T${i}`, i * 1e9, i * 1e8)),
]);
assert.equal(many.mostOwned.length, 20);
assert.equal(many.mostOwned[0].ticker, "T29");
assert.equal(many.increased.length, 20);
assert.equal(many.increased[19].ticker, "T10");

// A ticker held everywhere but bought nowhere never reaches the added table,
// however big it is.
assert.deepEqual(rankAggregates([[row("BRK.B", 1e12)]]).increased, []);

// Nothing to rank is an empty table, not a crash.
assert.deepEqual(rankAggregates([]), { increased: [], mostOwned: [] });
assert.deepEqual(rankAggregates([[], []]), { increased: [], mostOwned: [] });

console.log("hedge fund aggregates: ok");
