// Single source of truth for the ticker tape's instrument list: our display
// key/label plus the Yahoo Finance chart-endpoint symbol used to fetch it.
//
// Country flags are rendered as small flagcdn.com images rather than Unicode
// flag emoji - Windows' default emoji font (Segoe UI Emoji) deliberately
// renders flag emoji as plain two-letter ISO codes instead of flag icons, so
// emoji flags don't actually show as flags for a lot of users. Gold/Oil use
// plain emoji instead since those aren't country flags and render fine.
export const TICKER_TAPE_INSTRUMENTS = [
  { key: "SPX", label: "S&P 500", symbol: "^GSPC", kind: "index", flagCode: "us" },
  { key: "NDX", label: "Nasdaq", symbol: "^IXIC", kind: "index", flagCode: "us" },
  { key: "VIX", label: "VIX", symbol: "^VIX", kind: "index", flagCode: "us" },
  { key: "TSX", label: "TSX", symbol: "^GSPTSE", kind: "index", flagCode: "ca" },
  // Germany is retained as the cutoff market; country benchmarks below it are omitted.
  { key: "DAX", label: "DAX", symbol: "^GDAXI", kind: "index", flagCode: "de" },
  { key: "FTSE", label: "FTSE 100", symbol: "^FTSE", kind: "index", flagCode: "gb" },
  { key: "STOXX", label: "Euro Stoxx 50", symbol: "^STOXX50E", kind: "index", flagCode: "eu" },
  { key: "CAC", label: "CAC 40", symbol: "^FCHI", kind: "index", flagCode: "fr" },
  { key: "KOSPI", label: "KOSPI", symbol: "^KS11", kind: "index", flagCode: "kr" },
  { key: "N225", label: "Nikkei 225", symbol: "^N225", kind: "index", flagCode: "jp" },
  { key: "HSI", label: "HSI", symbol: "^HSI", kind: "index", flagCode: "hk" },
  { key: "NIFTY", label: "Nifty 50", symbol: "^NSEI", kind: "index", flagCode: "in" },
  { key: "SHCOMP", label: "Shanghai", symbol: "000001.SS", kind: "index", flagCode: "cn" },
  { key: "TAIEX", label: "TAIEX", symbol: "^TWII", kind: "index", flagCode: "tw" },
  { key: "GOLD", label: "Gold", symbol: "GC=F", kind: "commodity", emoji: "🪙" },
  { key: "OIL", label: "Crude Oil", symbol: "CL=F", kind: "commodity", emoji: "🛢️" },
];
