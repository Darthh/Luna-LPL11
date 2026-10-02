// Self-check for the chart's zoom ranges: `node scripts/test-zone-range.mjs`.
//
// The 5y button is only honest if three separate things stay in sync: the
// range case here, how far back lib/fearGreed.js asks upstream for, and the
// outputsize on the price route. If any one of them shrinks back, the button
// still renders and still "works" - it just quietly shows less than 5 years,
// which is the kind of failure nobody notices. These assertions pin the slicing
// half of that; the fetch depths carry comments pointing back here.
import assert from "node:assert/strict";
import { rangeStartIndex } from "../lib/zone.js";

// Daily (calendar-day) series ending on a fixed date.
function series(endIso, days) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(`${endIso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// Six years of history: each range starts at roughly the right offset.
{
  const dates = series("2026-08-15", 6 * 365);
  const startOf = (r) => dates[rangeStartIndex(dates, r)];

  assert.equal(startOf("5y"), "2021-08-15");
  assert.equal(startOf("3y"), "2023-08-15");
  assert.equal(startOf("2y"), "2024-08-15");
  assert.equal(startOf("1y"), "2025-08-15");
  assert.equal(startOf("6m"), "2026-02-15");
  assert.equal(startOf("ytd"), "2026-01-01");
  assert.equal(rangeStartIndex(dates, "all"), 0);

  // 5y must reach strictly further back than 3y, which is the whole point of
  // the button and the thing that silently breaks if the feed depth shrinks.
  assert.ok(rangeStartIndex(dates, "5y") < rangeStartIndex(dates, "3y"));
}

// A series shorter than the requested range shows everything it has rather
// than erroring or returning -1.
{
  const dates = series("2026-08-15", 400);
  assert.equal(rangeStartIndex(dates, "5y"), 0);
  assert.equal(rangeStartIndex(dates, "3y"), 0);
}

// Empty series: index 0, so slice() yields an empty array instead of throwing.
assert.equal(rangeStartIndex([], "5y"), 0);

console.log("zone ranges: all checks passed");
