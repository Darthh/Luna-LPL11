import assert from "node:assert/strict";
import { rsiLeOrderRequests, rsiLeSignals, RSI_LE_OVERSOLD, RSI_LE_OVERBOUGHT } from "./rsiLe.js";
import { rsi } from "./indicators.js";

// Drives RSI through both zones: a long slide down, then a climb back up, then
// a slide back down. Mirrors TradingView's crossover/crossunder semantics.
const closes = [];
for (let i = 0; i < 40; i++) closes.push(100 - i);       // deep oversold
for (let i = 0; i < 40; i++) closes.push(60 + i * 2);    // climb through 30 -> 70
for (let i = 0; i < 40; i++) closes.push(140 - i * 2);   // fall back through 70
for (let i = 0; i < 40; i++) closes.push(60 + i * 2);    // second long reversal
for (let i = 0; i < 40; i++) closes.push(140 - i * 2);   // second short reversal

const values = rsi(closes, 14);
const requests = rsiLeOrderRequests(closes);
const signals = rsiLeSignals(closes);

// Every request must sit on a real crossing of the level.
requests.forEach((request, i) => {
  if (!request) return;
  const prev = values[i - 1], cur = values[i];
  assert.ok(prev != null && cur != null, `request at ${i} used a null RSI bar`);
  if (request === 1) assert.ok(prev <= RSI_LE_OVERSOLD && cur > RSI_LE_OVERSOLD, `bad long request at ${i}`);
  else assert.ok(prev >= RSI_LE_OVERBOUGHT && cur < RSI_LE_OVERBOUGHT, `bad short request at ${i}`);
});

// The first request establishes the position with one unit. TradingView's
// visible +/-2 markers are subsequent reversals, filled one candle later.
const requestIndexes = requests.flatMap((request, i) => request ? [i] : []);
const kinds = signals.filter(Boolean);
assert.ok(kinds.includes(2), "expected a +2 RsiLE long entry");
assert.ok(kinds.includes(-2), "expected a -2 RsiSE short entry");
assert.equal(signals[requestIndexes[0] + 1], null, "initial one-unit entry must not be labeled +/-2");
for (const index of requestIndexes.slice(1)) {
  assert.equal(signals[index], null, `request at ${index} filled on the signal candle`);
  assert.equal(signals[index + 1], requests[index] * 2, `request at ${index} did not fill on the next candle`);
}

// Sitting inside a zone must NOT fire; only leaving it does. The deep slide
// keeps RSI pinned under 30 for many bars and may emit at most one exit.
const slideRequests = requests.slice(0, 40).filter(Boolean);
assert.equal(slideRequests.length, 0, "no request should fire while RSI sits oversold");

// The warm-up region has no RSI, so it must be silent.
assert.deepEqual(signals.slice(0, 14).filter(Boolean), [], "warm-up emitted a signal");

console.log(`ok - ${kinds.length} reversal fills, TradingView timing verified`);
