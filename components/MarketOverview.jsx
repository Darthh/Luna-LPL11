"use client";

import IndexPerformance from "./IndexPerformance";
import MarketNewsPanel from "./MarketNewsPanel";
import QuotePanel from "./QuotePanel";
import { GLOBAL_MARKETS, US_EQUITY, US_SECTORS_PANEL } from "@/lib/overviewPanels";

// The front page: what the market did, in one screen. Two columns on a wide
// display - the quote lists down a narrow left rail, the news and the chart
// taking the rest - collapsing to one column on a phone.
//
// Yields and commodities/FX are not here. They have their own pages, and the
// board reads better giving that width to the two things a reader actually
// stops on: the headlines and the chart.
//
// Every panel here is read-only and links out to the page that goes deeper, so
// this is a starting point rather than a second copy of those pages.
export default function MarketOverview() {
  return (
    <div className="ov-page">
      <div className="ov-grid">
        <div className="ov-col">
          <QuotePanel title="U.S. equity markets" groups={US_EQUITY} href="/lots-of-charts" />
          <QuotePanel title="U.S. equity sectors" groups={US_SECTORS_PANEL} href="/us-sectors" />
          <QuotePanel title="Global markets" groups={GLOBAL_MARKETS} href="/country-etfs" />
        </div>

        <div className="ov-col">
          <MarketNewsPanel />
          <IndexPerformance />
        </div>
      </div>
    </div>
  );
}
