// A synthetic 1-minute SPY tape.
//
// The point of this file is NOT to predict SPY. It is to produce a tape whose
// *statistical* shape matches a real one - fat tails, volatility clustering,
// the intraday U - so a strategy tested on it meets the same obstacles it would
// meet live. What it deliberately does not carry is a free lunch: under the
// default `random` regime the series is a martingale, so any strategy that
// shows a profit on it is showing luck, and the spread of those profits over
// many seeds is the noise band a real backtest has to beat.
//
// The regime knob is the whole experiment. Mean reversion and momentum are put
// in by hand, which means finding them again with RSI proves only that the
// search works - never that SPY contains them.

const BARS_PER_DAY = 390; // 09:30-16:00, one bar a minute
const BARS_PER_YEAR = BARS_PER_DAY * 252;

// Reproducibility matters more than randomness quality here: the same seed has
// to give the same tape, or comparing two parameter sets compares two tapes.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller. Returns one standard normal per call; the second value is kept
// for the next one rather than thrown away.
function normalSource(rand) {
  let spare = null;
  return function () {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    let u = 0;
    let v = 0;
    let s = 0;
    do {
      u = rand() * 2 - 1;
      v = rand() * 2 - 1;
      s = u * u + v * v;
    } while (s === 0 || s >= 1);
    const f = Math.sqrt((-2 * Math.log(s)) / s);
    spare = v * f;
    return u * f;
  };
}

// Standardised Student-t. Real minute returns have far more 5-sigma bars than a
// normal allows, so t is the usual stand-in - but df must stay above 4. t(4)
// has infinite kurtosis, and an innovation with no fourth moment drives the
// GARCH recursion below into occasional monster bars it never decays away from;
// realised vol then comes out tens of times the target. df=6 keeps the tails
// visibly fat while leaving the variance process well behaved.
//
// The clamp is the same defence and has a real-world counterpart: LULD halts
// mean SPY does not print a 20-sigma minute.
function tSource(normal, df = 6, clamp = 10) {
  const scale = Math.sqrt(df / (df - 2));
  return function () {
    let chi = 0;
    for (let i = 0; i < df; i++) {
      const z = normal();
      chi += z * z;
    }
    const t = normal() / Math.sqrt(chi / df) / scale;
    return Math.max(-clamp, Math.min(clamp, t));
  };
}

// Volatility is roughly twice as high at the open as at lunch, and rises again
// into the close. A strategy that trades on RSI extremes will fire far more
// often at 09:31 than at 12:00, so leaving this flat would understate how much
// of its activity lands in the most expensive minutes of the day.
function intradayShape() {
  const shape = new Array(BARS_PER_DAY);
  let sumSq = 0;
  for (let i = 0; i < BARS_PER_DAY; i++) {
    const x = i / (BARS_PER_DAY - 1);
    shape[i] = 1 + 2.0 * Math.exp(-x / 0.08) + 1.2 * Math.exp(-(1 - x) / 0.1);
    sumSq += shape[i] * shape[i];
  }
  // Normalise by RMS, not by mean. Realised variance averages sigma^2, and
  // sigma carries this shape as a factor - so it is E[shape^2] that has to come
  // out at 1 for the tape to end up with the vol the caller asked for. Dividing
  // by the mean instead leaves E[shape^2] above 1, which both inflates vol and
  // pushes the GARCH recursion closer to the unstable boundary.
  const rms = Math.sqrt(sumSq / BARS_PER_DAY);
  for (let i = 0; i < BARS_PER_DAY; i++) shape[i] /= rms;
  return shape;
}

const SHAPE = intradayShape();

/**
 * Generate a synthetic close series.
 *
 * @param {object} opts
 * @param {number} opts.days        sessions to generate (390 bars each)
 * @param {number} opts.seed        same seed -> same tape
 * @param {number} opts.annualVol   target annualised vol, e.g. 0.16
 * @param {number} opts.annualDrift target annualised drift, e.g. 0.08
 * @param {"random"|"meanRevert"|"trend"} opts.regime
 * @param {number} opts.regimeStrength 0 = martingale whatever the regime
 * @returns {Float64Array} closes
 */
export function generateSeries({
  days = 60,
  seed = 1,
  start = 500,
  annualVol = 0.16,
  annualDrift = 0.08,
  regime = "random",
  regimeStrength = 0.5,
  alpha = 0.09, // GARCH: weight on last shock
  beta = 0.9, //  GARCH: weight on last variance (alpha+beta<1 or vol explodes)
} = {}) {
  const n = days * BARS_PER_DAY;
  const rand = mulberry32(seed);
  const draw = tSource(normalSource(rand));

  const barVar = (annualVol * annualVol) / BARS_PER_YEAR;
  const barDrift = annualDrift / BARS_PER_YEAR;
  // Long-run variance of the GARCH recursion is omega/(1-alpha-beta); solving
  // for omega is what pins the simulated vol to the number the user typed.
  const omega = barVar * (1 - alpha - beta);

  // Mean reversion pulls log price toward a slow anchor; momentum feeds the
  // last return forward. Both are scaled so 0 strength is exactly a random walk.
  const theta = regime === "meanRevert" ? 0.02 * regimeStrength : 0;
  const phi = regime === "trend" ? 0.18 * regimeStrength : 0;
  const anchorAlpha = 2 / (200 + 1); // EMA halflife ~200 bars

  const closes = new Float64Array(n);
  let logP = Math.log(start);
  let anchor = logP;
  let variance = barVar;
  let prevShock = 0;
  let prevRet = 0;

  for (let i = 0; i < n; i++) {
    variance = omega + alpha * prevShock * prevShock + beta * variance;

    // Two different shocks, and keeping them apart is what stops this loop from
    // exploding. `base` is the deseasonalised move - that is the one GARCH is
    // allowed to learn from. The U-shape is a clock, not news: 09:31 is not
    // volatile because something happened, it is volatile because it is 09:31.
    // Feeding the shaped shock back in would let the open multiply variance by
    // ~5 a bar and compound, which sends realised vol orders of magnitude past
    // the target.
    const base = draw() * Math.sqrt(variance);
    const sigmaEff = Math.sqrt(variance) * SHAPE[i % BARS_PER_DAY];
    const shock = base * SHAPE[i % BARS_PER_DAY];

    const pull = -theta * (logP - anchor);
    const carry = phi * prevRet;
    // The -sigma^2/2 is not decoration. Without it the tape has zero drift in
    // LOG price, which means E[simple return] = sigma^2/2 > 0 - and since
    // variance moves around, any rule that concentrates its exposure in
    // high-volatility bars collects a bigger share of that phantom drift.
    // Buying oversold does exactly that (RSI only reaches 30 after a sustained
    // drop, which under GARCH is when variance is elevated), so mean reversion
    // scored a persistent ~2% per unit of exposure on what was supposed to be a
    // no-edge tape. Subtracting the Ito term makes PRICE the martingale rather
    // than log price, which is what "no edge" has to mean here, and makes
    // annualDrift mean the return a holder actually gets.
    const ret = barDrift - (sigmaEff * sigmaEff) / 2 + pull + carry + shock;

    logP += ret;
    anchor += anchorAlpha * (logP - anchor);
    // Only the shock, never the drift or the regime pull - those are not news
    // either, and letting them drive variance would double-count them.
    prevShock = base;
    prevRet = ret;
    closes[i] = Math.exp(logP);
  }

  return closes;
}

export { BARS_PER_DAY, BARS_PER_YEAR };

// Realised annualised vol of a close series - used by the UI to show that the
// tape it drew actually has the vol that was asked of it.
export function realisedVol(closes) {
  let sum = 0;
  let sumSq = 0;
  const n = closes.length - 1;
  for (let i = 1; i < closes.length; i++) {
    const r = Math.log(closes[i] / closes[i - 1]);
    sum += r;
    sumSq += r * r;
  }
  const mean = sum / n;
  return Math.sqrt((sumSq / n - mean * mean) * BARS_PER_YEAR);
}
