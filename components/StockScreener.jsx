"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CRITERIA } from "@/lib/screenerFields";
import { formatCap } from "@/lib/formatCap";
import { logoUrl, hideBrokenLogo } from "@/lib/companyLogo";
import { arrowPct, changeClass } from "@/lib/change";
import { cycleSort, sortRows } from "@/lib/sortRows";
import { useWatchlist } from "./WatchlistProvider";

// Index 0 of every criterion is "Any", so a fresh form screens on nothing.
const ANY = Object.fromEntries(CRITERIA.map((c) => [c.key, 0]));

const ratio = (v) => (v == null ? "n/a" : v.toFixed(1));

// Every column sorts on the row field of the same name. `num` right-aligns the
// column and is also what picks the numeric comparator over the string one.
const COLUMNS = [
  { key: "name", label: "Company" },
  { key: "country", label: "Country" },
  { key: "price", label: "Price", num: true },
  { key: "changePct", label: "Change", num: true },
  { key: "marketCap", label: "Market cap", num: true },
  { key: "pe", label: "P/E", num: true },
  { key: "forwardPe", label: "Fwd P/E", num: true },
  { key: "eps", label: "EPS", num: true },
];

export default function StockScreener() {
  const { items, add, remove } = useWatchlist();
  const [saveError, setSaveError] = useState(null);
  const [picked, setPicked] = useState(ANY);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // null is the order the screen came back in, largest market cap first.
  const [sort, setSort] = useState(null);

  const rows = useMemo(() => (result ? sortRows(result.rows, sort) : []), [result, sort]);

  const activeCount = CRITERIA.filter((c) => picked[c.key] > 0).length;

  async function search(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSort(null);
    const params = new URLSearchParams();
    for (const c of CRITERIA) {
      const { min, max } = c.options[picked[c.key]];
      // 0 is a real bound ("Profitable (>0)"), so these test against null
      // rather than for truthiness.
      if (min != null) params.set(`${c.key}Min`, min);
      if (max != null) params.set(`${c.key}Max`, max);
    }
    try {
      const res = await fetch(`/api/screener?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Screen failed");
      setResult(json);
    } catch (err) {
      setError(err.message);
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  // The bookmark is a toggle: a second click takes the row back off the list.
  async function toggleWatch(row) {
    setSaveError(null);
    const on = items.some((i) => i.symbol === row.symbol);
    const { error: err } = await (on ? remove(row.symbol) : add(row));
    if (err) setSaveError(err);
  }

  return (
    <div className="screener-wrap">
      <div className="screener-head">
        <h1 className="screener-title">Stock Screener</h1>
        <p className="screener-sub">
          Pick the ranges you care about and find the US-listed companies that fit. Anything left
          on <b>Any</b>{" "}
          isn&apos;t screened on.
        </p>
      </div>

      <form onSubmit={search}>
        <div className="screener-filters">
          {CRITERIA.map((c) => (
            <label
              className={`screener-filter${picked[c.key] > 0 ? " active" : ""}`}
              key={c.key}
              title={c.hint}
            >
              <span className="screener-filter-label">{c.label}</span>
              <select
                value={picked[c.key]}
                onChange={(e) =>
                  setPicked((p) => ({ ...p, [c.key]: Number(e.target.value) }))
                }
              >
                {c.options.map((o, i) => (
                  <option key={o.label} value={i}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <div className="screener-actions">
          <button type="submit" className="screener-find" disabled={busy}>
            {busy ? "Searching…" : "Find & search"}
          </button>
          <button
            type="button"
            className="screener-reset"
            onClick={() => {
              setPicked(ANY);
              setResult(null);
              setError(null);
              setSort(null);
            }}
          >
            Clear
          </button>
          <span className="screener-count">
            {activeCount === 0
              ? "No filters set - you'll get the largest US companies"
              : `${activeCount} filter${activeCount > 1 ? "s" : ""} set`}
          </span>
        </div>
      </form>

      {error && <p className="screener-error">{error}</p>}

      {result && (
        <div className="screener-results">
          <div className="screener-results-head">
            <h2>{result.rows.length === 0 ? "No matches" : `${result.rows.length} companies`}</h2>
            <span className="screener-results-note">
              {result.rows.length === 0
                ? "Nothing fits every box. Try widening a range."
                : result.partial
                  ? `Forward P/E is checked against the ${result.scanned} biggest of ${result.total.toLocaleString()} matches.`
                  : result.total > result.rows.length
                    ? `Largest ${result.rows.length} of ${result.total.toLocaleString()} matches, by market cap.`
                    : // Once a column is doing the sorting, the arrow in its
                      // header says so and this would be claiming otherwise.
                      sort
                      ? ""
                      : "Sorted by market cap."}
            </span>
          </div>

          {saveError && <p className="screener-error">{saveError}</p>}

          {result.rows.length > 0 && (
            <div className="screener-table-scroll">
              <table className="screener-table">
                <thead>
                  <tr>
                    <th className="screener-watch-col" aria-label="Watchlist" />
                    {COLUMNS.map((c) => {
                      const on = sort?.key === c.key;
                      return (
                        <th
                          key={c.key}
                          className={c.num ? "num" : undefined}
                          aria-sort={
                            on ? (sort.dir === "desc" ? "descending" : "ascending") : "none"
                          }
                        >
                          <button
                            type="button"
                            className={`screener-sort${on ? " active" : ""}`}
                            onClick={() => setSort((s) => cycleSort(s, c.key))}
                          >
                            {c.label}
                            <span className="screener-sort-arrow" aria-hidden="true">
                              {on ? (sort.dir === "desc" ? "▼" : "▲") : "▾"}
                            </span>
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const watched = items.some((i) => i.symbol === r.symbol);
                    return (
                      <tr key={r.symbol}>
                        <td className="screener-watch-col">
                          <button
                            type="button"
                            className={`screener-watch${watched ? " on" : ""}`}
                            onClick={() => toggleWatch(r)}
                            title={watched ? "Remove from watchlist" : "Add to watchlist"}
                            aria-pressed={watched}
                            aria-label={
                              watched
                                ? `Remove ${r.symbol} from watchlist`
                                : `Add ${r.symbol} to watchlist`
                            }
                          >
                            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                              <path
                                d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1z"
                                fill={watched ? "currentColor" : "none"}
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                        </td>
                        <td>
                          <Link
                            className="screener-company"
                            href={`/stock/${encodeURIComponent(r.symbol)}`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              className="screener-logo"
                              src={logoUrl(r.symbol)}
                              alt=""
                              width="24"
                              height="24"
                              loading="lazy"
                              onError={hideBrokenLogo}
                            />
                            <span className="screener-symbol">{r.symbol}</span>
                            <span className="screener-name">{r.name}</span>
                          </Link>
                        </td>
                        <td>
                          <span className="screener-market">
                            {r.flag && (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                className="screener-flag"
                                src={`https://flagcdn.com/w20/${r.flag}.png`}
                                alt=""
                                width="18"
                                height="13"
                                loading="lazy"
                              />
                            )}
                            {r.country ?? "n/a"}
                          </span>
                        </td>
                        <td className="num">{r.price == null ? "n/a" : r.price.toFixed(2)}</td>
                        <td className={`num ${changeClass(r.changePct)}`}>
                          {r.changePct == null ? "n/a" : arrowPct(r.changePct)}
                        </td>
                        <td className="num">{formatCap(r.marketCap)}</td>
                        <td className="num">{ratio(r.pe)}</td>
                        <td className="num">{ratio(r.forwardPe)}</td>
                        <td className="num">{r.eps == null ? "n/a" : r.eps.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
