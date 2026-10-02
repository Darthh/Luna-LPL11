"use client";

import CompareBoard from "@/components/CompareBoard";
import GlobalMarkets from "@/components/GlobalMarkets";
import { GLOBAL_MARKET_GROUPS } from "@/lib/compareBoards";

const DEFAULT = ["^GSPC", "^IXIC", "^GDAXI", "^N225", "GC=F", "CL=F"];

export default function GlobalMarketsBoard() {
  return (
    <div className="global-markets-page">
      <header className="cmp-head">
        <div>
          <h1>Global Markets</h1>
          <p>Live prices and normalized performance across major world indexes, volatility, and commodities.</p>
        </div>
      </header>

      <section className="global-markets-live" aria-labelledby="global-markets-live-heading">
        <div className="global-markets-section-head">
          <h2 id="global-markets-live-heading">Current prices</h2>
          <span>Refreshes every minute</span>
        </div>
        <GlobalMarkets />
      </section>

      <CompareBoard
        title="Global Markets"
        subtitle=""
        groups={GLOBAL_MARKET_GROUPS}
        defaultPicked={DEFAULT}
        showHeader={false}
      />
    </div>
  );
}
