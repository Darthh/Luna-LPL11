// Metrics selectable from the tab row above the main chart. "fg" is the
// composite market sentiment index (0-100, fixed axis, red/green zone
// coloring); the rest are the raw sub-indicator series plotted on their own
// auto-scaled axis, same as https://en.macromicro.me's ticker-vs-indicator
// charts.
export const CHART_METRICS = [
  {
    key: "fg",
    label: "Market Sentiment Index",
    chartTitle: "Market Sentiment Index",
    axisLabel: "Index",
    min: 0,
    max: 100,
    format: (v) => Math.round(v).toString(),
    description:
      "The Market Sentiment Index blends seven market indicators into a single 0 to 100 reading. Use it with price strength, volatility, options activity, bond demand, and momentum to understand current market conditions.",
  },
  {
    key: "rsi_14",
    label: "70/30 RSI",
    chartTitle: "14-Day RSI - Overbought/Oversold",
    axisLabel: "RSI",
    min: 0,
    max: 100,
    // Computed client-side from the loaded ticker's own price history
    // (lib/rsi.js), not one of the index's sub-indicators - so it stays available even
    // in demo mode. See ChartPanel's computeFromPrice handling.
    computeFromPrice: true,
    format: (v) => (v == null ? "n/a" : v.toFixed(1)),
    description:
      "The 14 day RSI measures how fast and how far a stock's price has moved recently, on a 0 to 100 scale. A reading above 70 is overbought and often treated as a sell or take profit signal, while a reading below 30 is oversold and often treated as a buy signal.",
  },
  {
    key: "stock_price_strength",
    label: "Price Strength",
    chartTitle: "Net New 52-Week Highs & Lows (NYSE)",
    axisLabel: "Strength (%)",
    format: (v) => `${v.toFixed(2)}%`,
    description:
      "Price Strength compares how many NYSE stocks are setting new 52 week highs against how many are setting new 52 week lows. Far more highs than lows is a bullish, greedy sign many traders take as a reason to buy, while far more lows than highs is a bearish, fearful sign many take as a reason to sell.",
  },
  {
    key: "stock_price_breadth",
    label: "Price Breadth",
    chartTitle: "McClellan Volume Summation Index",
    axisLabel: "Breadth",
    format: (v) => v.toLocaleString(undefined, { maximumFractionDigits: 0 }),
    description:
      "Price Breadth, measured by the McClellan Volume Summation Index, tracks whether trading volume favors rising or falling NYSE stocks. A high reading well above zero is a bullish, greedy setup that supports buying, while a low or negative reading is a bearish, fearful setup that supports selling.",
  },
  {
    key: "put_call_options",
    label: "Put/Call Ratio",
    chartTitle: "CBOE Total Put/Call Ratio",
    axisLabel: "Ratio",
    format: (v) => v.toFixed(2),
    description:
      "The Put/Call Ratio compares how many bearish put options are being traded against bullish call options. A ratio roughly below 0.6 means calls dominate, a bullish signal contrarians often read as a caution to sell, while a ratio above 0.8 means puts dominate, a bearish signal contrarians often read as a buying opportunity.",
  },
  {
    key: "market_volatility_vix",
    label: "VIX 1D",
    chartTitle: "CBOE VIX - Daily Close",
    axisLabel: "VIX",
    format: (v) => v.toFixed(2),
    description:
      "The VIX, often called the market's fear gauge, measures how much volatility options traders expect in the S&P 500 over the next 30 days. A reading roughly below 20 signals a calm market good for holding or buying, while a reading above 30 signals fear driven selling that contrarians often treat as a longer term buying opportunity.",
  },
  {
    key: "junk_bond_demand",
    label: "Junk Bond Demand",
    chartTitle: "Junk Bond Demand Spread",
    axisLabel: "Spread (pp)",
    format: (v) => v.toFixed(2),
    description:
      "Junk Bond Demand tracks the yield spread between risky junk bonds and safer investment grade bonds. A narrowing spread is a greedy signal that supports buying stocks, while a widening spread is a fearful signal that supports selling or reducing risk.",
  },
  {
    key: "safe_haven_demand",
    label: "Safe Haven Demand",
    chartTitle: "Safe Haven Demand",
    axisLabel: "Return diff (%)",
    format: (v) => v.toFixed(2),
    description:
      "Safe Haven Demand compares 20 day returns on stocks against Treasury bonds. Stocks outperforming bonds is a greedy signal that supports staying invested, while bonds outperforming stocks is a fearful signal that supports selling stocks or raising cash.",
  },
];
