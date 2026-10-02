"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useWatchlist } from "./WatchlistProvider";
import { useLanguage } from "./LanguageProvider";
import { MoverList } from "./MoverRows";

const REFRESH_MS = 60000;

// The rail's watchlist panel: the reader's own tickers, ranked by today's
// move, top six and bottom six. The full list with positions lives on
// /watchlist - this is the glance version.
export default function WatchlistMovers() {
  const { items, signedIn, loading } = useWatchlist();
  const { t } = useLanguage();
  const [quotes, setQuotes] = useState({});
  const symbolKey = useMemo(() => items.map((i) => i.symbol).join(","), [items]);

  useEffect(() => {
    if (!symbolKey) return;
    let cancelled = false;
    function load() {
      fetch(`/api/watchlist-quotes?symbols=${encodeURIComponent(symbolKey)}`)
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return;
          setQuotes(Object.fromEntries((data.quotes ?? []).map((q) => [q.symbol, q])));
        })
        .catch(() => {
          /* keep the last prices we had */
        });
    }
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbolKey]);

  const ranked = useMemo(
    () =>
      items
        .map((i) => ({
          symbol: i.symbol,
          name: i.name ?? quotes[i.symbol]?.name ?? null,
          price: quotes[i.symbol]?.price ?? null,
          changePct: quotes[i.symbol]?.changePct ?? null,
        }))
        .filter((r) => Number.isFinite(r.changePct))
        .sort((a, b) => b.changePct - a.changePct),
    [items, quotes]
  );

  if (!signedIn && !items.length) {
    return <p className="trail-empty">{t("Sign in to use watchlists, alerts and API keys.")}</p>;
  }
  if (loading && !ranked.length) return <p className="trail-empty">{t("Loading")}…</p>;
  if (!items.length) {
    return (
      <p className="trail-empty">
        <Link href="/watchlist">{t("My watchlist")}</Link>
      </p>
    );
  }

  return (
    <div className="mover-groups">
      <h3 className="mover-head up">{t("Gainers")}</h3>
      <MoverList rows={ranked.slice(0, 6)} empty={t("No data")} />
      <h3 className="mover-head down">{t("Losers")}</h3>
      <MoverList rows={ranked.slice(-6).reverse()} empty={t("No data")} />
    </div>
  );
}
