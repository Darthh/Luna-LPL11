"use client";

import { useEffect, useState } from "react";
import { changeClass } from "@/lib/change";
import { hideBrokenLogo, logoUrl } from "@/lib/companyLogo";
import { formatCapShort, formatCount } from "@/lib/formatCap";

const REFRESH_MS = 5 * 60_000;

// The two rankings this card can show. "Popular" is social mentions, "volume"
// is dollars actually traded - the same twenty slots answering two different
// questions, so they share one list and swap the feed underneath it.
const MODES = {
  popular: { label: "Mentions", title: "Top 20 Most Popular Stocks This Week", url: "/api/popular-stocks" },
  volume: { label: "Volume", title: "Top 20 Most Traded Stocks This Week", url: "/api/volume-stocks" },
};

function TrendingIcon({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 17l6-6 4 4 8-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 6h6v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Mentions carry a mention delta, volume carries spots moved in the ranking.
// Both render as an arrow and a count, so they only differ in what is counted.
function StockStats({ mode, s }) {
  if (mode === "volume") {
    return (
      <div className="stock-stats">
        <span>{formatCount(s.shares)} volume traded</span>
        <span>{formatCapShort(s.dollars)} traded</span>
        <span className={changeClass(s.rankChange)}>
          {s.rankChange >= 0 ? "▲" : "▼"} {Math.abs(s.rankChange)}
        </span>
      </div>
    );
  }
  return (
    <div className="stock-stats">
      <span>{s.mentions.toLocaleString()} mentions</span>
      <span>{s.upvotes.toLocaleString()} upvotes</span>
      {/* A mention count, not a percentage, so it keeps its own arrow rather
          than using arrowPct. */}
      <span className={changeClass(s.mentionChange)}>
        {s.mentionChange >= 0 ? "▲" : "▼"} {Math.abs(s.mentionChange).toLocaleString()}
      </span>
    </div>
  );
}

export default function PopularStocksCard() {
  const [mode, setMode] = useState("popular");
  const [data, setData] = useState({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(MODES[mode].url);
        const json = await res.json();
        if (!cancelled && json?.stocks?.length) {
          setData((d) => ({ ...d, [mode]: json }));
        }
      } catch {
        // Keep whatever we last had.
      }
    }
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [mode]);

  // Cached per mode, so flipping back doesn't blank the card while it refetches.
  const current = data[mode];
  if (!current) return null;

  return (
    <section className="events-card" id="popular-stocks">
      <div className="events-header">
        <h2>
          {MODES[mode].title}
          {current.isDemo && <span className="demo-badge">Demo data</span>}
        </h2>
        <div className="stock-mode-toggle">
          {Object.entries(MODES).map(([key, m]) => (
            <button
              key={key}
              type="button"
              className={`chip${key === mode ? " active" : ""}`}
              aria-pressed={key === mode}
              onClick={() => setMode(key)}
            >
              {m.label}
            </button>
          ))}
          <TrendingIcon className="events-header-icon" />
        </div>
      </div>
      <div className="events-list">
        {current.stocks.map((s) => (
          <a
            className="stock-row stock-row-link"
            key={s.ticker}
            href={`/stock/${encodeURIComponent(s.ticker)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="stock-rank">#{s.rank}</span>
            {/* Not every ticker resolves on the logo CDN, so a miss drops the
                image and the row closes up rather than holding a gap. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="stock-row-logo"
              src={logoUrl(s.ticker, 48)}
              alt=""
              onError={hideBrokenLogo}
            />
            <div className="stock-body">
              <div className="stock-meta">
                <span className="stock-ticker">{s.ticker}</span>
                <span className="stock-name">{s.name}</span>
              </div>
              <StockStats mode={mode} s={s} />
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
