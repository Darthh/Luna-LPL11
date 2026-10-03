// The Portfolio comparison page: a basket of tickers you weight yourself, indexed
// against SPY over one, two or three years.

export const BENCHMARK = "SPY";
export const RANGES = [
  { key: "6m", label: "6M" },
  { key: "1y", label: "1Y" },
  { key: "2y", label: "2Y" },
  { key: "3y", label: "3Y" },
  { key: "5y", label: "5Y" },
  { key: "10y", label: "10Y" },
];

// What the page opens on, so the chart is already answering a question before
// anyone types: the loudest stock of the era against the index it beat.
export const DEFAULT_TICKERS = ["NVDA"];

// Same two hues the stock page compares in - blue for what you picked, orange
// for the benchmark it is measured against - then a hue per preset stacked on
// top of them.
export const PORTFOLIO_COLOR = "#60a5fa";
export const BENCHMARK_COLOR = "#f97316";
export const COMPARE_COLORS = ["#199e70", "#a06cd5", "#d9a326"];

// Starting stake. The chart plots what this grows to, because "$100,000
// became $163,410" is a number people read without converting anything.
export const STAKE = 100000;

// Side presets: one click to plot a basket beside yours - they are what you
// are measured against, not a replacement for what you picked. Each preset
// tracks its listed ETF or individual stock.
export const PRESETS = [
  { label: "S&P 500", note: "SPY", tickers: ["SPY"] },
  { label: "Nasdaq 100", note: "QQQ", tickers: ["QQQ"] },
  { label: "Russell 1000", note: "VONV", tickers: ["VONV"] },
  { label: "Semiconductors", note: "SOXX", tickers: ["SOXX"] },
  { label: "Asia Emerging Markets", note: "IEMG", tickers: ["IEMG"] },
  { label: "Europe, Austr. & Far East", note: "IEFA", tickers: ["IEFA"] },
  { label: "Nvidia", note: "NVDA", tickers: ["NVDA"] },
  { label: "Apple", note: "AAPL", tickers: ["AAPL"] },
  { label: "Alphabet", note: "GOOGL", tickers: ["GOOGL"] },
  { label: "Microsoft", note: "MSFT", tickers: ["MSFT"] },
  { label: "Amazon", note: "AMZN", tickers: ["AMZN"] },
  { label: "AMD", note: "AMD", tickers: ["AMD"] },
];

// Nearest 1/2/2.5/5/10 at the right magnitude, so an axis fitted to its data
// still lands its ticks on numbers worth reading (…, 50%, 100%, 150%, …).
function niceStep(raw) {
  if (!(raw > 0)) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * mag;
}

// The percent axis, fitted to the lines it actually holds. Rounded out to its
// own boundaries a basket that ran up 250% gets an axis to -100% and spends
// half the panel empty. Zero stays inside the range: it is the line both
// series started from.
export function fitPercentAxis(seriesList) {
  let lo = 0;
  let hi = 0;
  for (const values of seriesList) {
    for (const v of values) {
      if (!Number.isFinite(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  const pad = Math.max((hi - lo) * 0.06, 0.5);
  const min = lo - pad;
  const max = hi + pad;
  const step = niceStep((max - min) / 7);
  return { min, max, step, decimals: step >= 1 ? 0 : step >= 0.1 ? 1 : 2 };
}

// Yahoo timestamps are seconds; the day is the join key, so a ticker that
// halted for an afternoon still lines up with the rest.
const day = (t) => new Date(t * 1000).toISOString().slice(0, 10);

export function toSeries(points) {
  const map = new Map();
  for (const p of points ?? []) if (typeof p.c === "number") map.set(day(p.t), p.c);
  return map;
}

// seriesBySymbol: Map(date -> close) per symbol - every symbol any basket
// names, benchmark included.
// holdings: [{ symbol, weight }] - weights are relative and normalised here,
// so "50 / 30 / 20" and "5 / 3 / 2" are the same portfolio.
// comparisons: [{ label, note, tickers }] - preset baskets to plot alongside,
// each equally weighted across its own tickers.
//
// Only dates every symbol on the chart priced are plotted: a member that
// IPO'd last year would otherwise start its basket at a price it never traded
// at. That trims the window to the youngest line on it, which the page says
// out loud - and it is why a comparison is a line rather than a footnote.
export function buildComparison(seriesBySymbol, holdings, comparisons = []) {
  const priced = (symbol) => seriesBySymbol.get(symbol)?.size;
  const picks = holdings.filter((h) => h.weight > 0 && priced(h.symbol));
  if (!picks.length) return null;

  // Nothing is plotted beside your own basket unless it was asked for: the
  // S&P 500 is the comparison the page starts with, not one it insists on,
  // and it arrives through `comparisons` like any other.
  const baskets = [
    { key: "portfolio", label: "Your portfolio", note: picks.map((p) => p.symbol).join(", "), picks },
    ...comparisons
      .map((c) => ({
        key: c.label,
        label: c.label,
        note: c.note ?? c.tickers.join(", "),
        picks: c.tickers.filter(priced).map((symbol) => ({ symbol, weight: 1 })),
      }))
      .filter((b) => b.picks.length),
  ];

  const symbols = [...new Set(baskets.flatMap((b) => b.picks.map((p) => p.symbol)))];
  const firstDate = (symbol) => [...seriesBySymbol.get(symbol).keys()].sort()[0];
  const earliest = symbols.map(firstDate).sort()[0];
  const dates = [...seriesBySymbol.get(picks[0].symbol).keys()]
    .sort()
    .filter((d) => symbols.every((sym) => seriesBySymbol.get(sym).has(d)));
  if (dates.length < 2) return null;

  const first = dates[0];
  const last = dates[dates.length - 1];
  const growth = (symbol, d) => seriesBySymbol.get(symbol).get(d) / seriesBySymbol.get(symbol).get(first);

  const lines = baskets.map((b) => {
    const total = b.picks.reduce((a, p) => a + p.weight, 0);
    const values = dates.map(
      (d) => STAKE * b.picks.reduce((a, p) => a + (p.weight / total) * growth(p.symbol, d), 0)
    );
    const value = values[values.length - 1];
    return {
      ...b,
      values,
      // Plotted as percent change off a shared zero, which is the only way
      // $10,000 of one thing and $10,000 of another share an axis.
      series: values.map((v) => (v / STAKE - 1) * 100),
      value,
      changePct: (value / STAKE - 1) * 100,
    };
  });

  const portfolio = lines[0];
  const total = picks.reduce((a, h) => a + h.weight, 0);

  return {
    dates,
    lines,
    portfolioPct: portfolio.changePct,
    // Which holding, if any, is what the window starts at: a name that only
    // listed inside the range drags every line's start date forward with it,
    // and that is worth saying rather than quietly redrawing a shorter chart.
    limitedBy: symbols.filter(
      (sym) => firstDate(sym) === dates[0] && dates[0] > earliest
    ),
    // What each holding did on its own over the same window, for the table.
    legs: picks.map((h) => {
      // A holding's slice of the stake, not the whole of it: 33% of $100,000
      // in a name that doubled is $66,000, and showing $200,000 there made
      // three holdings look like three separate portfolios.
      const slice = STAKE * (h.weight / total);
      return {
        symbol: h.symbol,
        weight: (h.weight / total) * 100,
        pct: (growth(h.symbol, last) - 1) * 100,
        basis: slice,
        value: slice * growth(h.symbol, last),
      };
    }),
  };
}
