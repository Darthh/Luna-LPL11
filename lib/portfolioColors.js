// One color per holding, shared by the growth chart and the weight wheel so a
// ticker is the same color in both. Without this the wheel colored by its own
// rank order and the chart by dataset index, and the two disagreed the moment
// a position changed size - which makes reading one picture against the other
// actively misleading.
//
// The order is by value, biggest first, because that is the order the wheel
// draws its slices in and the order the chart lists its lines.

// The wheel's palette, kept in this order so the existing ETF donut and this
// one hand out the same hues to the same ranks.
// Also the palette the normalized-compare boards (country ETFs, US sectors)
// walk in order, so a line keeps its colour across both pages.
export const SERIES_COLORS = [
  "#4f6df5", "#f5a623", "#9b59f6", "#2fbf9b", "#f65f8e",
  "#37a2eb", "#f6c744", "#7ed957", "#e8825a", "#5fd4f5",
  "#c95ff5", "#f57d5f", "#4fc3a1", "#f56da6", "#8a97f5",
  "#d4b95f", "#67e0c4", "#f59e6d", "#b5d95f", "#6db3f5",
];

// The portfolio's own line and the benchmark it is measured against sit
// outside the per-holding palette: they are not holdings, and they must stay
// legible whichever tickers are on the chart. The portfolio takes the same
// green the stock search and quote rows use for a positive move, so one green
// means "your side" everywhere on the site - and the market is the orange
// beside it.
export const PORTFOLIO_LINE_COLOR = "#22c55e";
export const BENCHMARK_LINE_COLOR = "#e8862a";
// The portfolio line's fill, fading to nothing at the bottom of the panel, so
// the area under it reads as belonging to the green line above it.
export const PORTFOLIO_FILL_TOP = "rgba(34,197,94,0.28)";

// Grey wherever it appears, so the collapsed tail never reads as a holding.
export const OTHER_COLOR = "#565d6e";

// Maps each symbol to its color, ranked by value. Returns a plain object so it
// can be read in a render without a lookup helper.
export function holdingColors(holdings) {
  const ranked = [...holdings].sort((a, b) => b.value - a.value);
  return Object.fromEntries(
    ranked.map((h, i) => [h.symbol, SERIES_COLORS[i % SERIES_COLORS.length]])
  );
}
