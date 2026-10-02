"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "./LanguageProvider";

// "Compare" dropdown for the stock chart: search any two other tickers and
// plot them alongside the one on show. The same Yahoo-backed autocomplete the
// header search uses, filtered so a symbol already on the chart can't be
// added twice.
export default function CompareControl({ base, compare, max, onAdd, onRemove }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Results carry the query they answer, so a stale set is simply ignored
  // rather than cleared on every keystroke.
  const [results, setResults] = useState({ q: "", list: [] });
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const q = query.trim();
  const full = compare.length >= max;
  const taken = new Set([base, ...compare.map((c) => c.symbol)]);
  const searching = q !== "" && results.q !== q;

  // Debounced ticker autocomplete, matching the header search.
  useEffect(() => {
    if (!q) return;
    const timer = setTimeout(() => {
      fetch(`/api/stock-search?q=${encodeURIComponent(q)}`)
        .then((res) => res.json())
        .then((json) => {
          setResults({ q, list: json.results ?? [] });
          setActiveIdx(-1);
        })
        .catch(() => setResults({ q, list: [] }));
    }, 200);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    if (!open) return;
    function onClickAway(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, [open]);

  // The point of opening the menu is to type in it.
  useEffect(() => {
    if (open && !full) inputRef.current?.focus();
  }, [open, full]);

  const shown = searching ? [] : results.list.filter((r) => !taken.has(r.symbol));

  function pick(result) {
    if (!result || full) return;
    onAdd({ symbol: result.symbol, name: result.name, exchange: result.exchange });
    setQuery("");
    setActiveIdx(-1);
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      pick(activeIdx >= 0 ? shown[activeIdx] : shown[0]);
      return;
    }
    if (!shown.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % shown.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i <= 0 ? shown.length - 1 : i - 1));
    }
  }

  return (
    <div className="stock-cmp-control" ref={wrapRef}>
      <button
        type="button"
        className={`stock-cmp-btn${open ? " open" : ""}${compare.length ? " filled" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {t("Compare")}
        {compare.length > 0 && <span className="stock-cmp-count">{compare.length}</span>}
        <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
          <path d="M6 9.5 12 15.5 18 9.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="stock-cmp-menu">
          {compare.length > 0 && (
            <div className="stock-cmp-chips">
              {compare.map((c) => (
                <span className="stock-cmp-chip" key={c.symbol}>
                  <i style={{ background: c.color }} />
                  {c.symbol}
                  <button type="button" onClick={() => onRemove(c.symbol)} aria-label={`Remove ${c.symbol}`}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {full ? (
            <div className="stock-cmp-hint">
              Comparing {max} stocks alongside {base} - remove one to add another.
            </div>
          ) : (
            <>
              <input
                ref={inputRef}
                className="stock-cmp-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={t("Add a stock to compare")}
                aria-label={t("Add a stock to compare")}
                spellCheck={false}
              />
              {q && (
                <div className="stock-cmp-results">
                  {shown.length > 0 ? (
                    shown.map((r, i) => (
                      <button
                        key={r.symbol}
                        type="button"
                        className={`stock-cmp-result${i === activeIdx ? " active" : ""}`}
                        onMouseEnter={() => setActiveIdx(i)}
                        onClick={() => pick(r)}
                      >
                        <span className="stock-cmp-result-sym">{r.symbol}</span>
                        <span className="stock-cmp-result-name">{r.name}</span>
                        <span className="stock-cmp-result-exch">{r.exchange}</span>
                      </button>
                    ))
                  ) : (
                    <div className="stock-cmp-hint">{searching ? "Searching…" : "No matches"}</div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
