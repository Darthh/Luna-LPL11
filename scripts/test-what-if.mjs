// node scripts/test-what-if.mjs
import assert from "node:assert/strict";
import { STAKE, buildComparison, fitPercentAxis, toSeries } from "../lib/whatIf.js";

const DAY = 86400;
const t0 = Date.UTC(2024, 0, 2) / 1000;
const series = (closes) => toSeries(closes.map((c, i) => ({ t: t0 + i * DAY, c })));

const by = new Map([
  ["SPY", series([100, 105, 110])],
  ["AAA", series([10, 12, 20])],
  ["BBB", series([50, 50, 25])],
]);

// Equal weight: +100% and -50% average to a flat book, against SPY's +10%.
const spy = [{ label: "S&P 500", tickers: ["SPY"] }];
const equal = buildComparison(
  by,
  [
    { symbol: "AAA", weight: 1 },
    { symbol: "BBB", weight: 1 },
  ],
  spy
);
assert.equal(equal.dates.length, 3);
assert.equal(equal.lines[0].values[0], STAKE);
assert.equal(Math.round(equal.portfolioPct), 25);
assert.equal(Math.round(equal.lines[1].changePct), 10);

// Weights are relative, not percentages: 3/1 and 75/25 are one portfolio.
const a = buildComparison(by, [
  { symbol: "AAA", weight: 3 },
  { symbol: "BBB", weight: 1 },
]);
const b = buildComparison(by, [
  { symbol: "AAA", weight: 75 },
  { symbol: "BBB", weight: 25 },
]);
// A basket with nothing to compare against is still a chart of its own.
assert.equal(a.lines.length, 1);
assert.equal(a.portfolioPct.toFixed(6), b.portfolioPct.toFixed(6));
assert.equal(Math.round(a.legs[0].weight), 75);
assert.equal(Math.round(a.legs[0].pct), 100);

// A holding that only priced the last two days trims the window for everyone,
// so nothing starts at a price it never traded at.
const young = new Map(by);
young.set("NEW", toSeries([{ t: t0 + DAY, c: 5 }, { t: t0 + 2 * DAY, c: 10 }]));
const trimmed = buildComparison(young, [{ symbol: "NEW", weight: 1 }], spy);
assert.deepEqual(trimmed.dates, ["2024-01-03", "2024-01-04"]);
assert.equal(Math.round(trimmed.portfolioPct), 100);
assert.equal(Math.round(trimmed.lines[1].changePct), 5);

// Nothing to plot rather than a crash: no picks at all, or a comparison
// naming a ticker that never priced (dropped, the rest still draws).
assert.equal(buildComparison(by, [{ symbol: "AAA", weight: 0 }]), null);
const ghost = buildComparison(by, [{ symbol: "AAA", weight: 1 }], [{ label: "Ghost", tickers: ["ZZZ"] }]);
assert.equal(ghost.lines.length, 1);

// The plotted lines are the same numbers as the headline percentages.
assert.equal(equal.lines[0].series[0], 0);
assert.equal(equal.lines[0].series.at(-1).toFixed(6), equal.portfolioPct.toFixed(6));
assert.equal(equal.lines[1].series.at(-1).toFixed(6), equal.lines[1].changePct.toFixed(6));
// A leg is worth its slice of the stake, not the whole of it: 75% of the
// money in a name that doubled is 1.5x the stake, not 2x.
assert.equal(Math.round(a.legs[0].value), STAKE * 1.5);
assert.equal(Math.round(a.legs[0].basis), STAKE * 0.75);

// A preset joins as a third line, equally weighted across its own tickers,
// without touching what the portfolio line holds.
const withPreset = buildComparison(
  by,
  [{ symbol: "AAA", weight: 1 }],
  [...spy, { label: "Both", tickers: ["AAA", "BBB"] }]
);
assert.equal(withPreset.lines.length, 3);
assert.equal(withPreset.lines[2].label, "Both");
assert.equal(Math.round(withPreset.lines[2].changePct), 25);
assert.equal(Math.round(withPreset.portfolioPct), 100);

// A preset holding something that only priced late trims every line with it,
// so all three still start from the same day.
const late = new Map(by);
late.set("NEW", toSeries([{ t: t0 + DAY, c: 5 }, { t: t0 + 2 * DAY, c: 10 }]));
const trimmedByPreset = buildComparison(
  late,
  [{ symbol: "AAA", weight: 1 }],
  [...spy, { label: "Young", tickers: ["NEW"] }]
);
assert.deepEqual(trimmedByPreset.dates, ["2024-01-03", "2024-01-04"]);
// And the page is told which line did the trimming.
assert.deepEqual(trimmedByPreset.limitedBy, ["NEW"]);
assert.deepEqual(equal.limitedBy, [], "nothing is trimming a full window");
assert.ok(trimmedByPreset.lines.every((l) => l.series[0] === 0));

// A fitted axis keeps zero inside it, pads past the extremes, and steps in
// numbers worth printing.
const axis = fitPercentAxis([[0, 40, 125]]);
assert.ok(axis.min < 0 && axis.max > 125);
assert.equal(axis.step, 20);
assert.equal(axis.decimals, 0);
const flat = fitPercentAxis([[0, 0, 0]]);
assert.ok(flat.min < 0 && flat.max > 0, "a flat line still gets an axis with height");

console.log("portfolio-comparison ok");
