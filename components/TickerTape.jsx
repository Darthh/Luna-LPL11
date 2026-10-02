"use client";

import { useEffect, useState } from "react";
import { TICKER_TAPE_INSTRUMENTS } from "@/lib/tickerTapeInstruments";
import { hideBrokenLogo, logoUrl } from "@/lib/companyLogo";
import { arrowPct, changeClass } from "@/lib/change";
import { useWatchlist } from "./WatchlistProvider";

const REFRESH_MS = 60_000;
const ICONS = Object.fromEntries(
  TICKER_TAPE_INSTRUMENTS.map((i) => [i.key, { flagCode: i.flagCode, emoji: i.emoji }])
);
const SYMBOLS = Object.fromEntries(TICKER_TAPE_INSTRUMENTS.map((i) => [i.key, i.symbol]));

// Default instruments are indices and commodities, so they get a country flag
// or an emoji. A watchlist entry is a company, so it gets that company's logo.
function TickerIcon({ quote }) {
  const icon = ICONS[quote.key];
  if (icon?.flagCode) {
    return (
      <img
        className="ticker-flag"
        src={`https://flagcdn.com/${icon.flagCode}.svg`}
        alt=""
        width="16"
        height="12"
      />
    );
  }
  if (icon?.emoji) {
    return (
      <span className="ticker-flag ticker-emoji" aria-hidden="true">
        {icon.emoji}
      </span>
    );
  }
  if (!quote.symbol) return null;
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      className="ticker-logo"
      src={logoUrl(quote.symbol)}
      alt=""
      width="18"
      height="18"
      loading="lazy"
      onError={hideBrokenLogo}
    />
  );
}

function formatPrice(key, price) {
  if (key === "GOLD" || key === "OIL") {
    return "$" + price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (key === "VIX") {
    return price.toFixed(2);
  }
  return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function TickerTape() {
  const { items, tapeEnabled, loading } = useWatchlist();
  const [quotes, setQuotes] = useState([]);
  const [isDemo, setIsDemo] = useState(false);
  const [showingWatchlist, setShowingWatchlist] = useState(false);

  // Joined here rather than in the effect so a re-render with an equal list
  // doesn't restart the refresh interval.
  const symbols = tapeEnabled && !loading ? items.map((i) => i.symbol).join(",") : "";

  useEffect(() => {
    let cancelled = false;

    async function loadJson(url) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }

    async function load() {
      try {
        if (symbols) {
          const data = await loadJson(`/api/watchlist-quotes?symbols=${encodeURIComponent(symbols)}`);
          const priced = (data?.quotes ?? []).filter((q) => typeof q.price === "number");
          if (priced.length) {
            if (!cancelled) {
              setQuotes(priced);
              setIsDemo(false);
              setShowingWatchlist(true);
            }
            return;
          }
          // Every watched ticker came back unpriced - an empty bar reads as
          // broken, so fall through to the default instruments.
        }
        const data = await loadJson("/api/ticker-tape");
        if (!cancelled && data?.quotes?.length) {
          setQuotes(data.quotes);
          setIsDemo(!!data.isDemo);
          setShowingWatchlist(false);
        }
      } catch {
        // Keep whatever we last had; the bar just stops updating until
        // the next tick succeeds.
      }
    }

    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbols]);

  if (!quotes.length) return <div className="ticker-tape" aria-hidden="true" />;

  const tapeItems = quotes.map((q) => {
    const symbol = q.symbol ?? SYMBOLS[q.key];
    return (
      <a
        className="ticker-item"
        key={q.key}
        href={symbol ? `/stock/${encodeURIComponent(symbol)}` : "#"}
        target="_blank"
        rel="noopener noreferrer"
      >
        <TickerIcon quote={q} />
        <b>{q.label}</b>
        {formatPrice(q.key, q.price)}
        <span className={changeClass(q.changePct)}>{arrowPct(q.changePct)}</span>
      </a>
    );
  });

  const badge = isDemo ? "Demo data" : showingWatchlist ? "Your watchlist" : null;

  // The track scrolls by translating -50%, so each half has to be at least as
  // wide as the screen or the loop shows a gap. A three-ticker watchlist
  // therefore gets repeated more times than the ten default instruments do.
  const half = Math.max(1, Math.ceil(10 / quotes.length));
  const duration = `${Math.max(55, quotes.length * 5)}s`;
  const track = Array.from({ length: half * 2 }, (_, copy) => (
    <div
      className="ticker-tape-run"
      key={copy}
      // The extra passes exist only to make the visual animation loop. They
      // must not create duplicate, keyboard-focusable links inside an
      // aria-hidden subtree.
      aria-hidden={copy > 0 ? "true" : undefined}
      inert={copy > 0 || undefined}
    >
      {tapeItems}
    </div>
  ));

  return (
    <section className="ticker-tape" aria-label="Market indices ticker" aria-live="off">
      <div className="ticker-tape-track" style={{ "--ticker-duration": duration }}>{track}</div>
      {badge && <div className="ticker-tape-badge">{badge}</div>}
    </section>
  );
}
