"use client";

import { useEffect, useMemo, useState } from "react";
import { deriveNotableMove } from "@/lib/research";
import { dropBrokenImage } from "@/lib/companyLogo";

function prettyDate(value) {
  if (!value) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(`${value}T12:00:00Z`)
  );
}

export default function CatalystTimeline({ symbol, name, points, fallback }) {
  const move = useMemo(() => deriveNotableMove(points, fallback), [points, fallback]);
  const [requestKey, setRequestKey] = useState(0);
  const [state, setState] = useState({ key: null, status: "idle", data: null, error: null });
  const queryKey = `${symbol}:${move?.date ?? "none"}:${move?.pct ?? "none"}:${requestKey}`;

  useEffect(() => {
    if (!move?.date || !Number.isFinite(move.pct)) return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      symbol,
      name: name || symbol,
      date: move.date,
      move: String(move.pct),
    });
    fetch(`/api/research/catalysts?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Catalyst research unavailable");
        return json;
      })
      .then((data) => setState({ key: queryKey, status: "ready", data, error: null }))
      .catch((error) => {
        if (error.name !== "AbortError") {
          setState({ key: queryKey, status: "error", data: null, error: error.message });
        }
      });
    return () => controller.abort();
  }, [symbol, name, move?.date, move?.pct, queryKey]);

  if (!move) return null;
  const activeState = state.key === queryKey ? state : { status: "loading", data: null, error: null };
  const sources = activeState.data?.sources ?? [];
  const configured = activeState.data?.configured !== false;

  return (
    <section className="stock-card catalyst-card" aria-labelledby="catalyst-title">
      <h2 id="catalyst-title" className="stock-section-title catalyst-title">Recent News</h2>

      {activeState.status === "loading" && (
        <div className="catalyst-loading" role="status">
          <i /> <span>Searching recent reporting published near this move…</span>
        </div>
      )}

      {activeState.status === "error" && (
        <div className="catalyst-state">
          <span>{activeState.error}</span>
          <button type="button" onClick={() => setRequestKey((value) => value + 1)}>Try again</button>
        </div>
      )}

      {activeState.status === "ready" && !configured && (
        <div className="catalyst-state catalyst-setup">
          <div>
            <b>Recent news needs a Finnhub API key.</b>
            <span>{activeState.data.error}</span>
          </div>
        </div>
      )}

      {activeState.status === "ready" && configured && sources.length === 0 && (
        <div className="catalyst-state">
          <span>No closely timed sources were found for this move.</span>
          <button type="button" onClick={() => setRequestKey((value) => value + 1)}>Search again</button>
        </div>
      )}

      {sources.length > 0 && (
        <div className="catalyst-news-grid">
          {sources.map((source, index) => (
            <a className="catalyst-news-card" href={source.url} target="_blank" rel="noopener noreferrer" key={source.url}>
              <div className="catalyst-news-image">
                {source.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={source.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={dropBrokenImage} />
                ) : null}
                <span>{source.domain.slice(0, 1).toUpperCase()}</span>
                <i>{String(index + 1).padStart(2, "0")}</i>
              </div>
              <div className="catalyst-news-body">
                <div className="catalyst-news-meta">
                  <span>{source.publishedDate ? prettyDate(source.publishedDate) : "Date unavailable"}</span>
                  <span>{source.publisher || source.domain}</span>
                </div>
                <b>{source.title}</b>
                {source.excerpt && <p>{source.excerpt}</p>}
                <small>Read article ↗</small>
              </div>
            </a>
          ))}
        </div>
      )}

    </section>
  );
}
