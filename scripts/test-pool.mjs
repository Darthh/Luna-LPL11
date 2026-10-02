// Self-check for the bounded worker pool: `node scripts/test-pool.mjs`.
// The bits worth guarding are the ones a wrong answer hides behind plausible
// results - results coming back out of order (every caller zips them against
// the input list), and the concurrency cap silently not capping, which is the
// whole reason the upstreams don't start refusing requests.
import assert from "node:assert/strict";
import { pool } from "../lib/pool.js";

const tick = () => new Promise((r) => setTimeout(r, 1));

// Results keep input order even when the slow items finish last.
const order = await pool([30, 20, 10, 0], 2, async (ms) => {
  await new Promise((r) => setTimeout(r, ms));
  return ms;
});
assert.deepEqual(order, [30, 20, 10, 0]);

// The index is passed through alongside the item.
assert.deepEqual(
  await pool(["a", "b", "c"], 2, async (item, i) => `${i}${item}`),
  ["0a", "1b", "2c"]
);

// Never more than `concurrency` in flight, and every item still runs.
let inFlight = 0;
let peak = 0;
let ran = 0;
await pool(Array.from({ length: 20 }, (_, i) => i), 3, async () => {
  inFlight++;
  peak = Math.max(peak, inFlight);
  await tick();
  ran++;
  inFlight--;
});
assert.equal(peak, 3, `expected peak concurrency 3, got ${peak}`);
assert.equal(ran, 20);

// Fewer items than workers must not spawn idle workers or hang.
peak = 0;
inFlight = 0;
assert.deepEqual(
  await pool([1, 2], 8, async (n) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await tick();
    inFlight--;
    return n * 2;
  }),
  [2, 4]
);
assert.equal(peak, 2);

// Empty input resolves to an empty list rather than hanging on zero workers.
assert.deepEqual(await pool([], 4, async () => "never"), []);

// A rejection propagates instead of being swallowed into a hole in the array.
await assert.rejects(
  pool([1, 2, 3], 2, async (n) => {
    if (n === 2) throw new Error("boom");
    return n;
  }),
  /boom/
);

console.log("pool: all checks passed");
