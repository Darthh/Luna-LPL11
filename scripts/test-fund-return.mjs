// Self-check for the estimated 13F return: `node scripts/test-fund-return.mjs`.
//
// The prices are stubbed - what's worth pinning down is the weighting, and it
// has one failure that looks like an answer: a holding Yahoo can't price must
// leave the average, not enter it as a flat zero. Get that wrong and a book
// whose biggest position didn't resolve reports a number several points closer
// to zero than the truth, with nothing on the page to say so.
import assert from "node:assert/strict";
import { estimatedYtd } from "../lib/fundReturn.js";

const h = (ticker, value) => ({ ticker, value });
const from = (map) => async (t) => (t in map ? map[t] : null);
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

// Weighted by value, not by position count: the $90 holding decides this.
near(
  await estimatedYtd([h("A", 90), h("B", 10)], from({ A: 10, B: -50 })),
  (90 * 10 + 10 * -50) / 100,
  "value weighted"
);

// An unpriced holding leaves the average. Two thirds of this book priced at
// +30%, so the answer is +30% - not the +20% a zero for the third would give.
near(await estimatedYtd([h("A", 50), h("B", 50), h("C", 50)], from({ A: 30, B: 30 })), 30, "unpriced dropped");

// Under half the book priced isn't an estimate. Here only the small tail
// answered, so there's no number to report.
assert.equal(await estimatedYtd([h("A", 90), h("B", 10)], from({ B: 12 })), null, "too little priced");
// Exactly half is the boundary and counts as enough.
near(await estimatedYtd([h("A", 50), h("B", 50)], from({ A: 8 })), 8, "half is enough");

// Holdings with no ticker never reach the price lookup - the ones that stayed
// issuer names are funds and trusts, and there's nothing to quote them by.
near(
  await estimatedYtd([{ ticker: null, value: 1000 }, h("A", 10)], from({ A: 5 })),
  5,
  "untickered ignored"
);
assert.equal(await estimatedYtd([{ ticker: null, value: 1000 }], from({})), null, "nothing to price");
assert.equal(await estimatedYtd([], from({})), null, "empty book");

// Only the top holdings are sampled, so a long tail can't outvote the book.
// Twenty-five at +10, then a hundred at -90 that are never asked about.
const book = [
  ...Array.from({ length: 25 }, (_, i) => h(`T${i}`, 100)),
  ...Array.from({ length: 100 }, (_, i) => h(`X${i}`, 1)),
];
near(await estimatedYtd(book, async (t) => (t.startsWith("T") ? 10 : -90)), 10, "tail not sampled");

// Every price failing is "n/a", not a divide by zero.
assert.equal(await estimatedYtd([h("A", 10), h("B", 10)], from({})), null, "all unpriced");

console.log("fund return estimate: ok");
