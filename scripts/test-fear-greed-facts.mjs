// Self-check for the server-rendered index facts: `node scripts/test-fear-greed-facts.mjs`.
//
// Everything a crawler or an AI assistant can quote about this site comes out
// of fearGreedFacts/headlineSentence, and it is rendered into static HTML that
// nobody looks at again. So the failures worth pinning are the silent ones: a
// wrong delta sign, a lookback that grabs the wrong day, and the empty-series
// case regressing back into printing "n/a" or "NaN" at a crawler.
import assert from "node:assert/strict";
import { fearGreedFacts, headlineSentence } from "../lib/fearGreedFacts.js";

// Build a daily series ending on a known date so the lookbacks are checkable.
function seriesEndingAt(endIso, days, valueAt) {
  const dates = [];
  const values = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(`${endIso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
    values.push(valueAt(i));
  }
  return { dates, values };
}

// A rising series: today 65, yesterday 61.
{
  const { dates, values } = seriesEndingAt("2026-08-14", 400, (back) => 65 - back * 4);
  const facts = fearGreedFacts(dates, values);

  assert.equal(facts.rounded, 65);
  assert.equal(facts.zone, "Bullish");
  assert.equal(facts.lastDate, "2026-08-14");
  assert.equal(facts.prevClose, 61);
  assert.equal(facts.delta, 4, "delta is today minus previous close, positive when rising");

  const sentence = headlineSentence(facts);
  assert.equal(
    sentence,
    "The market sentiment reading is 65 (Bullish) as of August 14, 2026, up 4 points from the previous close.",
  );
  // The whole point of the sentence is that it is quotable as-is.
  assert.ok(!/NaN|undefined|null|n\/a/i.test(sentence));
}

// A falling series reports "down", and a one-point move is singular.
{
  const { dates, values } = seriesEndingAt("2026-08-14", 30, (back) => 20 + back);
  const facts = fearGreedFacts(dates, values);
  assert.equal(facts.delta, -1);
  assert.equal(facts.zone, "Very Bearish");
  assert.ok(
    headlineSentence(facts).endsWith("down 1 point from the previous close."),
    "a single point is not 'points'",
  );
}

// Flat series: unchanged, not "up 0 points".
{
  const { dates, values } = seriesEndingAt("2026-08-14", 30, () => 50);
  const facts = fearGreedFacts(dates, values);
  assert.equal(facts.delta, 0);
  assert.equal(facts.zone, "Neutral");
  assert.ok(headlineSentence(facts).includes("unchanged from the previous close"));
}

// Lookbacks land on the right calendar days, not on an off-by-one neighbour.
{
  // value == the day-of-month, so the expected lookback value is readable.
  const { dates, values } = seriesEndingAt("2026-08-14", 400, (back) => {
    const d = new Date("2026-08-14T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - back);
    return d.getUTCDate();
  });
  const facts = fearGreedFacts(dates, values);
  const byLabel = Object.fromEntries(facts.items.map((i) => [i.label, i.value]));

  assert.equal(byLabel["1 week ago"], 7, "2026-08-07");
  assert.equal(byLabel["1 month ago"], 14, "2026-07-14");
  assert.equal(byLabel["3 months ago"], 14, "2026-05-14");
  assert.equal(byLabel["1 year ago"], 14, "2025-08-14");
  assert.equal(facts.yearAgo.value, 14);
}

// Empty / missing series must produce no facts at all, so the page renders its
// explicit "unavailable" copy rather than a sentence full of NaN.
{
  assert.equal(fearGreedFacts([], []), null);
  assert.equal(fearGreedFacts(undefined, undefined), null);
  assert.equal(fearGreedFacts(["2026-08-14"], []), null);
  assert.ok(!/NaN|undefined/.test(headlineSentence(null)));
}

// Single-reading series: no previous close, so no delta and no move clause.
{
  const facts = fearGreedFacts(["2026-08-14"], [42]);
  assert.equal(facts.delta, null);
  assert.equal(
    headlineSentence(facts),
    "The market sentiment reading is 42 (Bearish) as of August 14, 2026.",
  );
}

console.log("fear-greed facts: all checks passed");
