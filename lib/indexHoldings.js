// Public market indices do not publish portfolio files through the same feed
// as ETFs. Resolve the indices shown in our ticker tape to liquid funds whose
// holdings files can drive the existing wheel. Exact trackers are marked so
// the UI can distinguish them from broad country-market proxies.
const INDEX_HOLDING_TRACKERS = {
  "^GSPC": {
    symbol: "SPY",
    label: "S&P 500",
    name: "SPDR S&P 500 ETF Trust",
    exact: true,
  },
  "^IXIC": {
    symbol: "ONEQ",
    label: "NASDAQ",
    name: "Fidelity Nasdaq Composite Index ETF",
    exact: true,
  },
  "^DJI": {
    symbol: "DIA",
    label: "DOW 30",
    name: "SPDR Dow Jones Industrial Average ETF Trust",
    exact: true,
  },
  "^RUT": {
    symbol: "IWM",
    label: "RUSSELL 2000",
    name: "iShares Russell 2000 ETF",
    exact: true,
  },
  "^GSPTSE": {
    symbol: "EWC",
    label: "TSX",
    name: "iShares MSCI Canada ETF",
    exact: false,
  },
  "^MXX": {
    symbol: "EWW",
    label: "IPC",
    name: "iShares MSCI Mexico ETF",
    exact: false,
  },
  "^BVSP": {
    symbol: "EWZ",
    label: "BOVESPA",
    name: "iShares MSCI Brazil ETF",
    exact: false,
  },
  "^GDAXI": {
    symbol: "DAX",
    label: "DAX",
    name: "Global X DAX Germany ETF",
    exact: true,
  },
  "^FTSE": {
    symbol: "EWU",
    label: "FTSE 100",
    name: "iShares MSCI United Kingdom ETF",
    exact: false,
  },
  "^STOXX50E": {
    symbol: "FEZ",
    label: "EURO STOXX 50",
    name: "SPDR Euro Stoxx 50 ETF",
    exact: true,
  },
  "^FCHI": {
    symbol: "EWQ",
    label: "CAC 40",
    name: "iShares MSCI France ETF",
    exact: false,
  },
  "^SSMI": {
    symbol: "EWL",
    label: "SMI",
    name: "iShares MSCI Switzerland ETF",
    exact: false,
  },
  "^IBEX": {
    symbol: "EWP",
    label: "IBEX 35",
    name: "iShares MSCI Spain ETF",
    exact: false,
  },
  "^AEX": {
    symbol: "EWN",
    label: "AEX",
    name: "iShares MSCI Netherlands ETF",
    exact: false,
  },
  "FTSEMIB.MI": {
    symbol: "EWI",
    label: "FTSE MIB",
    name: "iShares MSCI Italy ETF",
    exact: false,
  },
  "^KS11": {
    symbol: "EWY",
    label: "KOSPI",
    name: "iShares MSCI South Korea ETF",
    exact: false,
  },
  "^N225": {
    symbol: "EWJ",
    label: "NIKKEI 225",
    name: "iShares MSCI Japan ETF",
    exact: false,
  },
  "^HSI": {
    symbol: "EWH",
    label: "HANG SENG",
    name: "iShares MSCI Hong Kong ETF",
    exact: false,
  },
  "^AXJO": {
    symbol: "EWA",
    label: "ASX 200",
    name: "iShares MSCI Australia ETF",
    exact: false,
  },
  "^NSEI": {
    symbol: "INDA",
    label: "NIFTY 50",
    name: "iShares MSCI India ETF",
    exact: false,
  },
  "000001.SS": {
    symbol: "MCHI",
    label: "SHANGHAI",
    name: "iShares MSCI China ETF",
    exact: false,
  },
  "^TWII": {
    symbol: "EWT",
    label: "TAIEX",
    name: "iShares MSCI Taiwan ETF",
    exact: false,
  },
  "^STI": {
    symbol: "EWS",
    label: "STI",
    name: "iShares MSCI Singapore ETF",
    exact: false,
  },
};

export function indexHoldingTracker(symbol) {
  return INDEX_HOLDING_TRACKERS[String(symbol ?? "").trim().toUpperCase()] ?? null;
}

export function supportsHoldings(symbol, quoteType) {
  return quoteType === "ETF" || (quoteType === "INDEX" && Boolean(indexHoldingTracker(symbol)));
}
