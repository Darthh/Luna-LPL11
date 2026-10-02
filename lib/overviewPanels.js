// The fixed symbol lists behind the home overview's quote panels. Same
// reasoning as lib/compareBoards.js: "the eleven sector SPDRs" and "one ETF per
// major region" move on the order of years, and a scrape would put a live
// dependency under a list that does not change.
//
// Every panel is a list of groups so the panel component can render one shape
// whatever it is fed, and each row is priced through /api/watchlist-quotes.

export const US_EQUITY = [
  {
    label: "Major indices & ETFs",
    rows: [
      { symbol: "SPY", label: "S&P 500" },
      { symbol: "QQQ", label: "Nasdaq 100" },
      { symbol: "DIA", label: "Dow Jones" },
      { symbol: "IWM", label: "Russell 2000" },
      { symbol: "MDY", label: "S&P Midcap 400" },
      { symbol: "VTI", label: "Total US Market" },
    ],
  },
  {
    label: "Volatility",
    rows: [{ symbol: "^VIX", label: "CBOE VIX" }],
  },
];

export const US_SECTORS_PANEL = [
  {
    label: "S&P sector ETFs",
    rows: [
      { symbol: "XLK", label: "Technology" },
      { symbol: "XLC", label: "Communications" },
      { symbol: "XLY", label: "Cons. Discretionary" },
      { symbol: "XLP", label: "Cons. Staples" },
      { symbol: "XLE", label: "Energy" },
      { symbol: "XLF", label: "Financials" },
      { symbol: "XLV", label: "Health Care" },
      { symbol: "XLI", label: "Industrials" },
      { symbol: "XLB", label: "Materials" },
      { symbol: "XLRE", label: "Real Estate" },
      { symbol: "XLU", label: "Utilities" },
    ],
  },
];

export const GLOBAL_MARKETS = [
  {
    label: "Broad markets",
    rows: [
      { symbol: "ACWI", label: "All Country World" },
      { symbol: "EFA", label: "Developed ex-US" },
      { symbol: "EEM", label: "Emerging Markets" },
    ],
  },
  {
    label: "Developed markets",
    rows: [
      { symbol: "EWJ", label: "Japan" },
      { symbol: "EWG", label: "Germany" },
      { symbol: "EWQ", label: "France" },
      { symbol: "EWU", label: "United Kingdom" },
      { symbol: "EWA", label: "Australia" },
      { symbol: "EWC", label: "Canada" },
    ],
  },
  {
    label: "Emerging markets",
    rows: [
      { symbol: "FXI", label: "China" },
      { symbol: "EWY", label: "South Korea" },
      { symbol: "INDA", label: "India" },
      { symbol: "EWZ", label: "Brazil" },
      { symbol: "EWW", label: "Mexico" },
      { symbol: "EZA", label: "South Africa" },
    ],
  },
];

// The three the middle chart opens on - the indices every US market summary
// leads with.
export const HEADLINE_INDEXES = [
  { symbol: "SPY", label: "S&P 500" },
  { symbol: "QQQ", label: "Nasdaq 100" },
  { symbol: "DIA", label: "Dow Jones" },
];
