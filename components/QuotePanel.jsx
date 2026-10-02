"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { pct } from "@/lib/num";

// One quote list on the home overview: grouped rows, each with a price and the
// day's move. Every panel on the board is this component over a different list
// from lib/overviewPanels.js, so they cannot drift apart in layout the way
// four hand-written tables would.

const REFRESH_MS = 60000;

// Prices span four orders of magnitude on this board - a 2.97 gas future and a
// 79,601 bitcoin sit two panels apart - so significant digits rather than a
// fixed two, which would print "2.97" as usefully and "79601.77" as noise.
function formatPrice(value) {
  if (value == null) return "—";
  const digits = Math.abs(value) >= 1000 ? 0 : Math.abs(value) >= 10 ? 2 : 4;
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export default function QuotePanel({ title, groups, href }) {
  const [quotes, setQuotes] = useState({});
  const [failed, setFailed] = useState(false);

  const symbolKey = useMemo(
    () => groups.flatMap((g) => g.rows.map((r) => r.symbol)).join(","),
    [groups]
  );

  useEffect(() => {
    let cancelled = false;
    function load() {
      fetch(`/api/watchlist-quotes?symbols=${encodeURIComponent(symbolKey)}`)
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return;
          setQuotes(Object.fromEntries((data.quotes ?? []).map((q) => [q.symbol, q])));
          setFailed(false);
        })
        .catch(() => {
          // The last prices we had stay on screen; only a first load with
          // nothing behind it has anything to report.
          if (!cancelled) setFailed(true);
        });
    }
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbolKey]);

  const empty = !Object.keys(quotes).length;

  return (
    <section className="ov-panel" aria-label={title}>
      <header className="ov-panel-head">
        <h2>{title}</h2>
        {href && (
          <Link href={href} className="ov-more">
            More
          </Link>
        )}
      </header>

      {failed && empty ? (
        <p className="ov-empty">Quotes unavailable.</p>
      ) : (
        <div className="ov-rows">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="ov-group-head">
                <span>{g.label}</span>
                <span>Price</span>
                <span>Chg %</span>
              </div>
              {g.rows.map((r) => {
                const q = quotes[r.symbol];
                const up = q?.changePct != null && q.changePct >= 0;
                return (
                  <Link
                    key={r.symbol}
                    href={`/stock/${encodeURIComponent(r.symbol)}`}
                    className="ov-row"
                  >
                    <span className="ov-name">{r.label}</span>
                    <span className="ov-price">{formatPrice(q?.price)}</span>
                    <span className={q?.changePct == null ? "ov-chg" : `ov-chg ${up ? "up" : "down"}`}>
                      {q?.changePct == null ? "—" : pct(q.changePct)}
                    </span>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
