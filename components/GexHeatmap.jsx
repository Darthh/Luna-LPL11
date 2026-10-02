"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const MODES = [
  { key: "net", label: "Net" },
  { key: "calls", label: "Calls" },
  { key: "puts", label: "Puts" },
  { key: "volume", label: "Volume" },
];
const VIEWS = [
  { key: "bars", label: "Bars" },
  { key: "boxes", label: "Boxes" },
];

// Mirrors STRIKE_WINDOW in app/api/spy-gex/route.js, used only when a response
// arrives without explicit bounds.
const STRIKE_WINDOW = 10;

function compact(value, money = false) {
  const amount = Math.abs(value || 0);
  const sign = value < 0 ? "−" : "";
  const prefix = money ? "$" : "";
  if (amount >= 1e9) return `${sign}${prefix}${(amount / 1e9).toFixed(1)}B`;
  if (amount >= 1e6) return `${sign}${prefix}${(amount / 1e6).toFixed(1)}M`;
  if (amount >= 1e3) return `${sign}${prefix}${(amount / 1e3).toFixed(1)}K`;
  return `${sign}${prefix}${Math.round(amount)}`;
}

function expiryLabel(timestamp) {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

// Regular US session: Mon-Fri, 09:30-16:00 New York. Reading the wall clock
// through Intl keeps this correct across DST without a date library. Market
// holidays are not tracked - a holiday just means a few wasted polls against a
// cached response, which is cheaper than shipping a holiday calendar.
function marketIsOpen(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  if (value.weekday === "Sat" || value.weekday === "Sun") return false;
  const minutes = Number(value.hour) * 60 + Number(value.minute);
  return minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}

export default function GexHeatmap({ symbol = "SPY", onClose }) {
  const [data, setData] = useState(null);
  const [expiration, setExpiration] = useState(null);
  const [mode, setMode] = useState("net");
  const [view, setView] = useState("bars");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const spotRowRef = useRef(null);

  const load = useCallback(async (nextExpiration, { quiet = false } = {}) => {
    // Background refreshes leave the current rows on screen; only a user-driven
    // load swaps in the skeleton.
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ symbol });
      if (nextExpiration) params.set("expiration", String(nextExpiration));
      const response = await fetch(`/api/spy-gex/change?${params}`, { method: "POST", cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Options data unavailable");
      setData(json);
      setExpiration(json.selectedExpiration);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    const initialLoad = setTimeout(() => load(), 0);
    return () => clearTimeout(initialLoad);
  }, [load]);

  // Keep the heatmap live while the market is open. The route caches for 20s,
  // so this polls a touch slower than that and mostly lands on Cloudflare
  // rather than Yahoo. Refreshing is pointless when the market is closed or
  // the tab is hidden, so both cases skip the tick entirely.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (!marketIsOpen()) return;
      load(expiration, { quiet: true });
    }, 30_000);
    return () => clearInterval(id);
  }, [load, expiration]);

  const rows = useMemo(() => {
    if (!data?.rows) return [];
    const lower = data.strikeBounds?.low ?? Math.round(data.spot) - STRIKE_WINDOW;
    const upper = data.strikeBounds?.high ?? Math.round(data.spot) + STRIKE_WINDOW;
    return data.rows.filter((row) => row.strike >= lower && row.strike <= upper);
  }, [data]);
  const valueFor = useCallback((row) => {
    if (mode === "calls") return row.callGex;
    if (mode === "puts") return row.putGex;
    if (mode === "volume") return row.totalVolume;
    return row.netGex;
  }, [mode]);
  const maxValue = useMemo(() => Math.max(1, ...rows.map((row) => Math.abs(valueFor(row)))), [rows, valueFor]);
  const closestStrike = useMemo(() => rows.reduce((closest, row) => (
    closest == null || Math.abs(row.strike - data.spot) < Math.abs(closest - data.spot) ? row.strike : closest
  ), null), [data, rows]);
  const highlights = useMemo(() => ({
    net: rows.reduce((largest, row) => !largest || Math.abs(row.netGex) > Math.abs(largest.netGex) ? row : largest, null)?.strike,
    calls: new Set([...rows].sort((a, b) => b.callGex - a.callGex).slice(0, 3).map((row) => row.strike)),
    puts: new Set([...rows].sort((a, b) => b.putGex - a.putGex).slice(0, 3).map((row) => row.strike)),
  }), [rows]);

  useEffect(() => {
    if (loading || !spotRowRef.current) return;
    const frame = requestAnimationFrame(() => {
      const row = spotRowRef.current;
      const scroller = row?.closest(".gex-rows");
      if (row && scroller) scroller.scrollTop = row.offsetTop - scroller.clientHeight / 2 + row.clientHeight / 2;
    });
    return () => cancelAnimationFrame(frame);
  }, [loading, expiration]);

  return (
    <aside className="gex-panel" aria-label={`${symbol} GEX Heatmap`}>
      <header className="gex-header">
        <div><span>{symbol} options</span><h3>GEX Heatmap</h3></div>
        <button type="button" onClick={onClose} aria-label="Close GEX Heatmap">×</button>
      </header>

      {data && <div className="gex-summary">
        <div><span>Net GEX</span><strong className={data.summary.netGex >= 0 ? "positive" : "negative"}>{compact(data.summary.netGex, true)}</strong></div>
        <div><span>Call wall</span><strong>{data.summary.callWall ?? "—"}</strong></div>
        <div><span>Put wall</span><strong>{data.summary.putWall ?? "—"}</strong></div>
      </div>}

      <div className="gex-controls">
        <label>
          <span>Expiration</span>
          <select value={expiration || ""} onChange={(event) => load(Number(event.target.value))} disabled={!data}>
            {(data?.expirations || []).map((item) => <option key={item} value={item}>{expiryLabel(item)}</option>)}
          </select>
        </label>
        <div className="gex-modes" role="group" aria-label="GEX display">
          {MODES.map((item) => <button key={item.key} type="button" className={`mode-${item.key}${mode === item.key ? " active" : ""}`} onClick={() => setMode(item.key)} aria-pressed={mode === item.key}>{item.label}</button>)}
        </div>
        <div className="gex-views" role="group" aria-label="GEX heatmap style">
          {VIEWS.map((item) => <button key={item.key} type="button" className={view === item.key ? "active" : ""} onClick={() => setView(item.key)} aria-pressed={view === item.key}>{item.label}</button>)}
        </div>
      </div>

      <div className="gex-column-head"><span>Strike</span><span><em>{mode === "volume" ? "Contracts" : "GEX / 1%"}</em><small>15m Δ</small></span></div>
      <div className="gex-rows">
        {loading && [...Array(12)].map((_, index) => <div className="gex-row-skeleton" key={index} />)}
        {!loading && error && <div className="gex-empty"><strong>Options feed unavailable</strong><span>{error}</span><button type="button" onClick={() => load(expiration)}>Try again</button></div>}
        {!loading && !error && rows.map((row) => {
          const value = valueFor(row);
          const isNegative = mode === "net" && value < 0;
          const width = Math.max(3, Math.abs(value) / maxValue * 100);
          const spot = row.strike === closestStrike;
          const highlight = mode === "net" && row.strike === highlights.net
            ? " max-net"
            : mode === "calls" && highlights.calls.has(row.strike)
              ? " top-call"
              : mode === "puts" && highlights.puts.has(row.strike)
                ? " top-put"
                : "";
          const boxIntensity = 0.2 + (Math.abs(value) / maxValue * 0.8);
          const change = Number.isFinite(row.change15mPct) ? row.change15mPct : null;
          return <div ref={spot ? spotRowRef : null} className={`gex-row${spot ? " spot" : ""}${view === "boxes" ? " boxes" : ""}`} key={row.strike} title={`Calls: ${compact(row.callGex, true)} · Puts: ${compact(row.putGex, true)} · Volume: ${row.totalVolume.toLocaleString()}`}>
            <b>{row.strike}</b>
            <div className={`gex-cell ${isNegative ? "negative" : mode}${highlight}`} style={view === "boxes" ? { "--gex-box-intensity": boxIntensity } : undefined}><i style={{ width: `${width}%` }} /><span>{compact(value, mode !== "volume")}</span>{change != null && <small className={change >= 0 ? "up" : "down"}>{change >= 0 ? "↑" : "↓"} {Math.min(999, Math.round(Math.abs(change)))}%</small>}</div>
          </div>;
        })}
      </div>

      <footer className="gex-footer">
        <span>Spot ${data?.spot?.toFixed(2) || "—"} · Vol {compact(data?.summary?.volume || 0)}</span>
        <small>{`±$${STRIKE_WINDOW} strikes`} · expirations through 2 weeks · estimated exposure</small>
      </footer>
    </aside>
  );
}
