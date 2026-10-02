// Long/flat RSI backtests over a close series.
//
// Two things here are load-bearing and easy to get wrong in a way that turns a
// losing rule into a winning one:
//
//   1. rsi[i] is only known once bar i has closed, so the position it implies
//      cannot be held until bar i+1. The loop below advances equity by the bar
//      it is standing in *before* reading the signal, which makes the one-bar
//      delay structural rather than something a later edit can quietly drop.
//   2. Costs are charged on every position change. At 1-minute frequency a rule
//      can fire hundreds of times and the spread, not the signal, decides the
//      result. A cost-free version of this file would say almost every strategy
//      works.

import { computeRSI } from "./rsi.js";
import { BARS_PER_YEAR } from "./synthMarket.js";

// Long only: the intent is buying calls, and a short leg would need borrow
// costs and assignment rules this model has no business pretending to have.
export const STRATEGIES = {
  buyHold: {
    label: "Buy & hold",
    note: "The baseline every rule has to beat, not the one it gets compared to after the fact.",
    decide: () => 1,
  },
  meanRevert: {
    label: "Mean reversion",
    note: "Buy the oversold cross, exit back through the midline.",
    decide: (rsi, prev, pos, p) => {
      if (pos === 0 && prev >= p.oversold && rsi < p.oversold) return 1;
      if (pos === 1 && rsi >= p.exitLevel) return 0;
      return pos;
    },
  },
  momentum: {
    label: "Momentum",
    note: "Buy the overbought cross, exit back through the midline. The opposite trade to mean reversion.",
    decide: (rsi, prev, pos, p) => {
      if (pos === 0 && prev <= p.overbought && rsi > p.overbought) return 1;
      if (pos === 1 && rsi <= p.exitLevel) return 0;
      return pos;
    },
  },
  meanRevertTrend: {
    label: "Mean reversion + trend filter",
    note: "Only buys dips that happen above a slow average, so it sits out downtrends.",
    decide: (rsi, prev, pos, p, i, ctx) => {
      const above = ctx.trendMa[i] != null && ctx.closes[i] > ctx.trendMa[i];
      if (pos === 0 && above && prev >= p.oversold && rsi < p.oversold) return 1;
      if (pos === 1 && rsi >= p.exitLevel) return 0;
      return pos;
    },
  },
};

// Rolling mean over `period`, aligned so ma[i] uses closes up to and including
// i - the same information the signal at bar i has.
function movingAverage(closes, period) {
  const out = new Array(closes.length).fill(null);
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= period) sum -= closes[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function maxDrawdown(equity) {
  let peak = equity[0];
  let worst = 0;
  for (const v of equity) {
    if (v > peak) peak = v;
    const dd = v / peak - 1;
    if (dd < worst) worst = dd;
  }
  return worst;
}

/**
 * @param {Float64Array} closes
 * @param {string} key  a key of STRATEGIES
 * @param {object} params { period, oversold, overbought, exitLevel, costBps, trendPeriod }
 */
export function runStrategy(closes, key, params) {
  const p = {
    period: 14,
    oversold: 30,
    overbought: 70,
    exitLevel: 50,
    costBps: 2,
    trendPeriod: 390,
    ...params,
  };
  const strategy = STRATEGIES[key];
  const rsi = computeRSI(closes, p.period);
  const ctx = {
    closes,
    trendMa: key === "meanRevertTrend" ? movingAverage(closes, p.trendPeriod) : null,
  };

  // costBps is quoted round-trip, so each individual fill pays half of it.
  const halfCost = p.costBps / 2 / 10000;

  let equity = 1;
  let pos = 0;
  let trades = 0;
  let wins = 0;
  let barsLong = 0;
  let entryEquity = 0;
  let sumRet = 0;
  let sumSq = 0;

  // Sampled for the chart; drawing 100k points would cost more than the run.
  const curve = [];
  const stride = Math.max(1, Math.floor(closes.length / 600));

  for (let i = 1; i < closes.length; i++) {
    const barRet = closes[i] / closes[i - 1] - 1;
    const stratRet = pos * barRet;
    equity *= 1 + stratRet;
    if (pos === 1) barsLong++;
    sumRet += stratRet;
    sumSq += stratRet * stratRet;

    // Signal is read only after the bar it belongs to has been lived through.
    const r = rsi[i];
    if (r != null) {
      const prev = rsi[i - 1] ?? r;
      const want = strategy.decide(r, prev, pos, p, i, ctx);
      if (want !== pos) {
        equity *= 1 - halfCost;
        if (want === 1) {
          entryEquity = equity;
        } else {
          trades++;
          if (equity > entryEquity) wins++;
        }
        pos = want;
      }
    }

    if (i % stride === 0) curve.push(equity);
  }

  const n = closes.length - 1;
  const mean = sumRet / n;
  const sd = Math.sqrt(Math.max(sumSq / n - mean * mean, 0));

  return {
    key,
    label: strategy.label,
    totalReturn: equity - 1,
    trades,
    // A rule that never closed a trade has no win rate; 0 would read as "always
    // wrong" rather than "nothing to score".
    winRate: trades > 0 ? wins / trades : null,
    sharpe: sd > 0 ? (mean / sd) * Math.sqrt(BARS_PER_YEAR) : 0,
    maxDrawdown: maxDrawdown(curve.length ? curve : [1]),
    exposure: barsLong / n,
    curve,
  };
}

// Percentile of an unsorted array, nearest-rank.
function percentile(sorted, q) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[idx];
}

/**
 * Run every strategy across many independent tapes.
 *
 * One path tells you nothing - the spread across paths is the entire result.
 * Under the `random` regime this spread IS the null distribution: a strategy
 * whose median sits inside it on real data has shown you nothing but variance.
 */
export function monteCarlo(generate, keys, params, paths) {
  const byKey = new Map(keys.map((k) => [k, []]));
  let sample = null;

  for (let p = 0; p < paths; p++) {
    const closes = generate(p);
    if (p === 0) sample = { closes, runs: {} };
    for (const key of keys) {
      const run = runStrategy(closes, key, params);
      byKey.get(key).push(run);
      if (p === 0) sample.runs[key] = run;
    }
  }

  const summary = keys.map((key) => {
    const runs = byKey.get(key);
    const returns = runs.map((r) => r.totalReturn).sort((a, b) => a - b);
    const scored = runs.filter((r) => r.winRate != null);
    const avg = (f) => runs.reduce((s, r) => s + f(r), 0) / runs.length;
    return {
      key,
      label: STRATEGIES[key].label,
      note: STRATEGIES[key].note,
      medianReturn: percentile(returns, 0.5),
      p05: percentile(returns, 0.05),
      p95: percentile(returns, 0.95),
      // Share of tapes that made money. On a random walk this lands near 50%
      // before costs and well under it after - the clearest read in the table.
      winPaths: returns.filter((r) => r > 0).length / returns.length,
      trades: avg((r) => r.trades),
      sharpe: avg((r) => r.sharpe),
      maxDrawdown: avg((r) => r.maxDrawdown),
      exposure: avg((r) => r.exposure),
      winRate: scored.length ? scored.reduce((s, r) => s + r.winRate, 0) / scored.length : null,
    };
  });

  return { summary, sample };
}
