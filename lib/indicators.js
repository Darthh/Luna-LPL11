// Moving averages and RSI for the stock chart's Technicals menu.
//
// Both take the full close series - the API's `warmup` closes followed by the
// visible ones - and return an array aligned to the visible window alone. That
// split is the whole point: a 200-day average over a 3-month chart is drawn
// from 200 sessions the chart never shows, so computing it from visible data
// only would leave the line empty on exactly the ranges people look at.

// Simple moving average. Positions without a full `period` of history behind
// them are null, which Chart.js renders as a gap rather than a line to zero.
export function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) {
      // A hole in the series invalidates the window it sits in; start over
      // rather than average across the gap.
      sum = 0;
      count = 0;
      continue;
    }
    sum += v;
    count++;
    if (count > period) {
      sum -= values[i - period];
      count = period;
    }
    if (count === period) out[i] = sum / period;
  }
  return out;
}

// Exponential moving average seeded with the first full simple average. A
// finite seed keeps the line aligned with charting packages, while a gap
// resets the calculation instead of carrying stale state across missing data.
export function ema(values, period) {
  const out = new Array(values.length).fill(null);
  const multiplier = 2 / (period + 1);
  let seedSum = 0;
  let seedCount = 0;
  let previous = null;

  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (value == null || !Number.isFinite(value)) {
      seedSum = 0;
      seedCount = 0;
      previous = null;
      continue;
    }
    if (previous == null) {
      seedSum += value;
      seedCount++;
      if (seedCount === period) {
        previous = seedSum / period;
        out[i] = previous;
      }
      continue;
    }
    previous = value * multiplier + previous * (1 - multiplier);
    out[i] = previous;
  }
  return out;
}

// Wilder's RSI: the original smoothing from New Concepts in Technical Trading
// Systems, not a simple mean of gains. Every charting package quotes Wilder's,
// so a simple-average version would disagree with whatever the reader is
// comparing against.
export function rsi(values, period = 14) {
  const out = new Array(values.length).fill(null);
  if (values.length <= period) return out;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    if (change >= 0) avgGain += change;
    else avgLoss -= change;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = rsiFrom(avgGain, avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = rsiFrom(avgGain, avgLoss);
  }
  return out;
}

// No down moves in the window means no ratio to take: the series is pinned at
// 100 by definition rather than dividing by zero.
function rsiFrom(avgGain, avgLoss) {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

// Keep only the part of a computed series that lines up with the visible
// points, given how many leading closes were warmup.
export function visibleTail(computed, visibleCount) {
  return computed.slice(computed.length - visibleCount);
}

function demo() {
  const assert = (cond, msg) => {
    if (!cond) throw new Error(msg);
  };
  const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

  // SMA: the window has to be full before a value appears, and each value is
  // the mean of exactly `period` closes.
  const s = sma([1, 2, 3, 4, 5, 6], 3);
  assert(s[0] === null && s[1] === null, "SMA must be null before the window fills");
  assert(close(s[2], 2) && close(s[3], 3) && close(s[5], 5), `SMA wrong: ${s}`);

  // A gap resets the window rather than averaging across it.
  const gapped = sma([1, 2, null, 4, 5, 6], 3);
  assert(gapped[3] === null && gapped[4] === null, "SMA must not span a gap");
  assert(close(gapped[5], 5), "SMA should resume once a clean window refills");

  const e = ema([1, 2, 3, 4, 5], 3);
  assert(e[0] === null && e[1] === null, "EMA must wait for a full seed window");
  assert(close(e[2], 2) && close(e[3], 3) && close(e[4], 4), `EMA wrong: ${e}`);

  // RSI bounds: an unbroken climb has no losses and pins at 100, an unbroken
  // fall has no gains and pins at 0.
  const rising = rsi(Array.from({ length: 30 }, (_, i) => 100 + i), 14);
  assert(rising[13] === null, "RSI needs `period` changes before its first value");
  assert(close(rising[14], 100), `RSI of a pure uptrend should be 100, got ${rising[14]}`);
  const falling = rsi(Array.from({ length: 30 }, (_, i) => 100 - i), 14);
  assert(close(falling[29], 0), `RSI of a pure downtrend should be 0, got ${falling[29]}`);

  // Wilder's worked example: his first average gain is 0.24, average loss
  // 0.10, giving RS 2.4 and RSI 70.59 to two decimals.
  const wilder = rsiFrom(0.24, 0.1);
  assert(close(Math.round(wilder * 100) / 100, 70.59), `Wilder check failed: ${wilder}`);

  // Alternating equal moves sit at the midpoint, and every value stays in range.
  const choppy = rsi(Array.from({ length: 60 }, (_, i) => 100 + (i % 2)), 14);
  for (const v of choppy) assert(v === null || (v >= 0 && v <= 100), `RSI out of range: ${v}`);

  assert(visibleTail([1, 2, 3, 4, 5], 2).join() === "4,5", "visibleTail must keep the tail");

  console.log("indicators: ok");
}

if (process.argv[1] && process.argv[1].endsWith("indicators.js")) demo();
