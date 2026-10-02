"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArcElement, Chart as ChartJS, Tooltip } from "chart.js";
import { Doughnut } from "react-chartjs-2";
import { useTheme } from "@/components/PageChrome";
import HedgeFundCharts from "@/components/HedgeFundCharts";
import QuarterPicker from "@/components/QuarterPicker";
import { HEDGE_QUARTERS } from "@/lib/hedgeFundQuarters";
import { buildDonut, donutPalette, sliceColor as sliceColorFor } from "@/lib/donutChart";
import { logoUrl, managerLogoUrl, blankBrokenLogo } from "@/lib/companyLogo";
import { MANAGER_TICKERS } from "@/lib/institutions";
import { cycleSort, sortRows } from "@/lib/sortRows";
import {
  changeClass,
  money,
  pct,
  quarterLabel,
  reportDate,
  shortName,
  signed,
  signedPct,
} from "@/lib/hedgeFundFormat";

ChartJS.register(ArcElement, Tooltip);

// The three things a 13F table can contain, in the order they're worth reading.
// A market maker's table is mostly options; a stock picker's is all shares, and
// the bar is the fastest way to tell which kind of firm you're looking at. The
// two hues carry through to the ring headings below, so the bar and the rings
// are visibly the same split.
const SHARES_COLOR = "#3987e5";
const OPTIONS_COLOR = "#e0457b";
const BREAKDOWN = [
  { key: "shares", label: "Shares", color: SHARES_COLOR },
  { key: "options", label: "Options", color: OPTIONS_COLOR },
  { key: "other", label: "Other", color: "#8b93a3" },
];

// One book's ring: the donut, what it's worth, and a legend naming every slice.
// The legend is the chart's identity layer rather than decoration - three of
// the light hues sit under 3:1 on a light surface, so the label has to carry
// the name rather than the color alone.
function Ring({ title, color, total, count, slices, chart, sliceColor }) {
  const named = slices.filter((s) => s.rest == null).length;
  return (
    <div className="hf-ring">
      <h3 className="hf-ring-title">
        <span className="hf-swatch" style={{ background: color }} />
        {title}
        <span className="hf-ring-total">{money(total)}</span>
      </h3>
      <div className="hf-donut-wrap">
        <div className="hf-donut">
          <Doughnut data={chart.data} options={chart.options} />
          <div className="hf-donut-center" aria-hidden="true">
            <span className="hf-donut-center-top">{named === count ? "All" : `Top ${named}`}</span>
            <span className="hf-donut-center-sub">
              {count.toLocaleString()} {count === 1 ? "position" : "positions"}
            </span>
          </div>
        </div>
        <ul className="hf-legend hf-ring-legend">
          {/* Keyed on position, not label: a label is a ticker where one
              resolved and the issuer's name where none did, and a filer can
              hold two different funds of the same trust - LPL holds two lines
              that both read "SPDR SERIES TRUST". */}
          {slices.map((s, i) => (
            <li key={`${s.label}-${i}`}>
              <span className="hf-swatch" style={{ background: sliceColor(s, i) }} />
              {/* Only where a symbol resolved - "Other" and the unresolved
                  issuer names have nothing to look a logo up by. */}
              {s.ticker ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="hf-logo hf-legend-logo"
                  src={logoUrl(s.ticker)}
                  alt=""
                  width="16"
                  height="16"
                  loading="lazy"
                  onError={blankBrokenLogo}
                />
              ) : (
                // Still owes the row its width, or the labels beside it step left.
                <span className="hf-legend-logo" aria-hidden="true" />
              )}
              <span className="hf-legend-label">
                {s.label === "Other" ? `Other (${s.rest.toLocaleString()})` : s.label}
                {s.issuer && <span className="hf-legend-issuer">{s.issuer}</span>}
              </span>
              <span className="hf-legend-pct">{pct(s.pct)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// A sortable numeric column head. The whole cell is the button so the target is
// the header rather than a caret beside it, and aria-sort tells a screen reader
// what the arrow shows sighted readers.
function SortTh({ k, sort, onSort, children }) {
  const active = sort?.key === k;
  const dir = sort?.dir;
  return (
    <th className={`num hf-sort${active ? ` hf-sort-${dir}` : ""}`} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(k)}>
        <span>{children}</span>
        <b aria-hidden="true">{active ? (dir === "asc" ? "\u2191" : "\u2193") : "\u2195"}</b>
      </button>
    </th>
  );
}

export default function HedgeFundDetail({ cik, initialPeriod = null, roster = "hedgefunds" }) {
  const theme = useTheme();
  const [fund, setFund] = useState(null);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  // What sits under the rings: one of the two books, or the charts. The rings
  // always show both books; this only decides what's below them.
  const [tab, setTab] = useState("shares");
  // The charts read every quarter at once and take no `kind`, so the request
  // below stays on whichever book was last listed rather than refetching when
  // the reader is looking at something else entirely.
  const kind = tab === "options" ? "options" : "shares";
  // Which quarter's filing to read, carried in from the list if that's where
  // the reader came from. `null` is the newest, which is also what the API
  // means by no quarter at all - so the default and the newest share a cache
  // entry rather than reading the same information table twice.
  const [period, setPeriod] = useState(initialPeriod);
  const [periods, setPeriods] = useState([]);
  // All / added / reduced, against the quarter before. Filtered on the server
  // because the table is paginated there - see the route.
  const [change, setChange] = useState("all");
  // Which column the table is ordering by. null is the filing's own order,
  // biggest position first, which is how a 13F is normally read. Same
  // {key, dir} shape the manager list uses, sorted by the same helper - the 25
  // rows are already in hand, so a column click is a reorder in memory rather
  // than a round trip that re-reads the filing.
  const [sort, setSort] = useState(null);

  const at = period ? `&period=${encodeURIComponent(period)}` : "";
  const changeParam = change === "all" ? "" : `&change=${change}`;

  useEffect(() => {
    // Superseded requests are aborted, not just ignored. Sorting a book this
    // size is not a cheap request, and clicking across a few columns used to
    // leave every one of them running while only the last was read - enough of
    // them at once to get one answered with an error page rather than a book.
    const ac = new AbortController();
    fetch(
      `/api/hedge-funds?cik=${encodeURIComponent(cik)}&kind=${kind}&page=${page}${at}${changeParam}`,
      { signal: ac.signal }
    )
      .then(async (r) => {
        // An error page is HTML, and handing that to the JSON parser reports
        // it as a stray "<" rather than as the failure it is. The route says
        // what went wrong when it can; a status is the fallback when the body
        // isn't ours either.
        if (!r.ok) {
          const body = await r.json().catch(() => null);
          throw new Error(
            body?.error ?? `Couldn't load this book (${r.status}). Try again in a moment.`
          );
        }
        return r.json();
      })
      .then((j) => {
        if (j.error) throw new Error(j.error);
        setError(null);
        setFund(j);
        // Held apart from the book so the picker survives both the reload and
        // a quarter this manager didn't file for - otherwise landing on an
        // empty quarter would take away the control needed to leave it.
        if (j.periods?.length) setPeriods(j.periods);
      })
      .catch((e) => {
        // An abort is this effect being replaced by the next one, which is not
        // something to tell the reader about.
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => ac.abort();
  }, [cik, kind, page, at, changeParam]);

  // Clicking a column sorts the page in view, not the whole book, so the reader
  // stays where they are - the same 25 rows, reordered.
  const sortBy = useCallback((key) => setSort((s) => cycleSort(s, key)), []);

  // A position opened this quarter has no percentage to sort by - it grew from
  // nothing - so it sorts as unknown and sinks to the bottom rather than
  // counting as zero.
  const holdings = useMemo(() => {
    if (!fund) return [];
    if (!sort) return fund.holdings;
    return sortRows(
      sort.key === "sharesChangePct"
        ? fund.holdings.map((h) => (h.isNew ? { ...h, sharesChangePct: null } : h))
        : fund.holdings,
      sort
    );
  }, [fund, sort]);

  // A different quarter is a different book: a page number and a shares/options
  // split from the last one don't carry over.
  const showQuarter = useCallback((next) => {
    setPeriod(next);
    setPage(1);
    setFund(null);
  }, []);

  // Only the table swaps when the page changes, so the header and rings stay
  // put rather than blanking out and reflowing under the reader. Read off what
  // came back rather than tracked separately - a request is in flight exactly
  // while the two disagree.
  const paging = !fund || fund.page !== page || fund.kind !== kind;

  const showBook = useCallback((next) => {
    setTab(next);
    // A different book is a different length; page 40 of the shares may not
    // exist in the options.
    setPage(1);
  }, []);

  // A filter is a different length too, for the same reason.
  const showChange = useCallback((next) => {
    setChange(next);
    setPage(1);
  }, []);

  // Charts read their colors from CSS variables, so they rebuild on a theme change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const palette = useMemo(() => donutPalette(), [theme]);

  const sliceColor = useMemo(() => sliceColorFor(palette), [palette]);

  // Both rings are the same chart over different slices, so they're built by
  // the same function rather than written twice.
  const buildChart = useCallback((slices) => buildDonut(slices, palette), [palette]);

  const shareChart = useMemo(
    () => (fund?.slices.length ? buildChart(fund.slices) : null),
    [fund, buildChart]
  );
  const optionChart = useMemo(
    () => (fund?.optionSlices.length ? buildChart(fund.optionSlices) : null),
    [fund, buildChart]
  );

  // The reported total is the cover page's, which counts everything in the
  // table. Whatever isn't shares or options is debt, reported by principal.
  const breakdown = useMemo(() => {
    if (!fund) return [];
    const total = fund.totalValue || fund.stockValue + fund.optionValue;
    if (!total) return [];
    const values = {
      shares: fund.stockValue,
      options: fund.optionValue,
      other: Math.max(0, total - fund.stockValue - fund.optionValue),
    };
    return BREAKDOWN.map((b) => ({ ...b, value: values[b.key], pct: (values[b.key] / total) * 100 })).filter(
      (b) => b.pct >= 0.05
    );
  }, [fund]);

  // Back to the list the reader came from, named as that list - arriving from
  // the institutions tab and being offered "back to hedgefunds" points at a
  // list this manager isn't on.
  const institutions = roster === "institutions";
  const back = (
    <Link className="hf-back" href={institutions ? "/hedge-funds?roster=institutions" : "/hedge-funds"}>
      <span aria-hidden="true">←</span> Back to {institutions ? "institutions" : "hedgefunds"}
    </Link>
  );

  // The picker follows the reader into both the error and the loading state.
  // A quarter this manager didn't file for is reached by choosing it, so the
  // way out has to still be on the page when it turns out to be empty.
  //
  // Falling back to the site-wide quarters matters for a first load that lands
  // straight on an empty quarter - a shared link, or a click from the list into
  // a quarter the manager filed nothing for. Nothing ever answered, so the
  // manager's own periods are still unknown, and without a fallback the reader
  // gets an error with no control to leave it by.
  const picker = (
    <QuarterPicker
      periods={periods.length ? periods : HEDGE_QUARTERS.quarters}
      value={period ?? periods[0] ?? null}
      onChange={showQuarter}
      label="Which quarter's 13F to show"
    />
  );

  if (error) {
    return (
      <div className="hf-page">
        {back}
        {picker}
        <p className="screener-error">{error}</p>
      </div>
    );
  }

  if (!fund) {
    return (
      <div className="hf-page">
        {back}
        {picker}
        <div className="hf-placeholder">
          <p>Reading the filing…</p>
        </div>
      </div>
    );
  }

  const options = fund.kind === "options";
  const first = (fund.page - 1) * fund.pageSize + 1;
  const last = first + fund.holdings.length - 1;

  return (
    <div className="hf-page">
      {back}

      <div className="hf-detail-head">
        <h1 className="hf-detail-name">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="hf-detail-logo"
            src={managerLogoUrl(cik, fund.name, MANAGER_TICKERS[cik], 128)}
            alt=""
            width="34"
            height="34"
            onError={blankBrokenLogo}
          />
          {shortName(fund.name)}
        </h1>
        <p className="hf-sub">
          What this manager reported owning on {reportDate(fund.period)}, read straight from its
          Form 13F at the SEC. Pick a quarter to read an earlier one.
        </p>
        {picker}
      </div>

      {/* A dl rather than a row of divs: these are labelled values, and a
          screen reader reading "YoY return (est.)" before the number is the
          whole difference between a figure and a fact. */}
      <dl className="hf-facts">
        <div className="hf-fact">
          <dt>YoY return (est.)</dt>
          <dd className={fund.yoyReturn == null ? undefined : changeClass(fund.yoyReturn)}>
            {fund.yoyReturn == null ? "n/a" : signedPct(fund.yoyReturn)}
          </dd>
        </div>
        <div className="hf-fact">
          <dt>Total value of holdings</dt>
          <dd>{money(fund.totalValue)}</dd>
        </div>
        {/* The reported book against its own quarter a year earlier. Not a
            return: it moves with subscriptions, redemptions and trading as
            much as with the market, which is why it is labelled by what it
            actually measures. */}
        <div className="hf-fact">
          <dt>
            Total value vs {fund.valueYoy ? quarterLabel(fund.valueYoy.priorPeriod) : "a year ago"}
          </dt>
          <dd className={fund.valueYoy == null ? undefined : changeClass(fund.valueYoy.percent)}>
            {fund.valueYoy == null ? "n/a" : signedPct(fund.valueYoy.percent)}
          </dd>
        </div>
        <div className="hf-fact">
          <dt>Holdings</dt>
          <dd>{fund.issuers.toLocaleString()}</dd>
        </div>
        <div className="hf-fact">
          {/* Not "last report" any more - it's whichever quarter is selected. */}
          <dt>Report date</dt>
          <dd className="hf-fact-plain">{reportDate(fund.period)}</dd>
        </div>
        <div className="hf-fact hf-fact-wide">
          <dt>Holdings breakdown</dt>
          <dd>
            <div className="hf-bar">
              {breakdown.map((b) => (
                <span
                  key={b.key}
                  className="hf-bar-seg"
                  style={{ width: `${b.pct}%`, background: b.color }}
                  title={`${b.label}: ${money(b.value)}`}
                >
                  {b.pct >= 12 ? pct(b.pct) : ""}
                </span>
              ))}
            </div>
            <ul className="hf-bar-key">
              {breakdown.map((b) => (
                <li key={b.key}>
                  <span className="hf-swatch" style={{ background: b.color }} />
                  {b.label}
                </li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>

      {/* Two rings rather than one. A 13F reports an option at the value of the
          shares underneath it, so for the market makers on this list the
          options side is several times the stock side - drawing both in one
          ring would label exposure as ownership. */}
      <p className="hf-explain">
        Two books, side by side: the <b>{money(fund.stockValue)}</b> of shares and the{" "}
        <b>{money(fund.optionValue)}</b> of options. A 13F values an option at the shares underneath
        it, so each ring is a percentage of its own book rather than of the total. The YoY figure is
        an <b>estimate</b>: it moves this book&apos;s largest share positions by what those shares
        have done over the last year, and no 13F reports a fund&apos;s actual return.
        {fund.valueYoy && (
          <>
            {" "}
            The total value comparison is a different measure and not a return - it is what this
            manager reported for {quarterLabel(fund.period)} against{" "}
            <b>{money(fund.valueYoy.prior)}</b> for {quarterLabel(fund.valueYoy.priorPeriod)}, which
            also moves with money entering and leaving the fund.
          </>
        )}
      </p>

      <section className="hf-panel">
        <div className="hf-panel-head">
          <h2>Holdings breakdown</h2>
          <span className="hf-note">
            13F for {fund.period}, filed {fund.filed}
          </span>
        </div>
        <div className="hf-rings">
          {shareChart && (
            <Ring
              title="Stock positions"
              color={SHARES_COLOR}
              total={fund.stockValue}
              count={fund.issuers}
              slices={fund.slices}
              chart={shareChart}
              sliceColor={sliceColor}
            />
          )}
          {optionChart ? (
            <Ring
              title="Option positions"
              color={OPTIONS_COLOR}
              total={fund.optionValue}
              count={fund.optionIssuers}
              slices={fund.optionSlices}
              chart={optionChart}
              sliceColor={sliceColor}
            />
          ) : (
            // A stock picker files no options at all, and an empty ring beside
            // a full one reads as a chart that failed rather than a book that
            // doesn't exist.
            <div className="hf-ring hf-ring-empty">
              <p>This manager reported no option positions for {fund.period}.</p>
            </div>
          )}
        </div>
      </section>

      <section className="hf-panel">
        <div className="hf-panel-head">
          <div className="hf-toggle" role="group" aria-label="What to show below the rings">
            <button
              type="button"
              className={tab === "shares" ? "on" : undefined}
              aria-pressed={tab === "shares"}
              onClick={() => showBook("shares")}
            >
              Stock positions
            </button>
            <button
              type="button"
              className={tab === "options" ? "on" : undefined}
              aria-pressed={tab === "options"}
              onClick={() => showBook("options")}
              disabled={!fund.optionIssuers}
            >
              Option positions
            </button>
            <button
              type="button"
              className={tab === "charts" ? "on" : undefined}
              aria-pressed={tab === "charts"}
              onClick={() => showBook("charts")}
            >
              Charts &amp; Visualizations
            </button>
          </div>
          {/* Against the quarter before, so it only means anything on the two
              tables - the charts are every quarter at once. A manager's first
              filing has nothing to compare with and the counts come back
              empty, which is the honest answer rather than a hidden control. */}
          {tab !== "charts" && (
            <div className="hf-toggle hf-toggle-change" role="group" aria-label="Filter positions by change since last quarter">
              {[
                ["all", "All"],
                ["added", "Added"],
                ["reduced", "Reduced"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={change === key ? "on" : undefined}
                  aria-pressed={change === key}
                  onClick={() => showChange(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {/* The pager belongs to the tables. The charts are one screen with
              nothing to page through, so it goes rather than sitting there
              disabled above them. */}
          <div className="hf-pager" hidden={tab === "charts"}>
            <span className="hf-note">
              {fund.rowCount
                ? `${first.toLocaleString()}–${last.toLocaleString()} of ${fund.rowCount.toLocaleString()}`
                : "None"}
              {/* Which slice of the whole book the filter left, so the number
                  above reads as a subset rather than as the book itself. */}
              {change !== "all" && fund.bookCount
                ? ` ${change} (of ${fund.bookCount.toLocaleString()})`
                : ""}
            </span>
            <button
              type="button"
              className="hf-page-btn"
              onClick={() => setPage((p) => p - 1)}
              disabled={page <= 1 || paging}
              aria-label="Previous page"
            >
              ←
            </button>
            <span className="hf-note">
              Page {fund.page.toLocaleString()} of {fund.pages.toLocaleString()}
            </span>
            <button
              type="button"
              className="hf-page-btn"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= fund.pages || paging}
              aria-label="Next page"
            >
              →
            </button>
          </div>
        </div>

        {tab === "charts" ? (
          <HedgeFundCharts cik={cik} name={shortName(fund.name)} />
        ) : (
        <div className="screener-table-scroll">
          <table className="screener-table hf-holdings">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Name</th>
                {/* A put and a call on the same name are opposite bets, so the
                    side is a column rather than something to infer. */}
                {options && <th>Side</th>}
                <SortTh k="shares" sort={sort} onSort={sortBy}>{options ? "Shares under" : "Shares owned"}</SortTh>
                {/* Both change columns say which quarter they're against in the
                    header, so no row has to carry the caveat. */}
                <SortTh k="sharesChange" sort={sort} onSort={sortBy}>Change{fund.priorPeriod ? ` vs ${fund.priorPeriod}` : ""}</SortTh>
                <SortTh k="sharesChangePct" sort={sort} onSort={sortBy}>Change %</SortTh>
                <SortTh k="price" sort={sort} onSort={sortBy}>Price</SortTh>
                {/* Estimated, and the footnote says so - a 13F never reports a
                    cost. Both columns sit beside Price so the three prices a
                    row carries read together. */}
                <SortTh k="avgPrice" sort={sort} onSort={sortBy}>Avg cost<i>est</i></SortTh>
                <SortTh k="estPnl" sort={sort} onSort={sortBy}>Est. P/L<i>est</i></SortTh>
                <SortTh k="value" sort={sort} onSort={sortBy}>Value</SortTh>
                <SortTh k="pct" sort={sort} onSort={sortBy}>% of book</SortTh>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => (
                <tr key={h.key}>
                  <td>
                    {/* No ticker means the issuer name didn't match a listed
                        company - almost always a fund or trust, which has
                        neither a logo nor a page to link to. The cell keeps its
                        width either way so the column still reads as a column. */}
                    {h.ticker ? (
                      <Link className="hf-ticker" href={`/stock/${encodeURIComponent(h.ticker)}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          className="hf-logo"
                          src={logoUrl(h.ticker)}
                          alt=""
                          width="22"
                          height="22"
                          loading="lazy"
                          onError={blankBrokenLogo}
                        />
                        <span className="screener-symbol">{h.ticker}</span>
                      </Link>
                    ) : (
                      <span className="hf-ticker hf-ticker-none" aria-label="No listed ticker">
                        —
                      </span>
                    )}
                  </td>
                  <td className="hf-company">{h.name}</td>
                  {options && (
                    <td>
                      <span className={`hf-side hf-side-${h.side?.toLowerCase()}`}>{h.side}</span>
                    </td>
                  )}
                  <td className="num">{h.shares.toLocaleString()}</td>
                  <td className={`num ${changeClass(h.sharesChange ?? 0)}`}>
                    {h.sharesChange == null ? "n/a" : signed(h.sharesChange)}
                  </td>
                  <td className={`num ${changeClass(h.sharesChangePct ?? 0)}`}>
                    {/* A position opened this quarter has no percentage to
                        report - it grew from nothing. */}
                    {h.isNew
                      ? "New"
                      : h.sharesChangePct == null
                        ? "n/a"
                        : signedPct(h.sharesChangePct)}
                  </td>
                  <td className="num">{h.price == null ? "n/a" : h.price.toFixed(2)}</td>
                  <td className="num">{h.avgPrice == null ? "n/a" : h.avgPrice.toFixed(2)}</td>
                  <td className={`num ${changeClass(h.estPnl ?? 0)}`}>
                    {h.estPnl == null ? (
                      "n/a"
                    ) : (
                      <>
                        {signed(Math.round(h.estPnl))}
                        {h.estPnlPct != null && <i className="hf-pnl-pct">{signedPct(h.estPnlPct)}</i>}
                      </>
                    )}
                  </td>
                  <td className="num">{money(h.value)}</td>
                  <td className="num">{pct(h.pct)}</td>
                </tr>
              ))}
              {/* A filter that matches nothing, or a first filing with no
                  prior quarter to measure against. */}
              {!fund.holdings.length && (
                <tr>
                  <td colSpan={options ? 11 : 10} className="hf-empty">
                    {change === "all"
                      ? "This filing reported no positions in this book."
                      : `No positions ${change === "added" ? "added" : "reduced"} against ${
                          fund.priorPeriod ? reportDate(fund.priorPeriod) : "the quarter before"
                        }.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        )}
      </section>

      <p className="hf-source">
        Source: SEC EDGAR Form 13F filings. Managers file within 45 days of quarter end, so a book
        is up to a quarter and a half old — and a 13F covers US-listed long positions only, not
        shorts, cash or anything held outside the US. <b>Price</b> is the position&apos;s value
        divided by its share count on the reporting date, which is what the filing implies the
        shares were worth that day; it is not an average cost, because a 13F never says what was
        paid. On an option row it is the price of the shares underneath, not the premium, and{" "}
        <b>shares under</b> is how many of them the contracts cover. <b>Avg cost</b> and{" "}
        <b>Est. P/L</b> are estimates built from the filings themselves: every share this manager
        added is charged at the price its own quarter&apos;s filing implied, giving a
        weighted-average cost, and the P/L marks that against this quarter&apos;s price. They are
        not a real cost basis — the manager traded at prices the quarter held, not at its closing
        mark, and anything bought and sold between two filings never appears at all. Share changes compare the same
        security, by CUSIP and by side, against the manager&apos;s previous quarterly filing.
      </p>
    </div>
  );
}
