// Self-check for the shared formatters: `node scripts/test-num.mjs`.
// These replaced private copies in four components, so what matters is that
// the output is byte-for-byte what those copies produced - a portfolio total
// that quietly gains or loses a decimal place looks like a real number.
import assert from "node:assert/strict";
import { clamp, money, pct } from "../lib/num.js";

// Whole dollars by default, cents when asked. Both were in use.
assert.equal(money(12481.2), "$12,481");
assert.equal(money(12481.2, 2), "$12,481.20");
assert.equal(money(0), "$0");

// Signed both ways: an unsigned gain reads as a level rather than a change.
assert.equal(pct(3.456), "+3.46%");
assert.equal(pct(-3.456), "-3.46%");
assert.equal(pct(0), "+0.00%");
assert.equal(pct(3.456, 1), "+3.5%");

// The bounds, and the case that actually bites: a value already outside them.
assert.equal(clamp(5, 0, 10), 5);
assert.equal(clamp(-1, 0, 10), 0);
assert.equal(clamp(99, 0, 10), 10);
// Inverted bounds win on the min, same as the Math.max(min, Math.min(max, v))
// this replaced - worth pinning so a refactor can't silently flip it.
assert.equal(clamp(5, 10, 0), 10);

console.log("num ok");
