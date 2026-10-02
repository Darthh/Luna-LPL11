// The search-snippet rule: meta descriptions must not spend their ~160
// characters on the day's move against the previous close.
import assert from "node:assert/strict";
import { headlineSentence } from "../lib/fearGreedFacts.js";

const flat = { rounded: 45, zone: "Bearish", lastDate: "2026-09-01", delta: 0 };
const up = { ...flat, delta: 3 };
const down = { ...flat, delta: -1 };

// On the page, the comparison stays.
assert.ok(headlineSentence(flat).includes("unchanged from the previous close"));
assert.ok(headlineSentence(up).includes("up 3 points from the previous close"));
assert.ok(headlineSentence(down).includes("down 1 point from the previous close"));

// In a description, it never appears - flat, up or down.
for (const facts of [flat, up, down]) {
  const s = headlineSentence(facts, { move: false });
  assert.ok(!s.includes("previous close"), `leaked: ${s}`);
  assert.equal(s, "The market sentiment reading is 45 (Bearish) as of September 1, 2026.");
}

// The point of dropping it: what the site does has to survive Google's cut.
const tail = " Luna Terminal is a free financial research terminal for traders and financial advisors.";
const shown = (headlineSentence(flat, { move: false }) + tail).slice(0, 160);
assert.ok(shown.includes("free financial research terminal"), shown);

assert.ok(headlineSentence(null, { move: false }).includes("temporarily unavailable"));

console.log("headline sentence ok");
