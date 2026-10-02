"use client";

// Companies ranked by market cap, in the shape companiesmarketcap.com uses: a
// row per company with its size, P/E, a three-month price line and - the one
// thing that site doesn't carry - a 14-day RSI beside it.
//
// Every column sorts. Clicking a header takes it highest-first, clicking again
// flips to lowest-first, and a third click returns the board to its market-cap
// order. That cycle is lib/sortRows, shared with the stock screener and the
// hedge fund list so the three can't disagree about what a second click does.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cycleSort, sortRows } from "@/lib/sortRows";
import { paginateMarketRows } from "@/lib/market";
import { formatCap } from "@/lib/formatCap";
import { formatUsdPrice } from "@/lib/market";
import { hideBrokenLogo, logoUrl } from "@/lib/companyLogo";
import { arrowPct, changeClass } from "@/lib/change";
import WatchlistButton from "./WatchlistButton";
import { SPARK_H, SPARK_W, sparkPath } from "@/lib/sparkline";

// `num` right-aligns the column and picks the numeric comparator; `sortKey`
// is the row field when it differs from the column's own key.
const RANKING = { key: "marketCap", label: "Market cap", format: formatCap };

const PAGE_SIZE = 50;

const COLUMNS = [
  { key: "rank", label: "#", num: true },
  { key: "name", label: "Company" },
  { key: "country", label: "Country" },
  { key: RANKING.key, label: RANKING.label, num: true },
  { key: "price", label: "Price", num: true },
  { key: "changePct", label: "Today", num: true },
  { key: "pe", label: "P/E", num: true },
  { key: "rsi", label: "RSI 14", num: true },
  { key: "sparkChangePct", label: "3M", num: true, spark: true },
];

// Wilder's conventional bands. Colour is the point of showing RSI in a table:
// scanning a column of numbers for ">70" is work the row can do for you.
const OVERBOUGHT = 70;
const OVERSOLD = 30;
const rsiClass = (v) =>
  v == null ? "" : v >= OVERBOUGHT ? "mcap-rsi-hot" : v <= OVERSOLD ? "mcap-rsi-cold" : "";

const ratio = (v) => (v == null ? "n/a" : v.toFixed(1));
export default function MarketCapRanking() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  // null is the order the board arrived in: the ranked metric, largest first.
  const [sort, setSort] = useState(null);
  const [page, setPage] = useState(1);

  // Two passes. The first response carries every row but only prices and
  // flags the first page, which is all the reader can see - it lands in about
  // a second instead of the twelve the whole board takes. The second fills in
  // the rest and swaps in silently, so paging past row 50 finds it ready.
  useEffect(() => {
    let live = true;
    const load = async (url) => {
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Ranking unavailable");
      return json;
    };
    load("/api/market-cap-ranking?mode=marketCap")
      .then((json) => {
        if (!live) return;
        setData(json);
        // Only the enriched rows are worth waiting on; if the first response
        // already covered everything there is nothing left to fetch.
        if (json.rows.length <= PAGE_SIZE) return;
        return load("/api/market-cap-ranking?mode=marketCap&full=1")
          .then((fullJson) => live && setData(fullJson))
          .catch(() => {});
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const matched = q
      ? data.rows.filter(
          (r) => r.symbol.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
        )
      : data.rows;
    return sortRows(matched, sort);
  }, [data, query, sort]);

  // Filtering can shrink the board past the page the reader was on.
  const paged = paginateMarketRows(rows, page, PAGE_SIZE);
  const first = rows.length ? (paged.page - 1) * PAGE_SIZE + 1 : 0;
  const last = (paged.page - 1) * PAGE_SIZE + paged.rows.length;
  const pager = (
    <div className="mcap-pager">
      <span>
        {rows.length ? `${first.toLocaleString()}–${last.toLocaleString()} of ${rows.length.toLocaleString()}` : "None"}
      </span>
      <button
        type="button"
        className="hf-page-btn"
        onClick={() => setPage(paged.page - 1)}
        disabled={paged.page <= 1}
        aria-label="Previous page"
      >
        ‹
      </button>
      <span>
        {paged.page} / {paged.pageCount}
      </span>
      <button
        type="button"
        className="hf-page-btn"
        onClick={() => setPage(paged.page + 1)}
        disabled={paged.page >= paged.pageCount}
        aria-label="Next page"
      >
        ›
      </button>
    </div>
  );

  return (
    <div className="mcap-wrap">
      <div className="mcap-head">
        <div>
          <h1 className="mcap-title">Companies by market cap</h1>
          <p className="mcap-sub">
            Public companies worth at least $30 billion, with trailing P/E, a 3-month price line
            and a 14-day RSI, ranked by market cap. Click any column to sort by
            it; click again to reverse, and once more to return to the ranked order.
          </p>
        </div>
        <div className="mcap-controls">
          <div className="mcap-search">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Filter by company or ticker"
            aria-label="Filter by company or ticker"
          />
          </div>
        </div>
      </div>

      {error && <p className="mcap-error">{error}</p>}
      {!data && !error && <p className="mcap-empty">Loading the ranking…</p>}

      {data && (
        <>
          <div className="mcap-count-row">
            <p className="mcap-count">
              {rows.length.toLocaleString()} of {data.rows.length.toLocaleString()} companies
              {sort ? ` · sorted by ${COLUMNS.find((c) => c.key === sort.key)?.label ?? sort.key}` : ""}
            </p>
            {pager}
          </div>

          <div className="screener-table-scroll">
            <table className="screener-table mcap-table">
              <thead>
                <tr>
                  {COLUMNS.map((c) => {
                    const on = sort?.key === c.key;
                    return (
                      <th
                        key={c.key}
                        className={c.num ? "num" : undefined}
                        aria-sort={on ? (sort.dir === "desc" ? "descending" : "ascending") : "none"}
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
                {paged.rows.map((r) => {
                  const path = sparkPath(r.spark);
                  const up = (r.sparkChangePct ?? 0) >= 0;
                  return (
                    <tr key={r.symbol}>
                      <td className="num mcap-rank">{r.rank}</td>
                      <td>
                        <div className="mcap-company-cell">
                          <Link className="mcap-company" href={`/stock/${encodeURIComponent(r.symbol)}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              className="mcap-logo"
                              src={logoUrl(r.symbol)}
                              alt=""
                              width="34"
                              height="34"
                              loading="lazy"
                              onError={hideBrokenLogo}
                            />
                            <span className="mcap-company-text">
                              <span className="screener-symbol">{r.symbol}</span>
                              <span className="mcap-company-name">{r.name}</span>
                            </span>
                          </Link>
                          <WatchlistButton
                            symbol={r.symbol}
                            name={r.name}
                            className="mcap-watchlist"
                          />
                        </div>
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
                      <td className="num mcap-strong">{RANKING.format(r[RANKING.key])}</td>
                      <td className="num mcap-price">{formatUsdPrice(r.price)}</td>
                      <td className={`num ${changeClass(r.changePct)}`}>
                        {r.changePct == null ? "n/a" : arrowPct(r.changePct)}
                      </td>
                      <td className="num">{ratio(r.pe)}</td>
                      <td className={`num mcap-rsi ${rsiClass(r.rsi)}`}>
                        {r.rsi == null ? "n/a" : r.rsi.toFixed(1)}
                      </td>
                      <td className="num">
                        {path ? (
                          <span className="mcap-spark-cell">
                            <svg
                              className="mcap-spark"
                              viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
                              preserveAspectRatio="none"
                              aria-hidden="true"
                            >
                              <path d={path} className={up ? "up" : "down"} />
                            </svg>
                            <span className={`mcap-spark-pct ${changeClass(r.sparkChangePct)}`}>
                              {r.sparkChangePct == null
                                ? ""
                                : `${up ? "+" : "−"}${Math.abs(r.sparkChangePct).toFixed(1)}%`}
                            </span>
                          </span>
                        ) : (
                          "n/a"
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!paged.rows.length && (
                  <tr>
                    <td colSpan={COLUMNS.length} className="mcap-empty">
                      No company matches “{query.trim()}”
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mcap-count-row mcap-count-row-end">{pager}</div>

          <p className="mcap-note">
            Market cap, price and P/E from Yahoo Finance; RSI computed over 14 daily closes
            (Wilder&apos;s smoothing). US listings, which is how a foreign major appears here in
            dollars rather than in its home currency. RSI at or above {OVERBOUGHT} reads
            overbought, at or below {OVERSOLD} oversold.
          </p>
        </>
      )}
    </div>
  );
}
