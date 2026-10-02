// Self-check for the synthetic tape and the RSI backtester:
// `node scripts/test-backtest.mjs`.
//
// The assertion that earns this file's existence is the look-ahead one at the
// bottom. Every bug that makes a backtest lie makes it lie in the same
// direction - profitable - and none of them are visible by reading the output,
// because a fake equity curve looks exactly like a real one. The random-walk
// regime is the detector: on a martingale, with costs switched off, every
// strategy has to land at zero. If any of them prints a profit, the loop is
// reading a bar it would not have had.
import assert from "node:assert/strict";
import { generateSeries, realisedVol, BARS_PER_DAY } from "../lib/synthMarket.js";
import { runStrategy, monteCarlo, STRATEGIES } from "../lib/backtest.js";

const near = (a, b, tol, msg) =>
  assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} not within ${tol} of ${b}`);

// ---------------------------------------------------------------------------
// The tape has the shape it was asked for.
const s = generateSeries({ days: 250, seed: 7, annualVol: 0.16, annualDrift: 0 });
assert.equal(s.length, 250 * BARS_PER_DAY);
assert.ok(s.every((v) => Number.isFinite(v) && v > 0), "prices stay finite and positive");

// GARCH plus the intraday shape must not move realised vol off the target -
// both are rescaled for exactly this reason, and both are easy to break.
near(realisedVol(s), 0.16, 0.03, "realised vol tracks the annualVol input");

// Same seed, same tape - otherwise comparing two parameter sets silently
// compares two different markets.
const a = generateSeries({ days: 5, seed: 42 });
const b = generateSeries({ days: 5, seed: 42 });
const c = generateSeries({ days: 5, seed: 43 });
assert.deepEqual(Array.from(a), Array.from(b), "seed is deterministic");
assert.notDeepEqual(Array.from(a), Array.from(c), "different seeds differ");

// Fat tails: a normal tape puts ~0.006% of bars past 4 sigma. Student-t(4)
// should be well past that, which is the point of using it.
const rets = [];
for (let i = 1; i < s.length; i++) rets.push(Math.log(s[i] / s[i - 1]));
const sd = Math.sqrt(rets.reduce((t, r) => t + r * r, 0) / rets.length);
const tails = rets.filter((r) => Math.abs(r) > 4 * sd).length / rets.length;
assert.ok(tails > 0.0005, `tape has fat tails (4-sigma share ${tails})`);

// `annualDrift` means the return a holder actually collects, not the log drift.
// The generator subtracts sigma^2/2 per bar to make that true; drop that term
// and this reads high while every high-volatility-seeking rule quietly gains a
// phantom edge. Tolerance is wide because the mean of 60 one-year paths at 16%
// vol carries about 2 points of standard error on its own.
let drifted = 0;
const PATHS = 60;
for (let i = 0; i < PATHS; i++) {
  const path = generateSeries({ days: 252, seed: i, annualDrift: 0.08, annualVol: 0.16 });
  drifted += path[path.length - 1] / path[0] - 1;
}
near(drifted / PATHS, 0.08, 0.05, "annualDrift is the arithmetic return, not the log drift");

console.log("ok - synthetic tape");

// ---------------------------------------------------------------------------
// Buy & hold is the arithmetic check on the engine: it holds from the first bar
// RSI exists, so its result is pinned to the price series and one entry cost.
const bh = runStrategy(s, "buyHold", { period: 14, costBps: 0 });
near(bh.totalReturn, s[s.length - 1] / s[14] - 1, 1e-9, "buy & hold equals the price return");
near(bh.exposure, 1, 0.01, "buy & hold is in the market the whole time");
assert.equal(bh.trades, 0, "buy & hold never closes a position");

// A rule that never traded reports no win rate rather than a misleading zero.
assert.equal(bh.winRate, null);

// Costs have to bite, and bite harder the more a rule trades.
const free = runStrategy(s, "meanRevert", { costBps: 0 });
const dear = runStrategy(s, "meanRevert", { costBps: 20 });
assert.ok(free.trades > 10, "mean reversion actually fires on this tape");
assert.ok(dear.totalReturn < free.totalReturn, "costs reduce return");
console.log(
  `ok - costs: ${free.trades} trades, ${(free.totalReturn * 100).toFixed(2)}% free ` +
    `vs ${(dear.totalReturn * 100).toFixed(2)}% at 20bps`
);

// ---------------------------------------------------------------------------
// The regime knob does what it claims. This is what stops the UI from being a
// mirror that shows whatever the user hoped for: mean reversion has to win on a
// mean-reverting tape and lose to momentum on a trending one.
const keys = ["meanRevert", "momentum"];
const params = { period: 14, oversold: 30, overbought: 70, exitLevel: 50, costBps: 0 };

const mr = monteCarlo(
  (i) => generateSeries({ days: 40, seed: 100 + i, regime: "meanRevert", regimeStrength: 1, annualDrift: 0 }),
  keys, params, 30
);
const mrBy = Object.fromEntries(mr.summary.map((r) => [r.key, r]));
assert.ok(
  mrBy.meanRevert.medianReturn > mrBy.momentum.medianReturn,
  "mean reversion wins on a mean-reverting tape"
);

const tr = monteCarlo(
  (i) => generateSeries({ days: 40, seed: 200 + i, regime: "trend", regimeStrength: 1, annualDrift: 0 }),
  keys, params, 30
);
const trBy = Object.fromEntries(tr.summary.map((r) => [r.key, r]));
assert.ok(
  trBy.momentum.medianReturn > trBy.meanRevert.medianReturn,
  "momentum wins on a trending tape"
);
console.log("ok - regimes are recoverable and opposite");

// ---------------------------------------------------------------------------
// THE ONE THAT MATTERS. Random walk, zero drift, zero costs: there is no edge
// in the data, so no rule may extract one. A look-ahead bug - reading rsi[i] to
// trade bar i instead of bar i+1, say - shows up here as a fat positive median
// and nowhere else.
const allKeys = Object.keys(STRATEGIES).filter((k) => k !== "buyHold");
const nullRun = monteCarlo(
  (i) => generateSeries({ days: 40, seed: 900 + i, regime: "random", annualDrift: 0 }),
  allKeys, params, 60
);
for (const row of nullRun.summary) {
  // Tolerance is generous because 60 paths of 40 days is a noisy median; a leak
  // is not a near miss, it prints percent-level profit on a coin flip.
  near(row.medianReturn, 0, 0.004, `${row.label} has no edge on a random walk`);
  assert.ok(
    row.winPaths > 0.3 && row.winPaths < 0.7,
    `${row.label} wins about half the tapes (got ${row.winPaths})`
  );
}
console.log("ok - no strategy beats a martingale (no look-ahead)");

// And with costs switched on, that same no-edge tape must produce a LOSS -
// which is the single most useful thing this tool has to say.
const costed = monteCarlo(
  (i) => generateSeries({ days: 40, seed: 900 + i, regime: "random", annualDrift: 0 }),
  ["meanRevert"], { ...params, costBps: 4 }, 60
);
assert.ok(costed.summary[0].medianReturn < 0, "costs turn a no-edge rule into a losing one");
console.log(
  `ok - at 4bps the same rule bleeds ${(costed.summary[0].medianReturn * 100).toFixed(2)}% median`
);
