// The axes the metric scatter offers, shared by its API route and its page so
// the two can't drift on where a number comes from or what unit it's in.
//
// These are the stock screener's criteria (lib/screenerFields.js) read from a
// different place. The screener filters through Yahoo's screener endpoint,
// which takes operand ids and returns rows; a scatter needs the values
// themselves for a fixed list of companies, which is quoteSummary's job. Same
// measures, different feed, so the field names don't carry over - `module` and
// `path` below say where each one lives in a quoteSummary response.
//
// Units are the trap. The screener endpoint hands back margins and growth as
// percentages (NVDA's return on equity screens as 114); quoteSummary hands the
// same figures back as fractions (1.14). `scale` normalises to what the axis
// label says, so everything downstream is already in display units.
//
// Two screener criteria have no quoteSummary equivalent and are left out
// rather than approximated: return on capital, and the trailing-twelve-month
// revenue growth (what's here is the most recent quarter against the same
// quarter a year earlier, which is what `revenueGrowth` actually reports).
export const METRICS = [
  // Growth
  { key: "revGrowth", label: "Rev. growth YoY", module: "financialData", path: "revenueGrowth", scale: 100, unit: "%" },
  { key: "epsGrowth", label: "Earnings growth YoY", module: "financialData", path: "earningsGrowth", scale: 100, unit: "%" },

  // Profitability
  { key: "grossMargin", label: "Gross margin", module: "financialData", path: "grossMargins", scale: 100, unit: "%" },
  { key: "opMargin", label: "Operating margin", module: "financialData", path: "operatingMargins", scale: 100, unit: "%" },
  { key: "ebitdaMargin", label: "EBITDA margin", module: "financialData", path: "ebitdaMargins", scale: 100, unit: "%" },
  { key: "netMargin", label: "Net margin", module: "financialData", path: "profitMargins", scale: 100, unit: "%" },
  { key: "roa", label: "Return on assets", module: "financialData", path: "returnOnAssets", scale: 100, unit: "%" },
  { key: "roe", label: "Return on equity", module: "financialData", path: "returnOnEquity", scale: 100, unit: "%" },

  // Earnings multiples
  { key: "pe", label: "P/E", module: "summaryDetail", path: "trailingPE", unit: "x" },
  { key: "forwardPe", label: "Forward P/E", module: "defaultKeyStatistics", path: "forwardPE", unit: "x" },
  { key: "peg", label: "PEG", module: "defaultKeyStatistics", path: "pegRatio", unit: "x" },

  // Other multiples
  { key: "ps", label: "P/S", module: "summaryDetail", path: "priceToSalesTrailing12Months", unit: "x" },
  { key: "pb", label: "P/B", module: "defaultKeyStatistics", path: "priceToBook", unit: "x" },
  { key: "evEbitda", label: "EV/EBITDA", module: "defaultKeyStatistics", path: "enterpriseToEbitda", unit: "x" },
  { key: "evSales", label: "EV/Sales", module: "defaultKeyStatistics", path: "enterpriseToRevenue", unit: "x" },

  // Size, income, balance sheet
  { key: "cap", label: "Market cap", module: "summaryDetail", path: "marketCap", unit: "$" },
  { key: "divYield", label: "Dividend yield", module: "summaryDetail", path: "dividendYield", scale: 100, unit: "%" },
  // Yahoo carries this as a percentage of equity (NVDA reads 6.555), and the
  // multiple is what people say, so it comes back down by a hundred.
  { key: "debtEquity", label: "Debt/Equity", module: "financialData", path: "debtToEquity", scale: 0.01, unit: "x" },
  { key: "currentRatio", label: "Current ratio", module: "financialData", path: "currentRatio", unit: "x" },
  { key: "beta", label: "Beta", module: "summaryDetail", path: "beta", unit: "x" },
];

export const METRIC_BY_KEY = Object.fromEntries(METRICS.map((m) => [m.key, m]));

// Which index the scatter can plot, and the key its members carry in the
// static universe. QQQ first because it's the one this page was built for: a
// hundred names is enough to show a shape and few enough to still read.
export const INDEXES = [
  { key: "qqq", member: "ndx100", label: "Nasdaq 100 (QQQ)" },
  { key: "sp500", member: "sp500", label: "S&P 500" },
  { key: "dow30", member: "dow30", label: "Dow 30" },
  { key: "soxx", member: "soxx", label: "Semiconductors (SOXX)" },
];

export const INDEX_BY_KEY = Object.fromEntries(INDEXES.map((i) => [i.key, i]));

// The pair the page opens on, and the one the reference chart everyone has seen
// uses: growth against how much of the revenue survives to operating profit.
export const DEFAULT_X = "opMargin";
export const DEFAULT_Y = "revGrowth";

// Axis ticks and tooltips. Market cap is the only one big enough to want a
// compact suffix; the rest are small numbers where the decimal carries the
// information.
export function formatMetric(value, unit) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  if (unit === "%") return `${value.toFixed(1)}%`;
  if (unit === "x") return `${value.toFixed(2)}×`;
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

// The axis window, and the reason this page doesn't let chart.js pick it.
//
// Every one of these measures has a long tail, and the tail is usually one
// company: a Nasdaq 100 name growing revenue 684% against a median of 16, an
// operating margin of -6808%, an EV/EBITDA of 2577 against a median of 25.
// Scaling to those presses the other hundred into a line along the axis.
//
// So a trimmed range is Tukey's fence - a quartile and a half of headroom past
// the middle half of the data - widened where necessary to always keep the 5th
// through 95th percentile on screen, then clamped to the data itself so the
// chart never shows empty margin. That widening is what keeps the interesting
// names: at a plain fence Nvidia's 85% growth is an outlier, and it is
// precisely what someone opens this chart to see. Measured across all twenty
// metrics it puts the median between 15% and 52% of the way along the axis and
// leaves at most 8 of ~100 companies outside. The count is reported under the
// chart, and "Include outliers" turns the trim off.
//
// Both bounds are computed here even when nothing is being trimmed, rather than
// falling back to chart.js's own fit. Handed a scatter spanning three orders of
// magnitude it chose a window of 18-32 for data running 7.7 to 670 - fifty-eight
// of eighty-five companies off the canvas with nothing to say so. Deciding the
// range here is one code path, the same rounding whichever way the toggle is
// set, and an off-scale count always measured against what is really drawn.
export function axisRange(values, trim) {
  if (values.length < 2) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p) => sorted[Math.round(p * (sorted.length - 1))];

  let lo = sorted[0];
  let hi = sorted[sorted.length - 1];

  // Below twenty there isn't a distribution to speak of, and quartiles of a
  // handful of points would just be dropping data.
  if (trim && sorted.length >= 20) {
    const q1 = at(0.25);
    const q3 = at(0.75);
    const iqr = q3 - q1;
    lo = Math.max(lo, Math.min(q1 - 1.5 * iqr, at(0.05)));
    hi = Math.min(hi, Math.max(q3 + 1.5 * iqr, at(0.95)));
  }
  // Axes start at zero. Every one of these measures reads as "more is more",
  // and the negative end is a handful of loss-making names strung along a
  // stretch of empty chart - so the floor is zero and those names are counted
  // as off-scale under the chart like any other. Applied whichever way the
  // outlier toggle is set: a company at -6808% is off the bottom either way.
  //
  // Unless the whole series is negative, where a floor of zero would leave no
  // range at all and nothing drawn - then the data keeps its own floor.
  if (hi > 0) lo = Math.max(lo, 0);
  if (!(hi > lo)) return null;

  // Rounded out to a round number. Pinning the axis to the exact percentile
  // labels it "99.3%" and "-11.0%", and an axis nobody can read in round steps
  // is a worse chart than one with slightly more margin. Rounding outward is
  // also the air that keeps a point sitting on the cut from being half drawn.
  const step = niceStep((hi - lo) / 6);
  return { min: Math.floor(lo / step) * step, max: Math.ceil(hi / step) * step };
}

// A computed range with whichever bounds a reader has typed over it. Either
// box can be left empty and keep the computed side.
//
// A pair that doesn't run upward is rejected whole, and that's the point of
// this being a function with a test rather than two spreads at the call site:
// chart.js handed a min at or above its max draws an axis with no ticks and no
// points and no error, so a reader midway through typing "-10" over a min of 5
// would watch the chart go blank on the minus sign.
export function typedRange(range, minText, maxText) {
  const num = (t) => (t?.trim() ? Number(t) : NaN);
  const min = num(minText);
  const max = num(maxText);
  const next = {
    min: Number.isFinite(min) ? min : range?.min,
    max: Number.isFinite(max) ? max : range?.max,
  };
  if (next.min == null || next.max == null) return range;
  return next.max > next.min ? next : range;
}

// The diagonal frontier: where a line has to fall so that roughly the top
// `fraction` of companies sit above it, counting both axes together.
//
// The rule-of-40 version of this line is x + y = 40, which only means anything
// when both axes are percentages pointing the same way. Here the axes are
// whatever the two dropdowns say - P/E against beta, market cap against
// dividend yield - so the two are put on a common footing first: each is
// measured in units of its own 5th-to-95th-percentile spread, and a company's
// score is the sum of the two. The line is the level set of that score at the
// right percentile, which is a diagonal falling left to right.
//
// The spread comes from the companies rather than from the axis window on
// purpose. Tie it to the window and zooming in redraws the line somewhere
// else, and a line captioned "Top 20%" has to be a fact about the companies,
// not about how far someone has scrolled.
//
// Returned as two data points to draw between, three spreads out either side,
// which is far enough to cross any window the chart will show. Whoever draws
// it clips to the plot.
export function topFrontier(points, fraction = 0.2) {
  // Below a handful of companies a percentile is noise, and a line drawn
  // through noise still looks authoritative.
  if (points.length < 5) return null;

  const spread = (key) => {
    const sorted = points.map((p) => p[key]).sort((a, b) => a - b);
    const at = (q) => sorted[Math.round(q * (sorted.length - 1))];
    const lo = at(0.05);
    const hi = at(0.95);
    return hi > lo ? { lo, size: hi - lo } : null;
  };
  const sx = spread("x");
  const sy = spread("y");
  // A metric where nine in ten companies report the same number has no spread
  // to score against.
  if (!sx || !sy) return null;

  const score = (p) => (p.x - sx.lo) / sx.size + (p.y - sy.lo) / sy.size;
  const scores = points.map(score).sort((a, b) => a - b);
  const cut = scores[Math.ceil((1 - fraction) * (scores.length - 1))];

  // Anchored where the line crosses the bottom of the y spread, and run out
  // along it: one unit right is one x spread, one unit down is one y spread.
  const ax = sx.lo + cut * sx.size;
  const reach = 3;
  return {
    from: { x: ax - reach * sx.size, y: sy.lo + reach * sy.size },
    to: { x: ax + reach * sx.size, y: sy.lo - reach * sy.size },
  };
}

// The 1/2/2.5/5/10 ladder every axis library settles on, so ticks land on
// numbers a reader already has a feel for.
function niceStep(rough) {
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const n = rough / magnitude;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * magnitude;
}
