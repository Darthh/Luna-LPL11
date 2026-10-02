// What can be put on the home dashboard, and how each one is loaded.
//
// The dashboard holds at most MAX_WIDGETS at a time. That is a real constraint
// rather than a stylistic one: every widget here is a page's worth of component
// that fetches its own data, so a dashboard of eight is eight simultaneous
// upstream fan-outs on first paint.
//
// Every entry is loaded with next/dynamic, so a widget's code only ships when
// someone actually puts it on their dashboard - otherwise adding the treemap,
// the supply chain and the world map to this list would put all three in the
// home page's bundle for every visitor, including the ones who never add them.

import dynamic from "next/dynamic";

export const MAX_WIDGETS = 4;

// A widget is loading whenever its chunk is in flight; the panel it sits in
// already has a title bar, so the placeholder only has to hold the space.
const loading = () => <p className="widget-loading">Loading…</p>;

// `span` is the widget's default width in the twelve-column grid and `rows` its
// default height, both chosen to suit the shape of what it draws: a map or a
// chart wants width and height, a list wants neither. The reader drags from
// there and the choice is remembered.
export const WIDGETS = {
  gauge: {
    label: "Market sentiment",
    span: 7,
    rows: 1,
    // The gauge and the chart are fed by the home page's own state rather than
    // fetching for themselves, so they are rendered by Home directly. Listed
    // here so they can be closed and re-added like everything else.
    local: true,
  },
  // The compare picker and the chart it feeds are one tool - picking a ticker
  // has no meaning except to put it on the chart, and the chart is what you
  // were reading when you decided to change it. They were two panels, which
  // meant the control and its own result could be closed independently.
  chart: { label: "Index vs Stock", span: 12, rows: 2, local: true },
  indicators: { label: "Index components", span: 12, rows: 2, local: true },

  watchlist: {
    label: "My watchlist",
    span: 6,
    rows: 1,
    Component: dynamic(() => import("@/components/WatchlistPanel"), { loading }),
  },
  maps: {
    label: "Stock Maps",
    span: 12,
    rows: 2,
    Component: dynamic(() => import("@/components/StockMap"), { loading }),
  },
  supplyChain: {
    label: "Supply chain",
    span: 12,
    rows: 2,
    Component: dynamic(() => import("@/components/SupplyChain"), { loading }),
  },
  scatter: {
    label: "Chart metrics",
    span: 6,
    rows: 2,
    Component: dynamic(() => import("@/components/MetricScatter"), { loading }),
  },
  marketCap: {
    label: "Companies by market cap",
    span: 6,
    rows: 2,
    Component: dynamic(() => import("@/components/MarketCapRanking"), { loading }),
  },
  hedgeFunds: {
    label: "Hedgefund 13F's",
    span: 12,
    rows: 2,
    Component: dynamic(() => import("@/components/HedgeFunds"), { loading }),
  },
  // Events and the popular list used to hang off the bottom of the chart
  // panel, which meant closing the chart took two unrelated things with it.
  // They are panels of their own now.
  events: {
    label: "Upcoming events",
    span: 6,
    rows: 1,
    Component: dynamic(() => import("@/components/UpcomingEvents"), { loading }),
  },
  popular: {
    label: "Popular stocks",
    span: 6,
    rows: 1,
    Component: dynamic(() => import("@/components/PopularStocksCard"), { loading }),
  },
  screener: {
    label: "Stock screener",
    span: 12,
    rows: 2,
    Component: dynamic(() => import("@/components/StockScreener"), { loading }),
  },
  earnings: {
    label: "Earnings Calendar",
    span: 12,
    rows: 2,
    Component: dynamic(() => import("@/components/EarningsCalendarPanel"), { loading }),
  },
  portfolio: {
    label: "Portfolio comparison",
    span: 12,
    rows: 2,
    Component: dynamic(() => import("@/components/WhatIf"), { loading }),
  },
  regression: {
    label: "Regression Analysis",
    span: 12,
    rows: 2,
    Component: dynamic(() => import("@/components/RegressionAnalysis"), { loading }),
  },
  // The Graphs trio. Stock Info is the detail page's own body with a ticker
  // box in front of it; the other two are the same components their routes
  // render, which already carry their own controls.
  stockInfo: {
    label: "Stock Info",
    span: 12,
    rows: 2,
    Component: dynamic(
      () => import("@/app/stock/[symbol]/page").then((m) => m.StockInfoPanel),
      { loading }
    ),
  },
  valuation: {
    label: "Historical",
    span: 12,
    rows: 2,
    Component: dynamic(() => import("@/components/ValuationGraph"), { loading }),
  },
  valuationCompare: {
    label: "Comparison",
    span: 12,
    rows: 2,
    Component: dynamic(() => import("@/components/ValuationCompare"), { loading }),
  },
  worldMap: {
    label: "Company World Map",
    span: 12,
    rows: 2,
    Component: dynamic(() => import("@/components/CompanyWorldMap"), { loading }),
  },
};

// What a dashboard looks like before anyone has changed it: the reading, what
// it is being compared against, and the chart of the two.
export const DEFAULT_LAYOUT = [
  { id: "gauge", span: 12, rows: 1 },
  { id: "chart", span: 12, rows: 2 },
];

export const KEY = "dashboardLayout";

// A stored layout is read back with the widget list as the authority: an id
// that no longer exists (a widget removed in a later release) is dropped rather
// than rendering an empty panel, and a span outside the grid is clamped.
export function readLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!Array.isArray(saved)) return DEFAULT_LAYOUT;
    const clean = saved
      .filter((w) => w && WIDGETS[w.id])
      .slice(0, MAX_WIDGETS)
      .map((w) => ({
        id: w.id,
        span: Math.min(12, Math.max(3, Number(w.span) || WIDGETS[w.id].span)),
        rows: Number.isFinite(Number(w.rows)) ? Math.max(1, Math.round(Number(w.rows))) : WIDGETS[w.id].rows || 1,
      }));
    // An empty dashboard is a state the reader can reach by closing everything,
    // and it is a legitimate one - it should not silently refill.
    return clean;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function writeLayout(layout) {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    // A browser refusing storage costs the reader their arrangement on the next
    // visit, which is not worth failing a render over.
  }
}
