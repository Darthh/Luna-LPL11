// The two fixed symbol lists behind /country-etfs and /us-sectors. Plain data
// rather than a fetch: the constituents of "the eleven US sectors" and "one
// ETF per country" change on the order of years, and a scrape would put a
// live dependency under a list that does not move.

// One liquid, US-listed ETF per country, grouped the way an allocator reads a
// world map. iShares MSCI single-country funds throughout except where a
// cheaper or older fund is the one that actually trades (EWZ, FXI, EWJ).
export const COUNTRY_GROUPS = [
  {
    label: "Americas",
    rows: [
      { symbol: "SPY", label: "United States" },
      { symbol: "EWC", label: "Canada" },
      { symbol: "EWW", label: "Mexico" },
      { symbol: "EWZ", label: "Brazil" },
      { symbol: "ARGT", label: "Argentina" },
      { symbol: "ECH", label: "Chile" },
      { symbol: "EPU", label: "Peru" },
      { symbol: "GXG", label: "Colombia" },
    ],
  },
  {
    label: "Europe",
    rows: [
      { symbol: "EWU", label: "United Kingdom" },
      { symbol: "EWG", label: "Germany" },
      { symbol: "EWQ", label: "France" },
      { symbol: "EWI", label: "Italy" },
      { symbol: "EWP", label: "Spain" },
      { symbol: "EWN", label: "Netherlands" },
      { symbol: "EWL", label: "Switzerland" },
      { symbol: "EWD", label: "Sweden" },
      { symbol: "ENOR", label: "Norway" },
      { symbol: "EFNL", label: "Finland" },
      { symbol: "EWO", label: "Austria" },
      { symbol: "EIRL", label: "Ireland" },
      { symbol: "GREK", label: "Greece" },
      { symbol: "EPOL", label: "Poland" },
      { symbol: "TUR", label: "Turkey" },
    ],
  },
  {
    label: "Asia / Pacific",
    rows: [
      { symbol: "EWJ", label: "Japan" },
      { symbol: "FXI", label: "China" },
      { symbol: "EWH", label: "Hong Kong" },
      { symbol: "EWT", label: "Taiwan" },
      { symbol: "EWY", label: "South Korea" },
      { symbol: "INDA", label: "India" },
      { symbol: "EWS", label: "Singapore" },
      { symbol: "EWA", label: "Australia" },
      { symbol: "EWM", label: "Malaysia" },
      { symbol: "THD", label: "Thailand" },
      { symbol: "EIDO", label: "Indonesia" },
      { symbol: "EPHE", label: "Philippines" },
      { symbol: "VNM", label: "Vietnam" },
    ],
  },
  {
    label: "Middle East / Africa",
    rows: [
      { symbol: "EIS", label: "Israel" },
      { symbol: "KSA", label: "Saudi Arabia" },
      { symbol: "UAE", label: "UAE" },
      { symbol: "QAT", label: "Qatar" },
      { symbol: "EZA", label: "South Africa" },
    ],
  },
];

export const GLOBAL_MARKET_GROUPS = [
  {
    label: "Americas / Europe",
    rows: [
      { symbol: "^GSPC", label: "S&P 500" },
      { symbol: "^IXIC", label: "Nasdaq Composite" },
      { symbol: "^GSPTSE", label: "S&P/TSX Composite" },
      { symbol: "^FTSE", label: "FTSE 100" },
      { symbol: "^GDAXI", label: "DAX" },
      { symbol: "^STOXX50E", label: "Euro Stoxx 50" },
      { symbol: "^FCHI", label: "CAC 40" },
    ],
  },
  {
    label: "Asia",
    rows: [
      { symbol: "^N225", label: "Nikkei 225" },
      { symbol: "^HSI", label: "Hang Seng" },
      { symbol: "000001.SS", label: "Shanghai Composite" },
      { symbol: "^KS11", label: "KOSPI" },
      { symbol: "^NSEI", label: "Nifty 50" },
      { symbol: "^TWII", label: "TAIEX" },
    ],
  },
  {
    label: "Risk / commodities",
    rows: [
      { symbol: "^VIX", label: "VIX" },
      { symbol: "GC=F", label: "Gold" },
      { symbol: "CL=F", label: "Crude Oil" },
    ],
  },
];

// The eleven SPDR Select Sector funds, then the industry ETFs that cut across
// them - semis and homebuilders are the two most-watched slices of the market
// that no sector fund isolates.
export const SECTOR_GROUPS = [
  {
    label: "US sectors",
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
  {
    label: "US industries",
    rows: [
      { symbol: "SMH", label: "Semiconductors" },
      { symbol: "ITB", label: "Homebuilders" },
      { symbol: "KRE", label: "Regional Banks" },
      { symbol: "JETS", label: "Airlines" },
      { symbol: "XRT", label: "Retail" },
      { symbol: "TAN", label: "Solar" },
      { symbol: "XME", label: "Metals & Mining" },
      { symbol: "MOO", label: "Agriculture" },
      { symbol: "AMLP", label: "MLPs" },
    ],
  },
];

// Yahoo quotes FX as "PAIR=X" - the base/quote order is fixed per pair (there
// is no USDEUR feed, only EURUSD), so the label says which way each one reads
// rather than forcing them all into one convention.
export const CURRENCY_GROUPS = [
  {
    label: "Major FX crosses",
    rows: [
      { symbol: "EURUSD=X", label: "Euro / USD" },
      { symbol: "GBPUSD=X", label: "British Pound / USD" },
      { symbol: "USDJPY=X", label: "USD / Japanese Yen" },
      { symbol: "USDCHF=X", label: "USD / Swiss Franc" },
      { symbol: "USDCAD=X", label: "USD / Canadian Dollar" },
      { symbol: "AUDUSD=X", label: "Australian Dollar / USD" },
      { symbol: "NZDUSD=X", label: "New Zealand Dollar / USD" },
    ],
  },
  {
    label: "Euro vs",
    rows: [
      { symbol: "EURGBP=X", label: "British Pound" },
      { symbol: "EURCHF=X", label: "Swiss Franc" },
      { symbol: "EURSEK=X", label: "Swedish Krona" },
      { symbol: "EURNOK=X", label: "Norwegian Krone" },
      { symbol: "EURPLN=X", label: "Polish Zloty" },
      { symbol: "EURHUF=X", label: "Hungarian Forint" },
    ],
  },
  {
    label: "USD vs",
    rows: [
      { symbol: "USDCNH=X", label: "Chinese Yuan Offshore" },
      { symbol: "USDHKD=X", label: "Hong Kong Dollar" },
      { symbol: "USDSGD=X", label: "Singapore Dollar" },
      { symbol: "USDINR=X", label: "Indian Rupee" },
      { symbol: "USDKRW=X", label: "South Korean Won" },
      { symbol: "USDTWD=X", label: "Taiwan Dollar" },
      { symbol: "USDTHB=X", label: "Thai Baht" },
      { symbol: "USDMYR=X", label: "Malaysian Ringgit" },
      { symbol: "USDIDR=X", label: "Indonesian Rupiah" },
      { symbol: "USDPHP=X", label: "Philippine Peso" },
      { symbol: "USDBRL=X", label: "Brazilian Real" },
      { symbol: "USDMXN=X", label: "Mexican Peso" },
      { symbol: "USDTRY=X", label: "Turkish Lira" },
      { symbol: "USDZAR=X", label: "South African Rand" },
    ],
  },
];

// The ten currencies the cross-rate matrix is built over. Every cell is one
// currency measured in another, which needs a rate between each pair - so the
// matrix is computed from each currency's move against the USD rather than
// from 45 separate pair feeds.
export const MATRIX_CURRENCIES = [
  { code: "USD", label: "US Dollar" },
  { code: "EUR", label: "Euro" },
  { code: "GBP", label: "British Pound" },
  { code: "JPY", label: "Japanese Yen" },
  { code: "CHF", label: "Swiss Franc" },
  { code: "AUD", label: "Australian Dollar" },
  { code: "NZD", label: "New Zealand Dollar" },
  { code: "CAD", label: "Canadian Dollar" },
  { code: "SEK", label: "Swedish Krona" },
  { code: "NOK", label: "Norwegian Krone" },
];
