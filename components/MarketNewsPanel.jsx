"use client";

import { useEffect, useState } from "react";

// Headlines on the home overview. Links go out to the publisher, so they carry
// the usual rel for an outbound link opened in a new tab.

const REFRESH_MS = 300000;

// "4:42 PM" for today's stories and a date for anything older - a bare time on
// a three-day-old headline reads as if it just landed.
function stamp(seconds) {
  if (!seconds) return "";
  const when = new Date(seconds * 1000);
  const sameDay = when.toDateString() === new Date().toDateString();
  return when.toLocaleString(undefined, {
    ...(sameDay
      ? { hour: "numeric", minute: "2-digit" }
      : { month: "short", day: "numeric" }),
  });
}

export default function MarketNewsPanel() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    function load() {
      fetch("/api/market-news")
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error("bad"))))
        .then((json) => {
          if (cancelled) return;
          setItems(json.items ?? []);
          setError(false);
        })
        .catch(() => {
          // Headlines already on screen stay there; only an empty panel has
          // anything to say about a failure.
          if (!cancelled) setError(true);
        });
    }
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <section className="ov-panel ov-news" aria-label="Market news">
      <header className="ov-panel-head">
        <h2>Market news</h2>
      </header>

      {error && !items?.length ? (
        <p className="ov-empty">News unavailable.</p>
      ) : !items ? (
        <p className="ov-empty">Loading headlines…</p>
      ) : (
        <ul className="ov-news-list">
          {items.map((n) => (
            <li key={n.id}>
              <a href={n.link} target="_blank" rel="noopener noreferrer">
                {n.title}
              </a>
              <span className="ov-news-meta">
                {n.publisher}
                {n.publisher && n.published ? " · " : ""}
                {stamp(n.published)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
