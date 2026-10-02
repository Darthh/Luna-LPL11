// The starting shelf of model portfolios: strategies an advisor picks from
// rather than builds. Each is a target allocation, which is what a model is -
// it holds weights, not share counts, and is rebalanced back to them.
//
// Built out of broad, liquid ETFs so every sleeve has a decade of real closes
// behind it, which is what the CAGR columns need. The numbers in the table are
// then computed from those holdings by /api/portfolio-performance rather than
// stored here - a model whose returns were typed in would drift from the truth
// the moment the market moved.
export const MODEL_PORTFOLIOS = [
  {
    id: "aggressive-80-10-10",
    name: "Aggressive (80/10/10)",
    blurb: "Equity-led growth with a small bond and real-asset ballast.",
    holdings: [
      { symbol: "VTI", weight: 55 },
      { symbol: "VXUS", weight: 25 },
      { symbol: "BND", weight: 10 },
      { symbol: "VNQ", weight: 10 },
    ],
  },
  {
    id: "aggressive-growth-80-20",
    name: "Aggressive Growth (80/20)",
    blurb: "Four fifths equity, one fifth core bonds.",
    holdings: [
      { symbol: "VTI", weight: 50 },
      { symbol: "VXUS", weight: 30 },
      { symbol: "BND", weight: 20 },
    ],
  },
  {
    id: "balanced-global",
    name: "Balanced - Global",
    blurb: "The classic 60/40, split globally on the equity side.",
    holdings: [
      { symbol: "VTI", weight: 36 },
      { symbol: "VXUS", weight: 24 },
      { symbol: "BND", weight: 30 },
      { symbol: "BNDX", weight: 10 },
    ],
  },
  {
    id: "sixty-forty",
    name: "60/40 portfolio",
    blurb: "US equity against US investment-grade bonds.",
    holdings: [
      { symbol: "VOO", weight: 60 },
      { symbol: "BND", weight: 40 },
    ],
  },
  {
    id: "equity-sleeve",
    name: "Equity sleeve",
    blurb: "The equity half on its own, for blending into a wider plan.",
    holdings: [
      { symbol: "VTI", weight: 60 },
      { symbol: "VXUS", weight: 30 },
      { symbol: "VBR", weight: 10 },
    ],
  },
  {
    id: "bond-sleeve",
    name: "Bond sleeve",
    blurb: "Duration and credit only - the ballast, held separately.",
    holdings: [
      { symbol: "BND", weight: 50 },
      { symbol: "BNDX", weight: 25 },
      { symbol: "TIP", weight: 25 },
    ],
  },
  {
    id: "income-us",
    name: "Income - US",
    blurb: "Dividend equity and bonds, run for the payout.",
    holdings: [
      { symbol: "VYM", weight: 40 },
      { symbol: "SCHD", weight: 20 },
      { symbol: "BND", weight: 30 },
      { symbol: "VNQ", weight: 10 },
    ],
  },
  {
    id: "growth-us",
    name: "Growth - US",
    blurb: "US large-cap growth, concentrated by design.",
    holdings: [
      { symbol: "VUG", weight: 60 },
      { symbol: "QQQ", weight: 30 },
      { symbol: "VTI", weight: 10 },
    ],
  },
  {
    id: "conservative-30-70",
    name: "Conservative (30/70)",
    blurb: "Capital preservation first, with a growth sleeve.",
    holdings: [
      { symbol: "VTI", weight: 20 },
      { symbol: "VXUS", weight: 10 },
      { symbol: "BND", weight: 50 },
      { symbol: "TIP", weight: 20 },
    ],
  },
  {
    id: "all-weather",
    name: "All Weather",
    blurb: "Spread across regimes rather than bet on one.",
    holdings: [
      { symbol: "VTI", weight: 30 },
      { symbol: "TLT", weight: 40 },
      { symbol: "IEF", weight: 15 },
      { symbol: "GLD", weight: 7.5 },
      { symbol: "DBC", weight: 7.5 },
    ],
  },
];

export const MODEL_BY_ID = Object.fromEntries(MODEL_PORTFOLIOS.map((m) => [m.id, m]));
