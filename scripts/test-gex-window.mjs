// Checks the GEX strike window is sane across very different share prices.
// Run: node scripts/test-gex-window.mjs
import assert from "node:assert/strict";

const STRIKE_WINDOW_PCT = 0.013;
const MIN_STRIKES_PER_SIDE = 10;

// Mirrors the band math in app/api/spy-gex/route.js.
function strikeWindow(spot, spacing) {
  return Math.max(spot * STRIKE_WINDOW_PCT, Number.isFinite(spacing) ? spacing * MIN_STRIKES_PER_SIDE : 0);
}
const strikesInBand = (spot, spacing) => {
  const w = strikeWindow(spot, spacing);
  const c = Math.round(spot);
  let n = 0;
  for (let k = Math.ceil((c - w) / spacing) * spacing; k <= c + w; k += spacing) n++;
  return n;
};

// Real spot/spacing pairs sampled from the live Yahoo chains.
const CHAINS = [
  ["SPY", 773.17, 1],
  ["QQQ", 717.67, 0.5],
  ["SOXX", 502.2, 2.5],
  ["DRAM", 55.99, 0.5],
];

for (const [symbol, spot, spacing] of CHAINS) {
  const w = strikeWindow(spot, spacing);
  const n = strikesInBand(spot, spacing);
  // Every ticker must yield a heatmap worth drawing...
  assert.ok(n >= 20, `${symbol}: only ${n} strikes in band`);
  // ...without the band running away from the money.
  assert.ok(w / spot <= 0.25, `${symbol}: band is ${(100 * w / spot).toFixed(1)}% of spot`);
  console.log(`${symbol}: spot ${spot} spacing ${spacing} -> +/-$${w.toFixed(2)} (${(100 * w / spot).toFixed(1)}%), ${n} strikes`);
}

// The old fixed $10 window is preserved for SPY, which it was tuned for.
assert.ok(Math.abs(strikeWindow(773.17, 1) - 10) < 0.5, "SPY band should still be ~$10");
// A thinly-struck ETF must be widened past the raw percentage.
assert.ok(strikeWindow(502.2, 2.5) > 502.2 * STRIKE_WINDOW_PCT, "SOXX band should widen to the spacing floor");

console.log("ok");
