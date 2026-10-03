// The navigation tree and its glyphs, shared by the terminal sidebar
// (components/TerminalNav.jsx) and the top bar's mobile <select>. It lived in
// Header.jsx until the sidebar needed the same tree; one copy means a new page
// is added in one place and appears in both.

// One glyph per destination, drawn from the shape of the page it opens: a
// filing for the 13Fs, tiles for the treemap, linked nodes for the supply
// chain, plotted points for the scatter, and so on. Inline paths rather than
// an icon package - seven of these is not a dependency, and they inherit the
// pill's colour on hover for free by drawing in currentColor.
//
// Elements rather than components: they take no props and never change, so
// each is built once here and dropped into the pill below. Every one is drawn
// on the same 24-unit grid at the same stroke weight so the row reads evenly.
const svg = (children) => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
    {children}
  </svg>
);

const stroke = { stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };

// A filed document with a fold: what a 13F is.
const FilingIcon = svg(
  <>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" {...stroke} />
    <path d="M14 3v5h5" {...stroke} />
    <path d="M9 13h6M9 17h4" {...stroke} />
  </>
);

// Tiles of different sizes: the treemap the maps page draws.
const MapIcon = svg(
  <>
    <rect x="3" y="3" width="9" height="11" rx="1.5" {...stroke} />
    <rect x="14" y="3" width="7" height="6" rx="1.5" {...stroke} />
    <rect x="14" y="11" width="7" height="10" rx="1.5" {...stroke} />
    <rect x="3" y="16" width="9" height="5" rx="1.5" {...stroke} />
  </>
);

// Nodes wired to a node: supplier to company to customer.
const ChainIcon = svg(
  <>
    <circle cx="4.5" cy="6" r="2" {...stroke} />
    <circle cx="4.5" cy="18" r="2" {...stroke} />
    <circle cx="12" cy="12" r="2.2" {...stroke} />
    <circle cx="19.5" cy="12" r="2" {...stroke} />
    <path d="M6.5 6.8 10 10.6M6.5 17.2 10 13.4M14.2 12h3.3" {...stroke} />
  </>
);

// Points on two axes: the scatter itself.
const ScatterIcon = svg(
  <>
    <path d="M4 3v17h17" {...stroke} />
    <circle cx="9" cy="15" r="1.6" fill="currentColor" />
    <circle cx="13" cy="10" r="1.6" fill="currentColor" />
    <circle cx="18" cy="6" r="1.6" fill="currentColor" />
  </>
);

// A funnel: many companies in, the few that pass out.
const ScreenerIcon = svg(<path d="M3.5 5h17l-6.5 7.5V20l-4-2.5v-5z" {...stroke} />);

// Flame, for what everyone is talking about this week.
const HotIcon = svg(
  <>
    <path d="M12 3s5 4.2 5 9a5 5 0 0 1-10 0c0-1.9 1-3.4 1.8-4.3.3 1.2 1 2 1.9 2.2C11 8.4 11.3 5.6 12 3z" {...stroke} />
  </>
);

// A bookmark: the list you keep.
const WatchlistIcon = svg(<path d="M6 3.8h12v17l-6-4.2-6 4.2z" {...stroke} />);

// Crossed tools: the four analysis pages, under one pill.
const ToolsIcon = svg(
  <>
    <path d="M14.5 6.5a3.5 3.5 0 0 0 4.6 4.6L21 20l-1.6 1.6-8.4-8.4a3.5 3.5 0 0 0-4.6-4.6L9 11l-2 2-2.4-2.4a5 5 0 0 1 9.9-4.1z" {...stroke} />
  </>
);

// A dial: the meter and the readings the home page is built around.
const DashboardIcon = svg(
  <>
    <path d="M4 18a8 8 0 1 1 16 0" {...stroke} />
    <path d="M12 18l4.5-5.5" {...stroke} />
  </>
);

// A calendar page: what's coming up.
const CalendarIcon = svg(
  <>
    <rect x="3.5" y="5" width="17" height="15" rx="2" {...stroke} />
    <path d="M3.5 10h17M8 3v4M16 3v4" {...stroke} />
  </>
);

// Two series crossing: the index plotted against a stock.
const CompareIcon = svg(
  <>
    <path d="M4 4v16h16" {...stroke} />
    <path d="M7 16l4-6 3 3 4-7" {...stroke} />
  </>
);


// A globe with an HQ pin: the company world map.
const WorldMapIcon = svg(
  <>
    <circle cx="12" cy="12" r="8.5" {...stroke} />
    <path d="M3.8 12h16.4M12 3.5c2.3 2.3 3.5 5.1 3.5 8.5S14.3 18.2 12 20.5M12 3.5C9.7 5.8 8.5 8.6 8.5 12c0 1.7.3 3.3.9 4.7" {...stroke} />
    <circle cx="16.8" cy="16.7" r="2.1" fill="currentColor" stroke="none" />
  </>
);

// A cursor over a surface: the pages you play with rather than read.
const InteractiveIcon = svg(
  <>
    <path d="M4 4l6.5 16 2.3-6.2L19 11.5z" {...stroke} />
    <path d="M13 14l5.5 5.5" {...stroke} />
  </>
);

// Bars falling by height: a board ranked by size.
const RankIcon = svg(
  <>
    <path d="M4 20V9" {...stroke} />
    <path d="M10 20V4" {...stroke} />
    <path d="M16 20v-7" {...stroke} />
    <path d="M20.5 20V15" {...stroke} />
  </>
);

// A dollar sign inside a market-price ring: the SPY-only RSI strategy.
const DollarIcon = svg(
  <>
    <circle cx="12" cy="12" r="9" {...stroke} />
    <path d="M15.5 8.2c-.8-.8-1.9-1.2-3.3-1.2-1.8 0-3.2.9-3.2 2.3 0 3.7 6.4 1.7 6.4 5.4 0 1.5-1.4 2.5-3.4 2.5-1.5 0-2.8-.5-3.7-1.4M12 5v14" {...stroke} />
  </>
);

// A four-pane grid: several charts at once rather than one at a time.
const GridChartIcon = svg(
  <>
    <rect x="3" y="3" width="8" height="8" rx="1.5" {...stroke} />
    <rect x="13" y="3" width="8" height="8" rx="1.5" {...stroke} />
    <rect x="3" y="13" width="8" height="8" rx="1.5" {...stroke} />
    <rect x="13" y="13" width="8" height="8" rx="1.5" {...stroke} />
  </>
);

// A globe carrying a rising line: index funds by country.
const CountryEtfIcon = svg(
  <>
    <circle cx="12" cy="12" r="9" {...stroke} />
    <path d="M3.4 9.5h17.2M3.4 14.5h17.2" {...stroke} />
    <path d="M12 3c2.6 2.6 2.6 15.4 0 18M12 3c-2.6 2.6-2.6 15.4 0 18" {...stroke} />
  </>
);

// Stacked bars of unequal height: the sectors ranked against each other.
const SectorIcon = svg(
  <>
    <path d="M4 20V13" {...stroke} />
    <path d="M9.3 20V7" {...stroke} />
    <path d="M14.7 20v-9" {...stroke} />
    <path d="M20 20V4" {...stroke} />
  </>
);

// Two banknote-ish rounds overlapping: one currency priced in another.
const CurrencyIcon = svg(
  <>
    <circle cx="9.5" cy="9.5" r="5.5" {...stroke} />
    <circle cx="15" cy="15" r="5.5" {...stroke} />
  </>
);

// A curve rising and flattening: the shape of a yield curve.
const YieldIcon = svg(
  <>
    <path d="M3.5 18c4-9 9-11.5 17-12.5" {...stroke} />
    <path d="M3.5 4v16h17" {...stroke} />
  </>
);

export const ChevronIcon = svg(<path d="M6 9.5 12 15.5 18 9.5" {...stroke} />);

// No Home pill: the logo beside it already goes home, which is where every
// site puts that link, and the row has better uses for the width.
//
// Three of the pills are menus: the home-page sections, the analysis pages and
// the things you play with each collapse into one, which is what keeps the row
// on a single line. `items` is what makes an entry a menu; everything without
// it is still a plain pill.

// Advisor Tools: a briefcase for the client book, a pie for the models, a
// sheet for the reports.
const BriefcaseIcon = svg(
  <>
    <rect x="3" y="7.5" width="18" height="12" rx="2" {...stroke} />
    <path d="M9 7.5V5.5h6v2" {...stroke} />
  </>
);
const PieIcon = svg(
  <>
    <circle cx="12" cy="12" r="8.5" {...stroke} />
    <path d="M12 3.5V12l6 6" {...stroke} />
  </>
);
const ReportIcon = svg(
  <>
    <path d="M6 3.5h8L18.5 8v12.5h-12z" {...stroke} />
    <path d="M9 12h6M9 16h4" {...stroke} />
  </>
);


// The Graphs entries in Research tools: a candle for the stock page, stacked
// lines for the multiple history, two diverging lines for the comparison.
const CandleIcon = svg(
  <>
    <path d="M8 4v16M16 4v16" {...stroke} />
    <rect x="5.5" y="8" width="5" height="8" rx="1" {...stroke} />
    <rect x="13.5" y="6" width="5" height="9" rx="1" {...stroke} />
  </>
);
const MultiplesIcon = svg(
  <>
    <path d="M3.5 7h17M3.5 12h17M3.5 17h17" {...stroke} />
    <path d="M7 5.5v3M13 10.5v3M17 15.5v3" {...stroke} />
  </>
);
const CompareLinesIcon = svg(
  <>
    <path d="M3.5 18 9 11l4 3.5 7.5-9" {...stroke} />
    <path d="M3.5 12.5 9 17l4-2 7.5 4" {...stroke} />
  </>
);



export const NAV_LINKS = [
  {
    label: "Advisor Tools",
    icon: BriefcaseIcon,
    items: [
      { href: "/finance-crm", label: "Finance CRM", icon: BriefcaseIcon },
      { href: "/client-portfolios", label: "Client Portfolios", icon: BriefcaseIcon },
      { href: "/model-portfolios", label: "Model Portfolios", icon: PieIcon },
      { href: "/reports", label: "Reports", icon: ReportIcon },
      { href: "/hedge-funds", label: "13F Filings", icon: FilingIcon, widget: "hedgeFunds" },
    ],
  },
  {
    label: "Graphs",
    icon: DashboardIcon,
    items: [
      { href: "/stock/NVDA", label: "Stock quote", icon: CandleIcon, widget: "stockInfo" },
      { href: "/chart-metrics", label: "Charted metrics", icon: ScatterIcon, widget: "scatter" },
      { href: "/portfolio-comparison", label: "Portfolio comparison", icon: CompareIcon, widget: "portfolio" },
      { href: "/regression-analysis", label: "Regression analysis", icon: ScatterIcon, widget: "regression" },
      { href: "/graphs/historical", label: "Historical metrics (Historical)", icon: MultiplesIcon, widget: "valuation" },
      { href: "/graphs/comparison", label: "Company comparison (Comparison)", icon: CompareLinesIcon, widget: "valuationCompare" },
      { href: "/rsi-le", label: "1M Live chart", icon: DollarIcon },
    ],
  },
  {
    label: "Research tools",
    icon: ToolsIcon,
    items: [
      { href: "/maps", label: "Stock maps", icon: MapIcon, widget: "maps" },
      { href: "/supply-chain", label: "Supply chain", icon: ChainIcon, widget: "supplyChain" },
      { href: "/screener", label: "Stock screener", icon: ScreenerIcon, widget: "screener" },
      { href: "/market-movers", label: "Market movers", icon: HotIcon },
      { href: "/earnings-calendar", label: "Earnings calendar", icon: CalendarIcon, widget: "earnings" },
      { href: "/market-cap", label: "Companies by market cap", icon: RankIcon, widget: "marketCap" },
      { href: "/company-world-map", label: "Company world map", icon: WorldMapIcon, widget: "worldMap" },
      { href: "/dashboard#fear-greed", label: "Market sentiment", icon: DashboardIcon, widget: "gauge" },
      { href: "/dashboard#compare-vs", label: "Index vs Stock", icon: CompareIcon, widget: "chart" },
      { href: "/dashboard#upcoming-events", label: "Upcoming events", icon: CalendarIcon, widget: "events" },
      { href: "/dashboard#popular-stocks", label: "Top 20 Popular stocks", icon: HotIcon, widget: "popular" },
    ],
  },
  {
    label: "Interactive",
    icon: InteractiveIcon,
    items: [
      { href: "/global-markets", label: "Global markets", icon: CountryEtfIcon },
      { href: "/lots-of-charts", label: "Lots of Charts", icon: GridChartIcon },
      { href: "/country-etfs", label: "Country ETFs", icon: CountryEtfIcon },
      { href: "/us-sectors", label: "US Sectors", icon: SectorIcon },
      { href: "/currencies", label: "Major Currencies", icon: CurrencyIcon },
      { href: "/global-yields", label: "Global Yields", icon: YieldIcon },
    ],
  },
  { href: "/watchlist", label: "Create watchlist", icon: WatchlistIcon, widget: "watchlist" },
];

// Every destination, flat - for the phone <select> and the active-pill test.
// Every destination, flat - for the phone <select> and the active-link test.
export const ALL_LINKS = NAV_LINKS.flatMap((l) => l.items ?? [l]);
