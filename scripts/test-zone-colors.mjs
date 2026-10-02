// The F&G chart line's extreme colors: red below 10, green above 67.
import assert from "node:assert/strict";
import { fgLineColor } from "../lib/zone.js";

const RED = "#8b0f14";
const GREEN = "#34c759";

assert.equal(fgLineColor(0), RED);
assert.equal(fgLineColor(9.9), RED);
// The boundaries themselves are not extreme: 10 is not "below 10".
assert.equal(fgLineColor(10), undefined);
assert.equal(fgLineColor(67), undefined);
assert.equal(fgLineColor(67.1), GREEN);
assert.equal(fgLineColor(100), GREEN);

console.log("zone colors ok");


// Zoom ranges. There is no 10y button (the series is only ~6 years long), so
// an unknown range must fall back to the whole series rather than throwing.
import { rangeStartIndex } from "../lib/zone.js";

const days = (n) =>
  Array.from({ length: n }, (_, i) =>
    new Date(Date.UTC(2026, 8, 1) - (n - 1 - i) * 86400000).toISOString().slice(0, 10)
  );

const series = days(365 * 6);
assert.equal(rangeStartIndex(series, "10y"), 0);
assert.equal(rangeStartIndex(series, "all"), 0);
// 5y is the deepest real button and must actually cut a six-year series.
assert.ok(rangeStartIndex(series, "5y") > 0);
// A range longer than the data returns the whole thing, not an error.
assert.equal(rangeStartIndex(days(200), "5y"), 0);

console.log("zoom ranges ok");
