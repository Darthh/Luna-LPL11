"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArcElement, Chart as ChartJS, Tooltip } from "chart.js";
import { Doughnut } from "react-chartjs-2";
import { useTheme } from "@/components/PageChrome";
import QuarterPicker from "@/components/QuarterPicker";
import { logoUrl, managerLogoUrl, blankBrokenLogo } from "@/lib/companyLogo";
import { MANAGER_TICKERS } from "@/lib/institutions";
import { buildDonut, donutPalette, sliceColor as sliceColorFor } from "@/lib/donutChart";
import {
  changeClass,
  money,
  pct,
  reportDate,
  shortDate,
  shortName,
  signedPct,
} from "@/lib/hedgeFundFormat";
import { cycleSort, sortRows } from "@/lib/sortRows";
import { managerSlug } from "@/lib/managerSlug";

ChartJS.register(ArcElement, Tooltip);

const COLUMNS = [
  { key: "name", label: "Hedgefund" },
  { key: "totalValue", label: "Total value", num: true },
  { key: "yoy", label: "YoY", num: true },
  { key: "positions", label: "Positions", num: true },
  { key: "period", label: "Quarter", num: true },
];

// The first column is named after whichever list is showing - "Hedgefund" over
// Citadel, "Institution" over BlackRock. Everything else is the same fact
// either way.
const columnsFor = (roster) =>
  COLUMNS.map((c) =>
    c.key === "name" ? { ...c, label: roster === "institutions" ? "Institution" : "Hedgefund" } : c
  );

// The aggregates read every manager's information table twice over, which runs
// to minutes at the SEC's rate limit. The API hands back how far along it is
// and this asks again; each ask pushes the build further.
const POLL_MS = 4000;

function TickerCell({ ticker }) {
  return (
    <Link className="hf-ticker" href={`/stock/${encodeURIComponent(ticker)}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="hf-logo"
        src={logoUrl(ticker)}
        alt=""
        width="22"
        height="22"
        loading="lazy"
        onError={blankBrokenLogo}
      />
      <span className="screener-symbol">{ticker}</span>
    </Link>
  );
}

// Both leaderboards are the same shape - twenty tickers and a few counts - so
// they're one table that takes its columns as an argument.
function TopTable({ title, note, rows, columns, state }) {
  return (
    <section className="hf-panel">
      <div className="hf-panel-head">
        <h2>{title}</h2>
        <span className="hf-note">{note}</span>
      </div>
      {state ? (
        <p className="hf-empty">{state}</p>
      ) : (
        // Narrow column, five columns of numbers: the table scrolls inside the
        // panel rather than widening the page out from under the list. Fourteen
        // rows tall, so twenty tickers don't push the second board off screen.
        <div className="screener-table-scroll hf-scroll hf-top-scroll">
          <table className="screener-table hf-top">
            <thead>
              <tr>
                <th>Ticker</th>
                {columns.map((c) => (
                  <th key={c.label} className="num">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ticker}>
                  <td>
                    <TickerCell ticker={r.ticker} />
                  </td>
                  {columns.map((c) => (
                    <td key={c.label} className="num">
                      {c.value(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// Short headers: these two panels gave up their width to the list beside them,
// and a wrapped two-word header costs a row of height on every table.
const INCREASED_COLUMNS = [
  { label: "Added", value: (r) => money(r.added) },
  { label: "Buyers", value: (r) => r.adds.toLocaleString() },
  { label: "Opened", value: (r) => r.opened.toLocaleString() },
];

// No "Buyers" here. Who bought is what the increased board is for; this one
// answers what is held and by how many, and the third number was buying it
// back a column at the cost of the list beside it.
const OWNED_COLUMNS = [
  { label: "Held", value: (r) => money(r.value) },
  { label: "Funds", value: (r) => r.funds.toLocaleString() },
];

// Module-level so the ring isn't rebuilt on every render of the page around it.
const sliceAdded = (r) => r.added;
const sliceHeld = (r) => r.value;

// A leaderboard as one picture: each of the twenty tickers as its share of the
// board's total. The legend names every slice, because the hues alone don't
// carry twenty labels - same rule as the rings on a manager's page - and the
// wheel uses plain color slices; company icons remain in the legend.
//
// One component for both boards: they differ only in which number off the row
// is the slice, so a second copy of this would be a second place for the ring
// and its legend to drift apart.
function ShareDonut({ title, centerSub, sliceValue, empty, rows, note, state }) {
  const theme = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const palette = useMemo(() => donutPalette(), [theme]);
  const slices = useMemo(() => {
    const total = rows.reduce((a, r) => a + sliceValue(r), 0);
    if (!total) return [];
    return rows.map((r) => ({ label: r.ticker, value: sliceValue(r), pct: (sliceValue(r) / total) * 100 }));
  }, [rows, sliceValue]);
  const chart = useMemo(() => (slices.length ? buildDonut(slices, palette) : null), [slices, palette]);
  const color = sliceColorFor(palette);

  return (
    <section className="hf-panel hf-donut-panel">
      <div className="hf-panel-head">
        <h2>{title}</h2>
        <span className="hf-note">{note}</span>
      </div>
      {state || !chart ? (
        <p className="hf-empty">{state ?? empty}</p>
      ) : (
        <div className="hf-donut-wrap">
          <div className="hf-donut">
            <Doughnut data={chart.data} options={chart.options} />
            <div className="hf-donut-center" aria-hidden="true">
              <span className="hf-donut-center-top">Top {slices.length}</span>
              <span className="hf-donut-center-sub">{centerSub}</span>
            </div>
          </div>
          {/* Two columns of ten, in rank order down each - see
              .hf-share-legend. Every slice here is a resolved ticker, so
              unlike the ring legend on a manager's page there is no
              logo-less row to reserve width for. */}
          <ul className="hf-legend hf-share-legend">
            {slices.map((s, i) => (
              <li key={s.label}>
                <span className="hf-swatch" style={{ background: color(s, i) }} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="hf-logo hf-legend-logo"
                  src={logoUrl(s.label)}
                  alt=""
                  width="20"
                  height="20"
                  loading="lazy"
                  onError={blankBrokenLogo}
                />
                <span className="hf-legend-label">{s.label}</span>
                <span className="hf-legend-pct">{pct(s.pct)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default function HedgeFunds({ initialRoster = "institutions" }) {
  const [funds, setFunds] = useState(null);
  const [periods, setPeriods] = useState([]);
  // Which list is showing. Both are 13F filers read by the same code; the split
  // is by what the firm is - see lib/institutions.js.
  const [roster, setRoster] = useState(initialRoster);
  // Which quarter the list is showing. `null` until the first response says
  // which quarters exist - the newest one is whatever EDGAR has, not something
  // this page can name up front.
  const [period, setPeriod] = useState(null);
  const [listError, setListError] = useState(null);
  const [sort, setSort] = useState(null);
  const [query, setQuery] = useState("");

  const [agg, setAgg] = useState(null);
  const [aggError, setAggError] = useState(null);

  // The two lists have different bars - see minValueFor in lib/thirteenF.js -
  // and the copy says which one it is rather than naming a figure that is only
  // true on one tab.
  const floorLabel = roster === "institutions" ? "$100B" : "$2B";

  const latest = periods[0] ?? null;
  const selected = period ?? latest;
  // The newest quarter is requested by asking for no quarter at all. Naming it
  // would be the same answer under a second cache key, and building this list
  // is twenty EDGAR round trips - so the default and the explicit newest stay
  // one entry rather than two.
  const back = selected && selected !== latest ? selected : null;
  const search = [
    `roster=${roster}`,
    back ? `period=${encodeURIComponent(back)}` : null,
  ]
    .filter(Boolean)
    .join("&");
  const listSearch = search ? `?${search}` : "";

  // The list is one quarter at a time, so picking another clears the rows
  // rather than leaving the old quarter's under the new heading. Done here and
  // not in the effect: the effect's job is the request, and clearing state from
  // inside it is a second render for something the click already knows.
  // Switching lists clears the rows for the same reason switching quarters
  // does: the two rosters are different firms, and leaving one list's rows
  // under the other's heading would be showing the wrong answer while the
  // right one loads. The quarter survives the switch - "Q1 2024" means the
  // same thing on both sides.
  const showRoster = useCallback((next) => {
    setRoster(next);
    const params = new URLSearchParams(window.location.search);
    if (next === "institutions") params.delete("roster"); else params.set("roster", next);
    window.history.replaceState(null, "", `/13Filings${params.size ? `?${params}` : ""}`);
    setFunds(null);
    setListError(null);
    setSort(null);
    setQuery("");
  }, []);

  const showQuarter = useCallback((next) => {
    setPeriod(next);
    setFunds(null);
    setListError(null);
    // The boards belong to a quarter too, so they clear with the list rather
    // than leaving the quarter just left up beside the one being read.
    setAgg(null);
    setAggError(null);
  }, []);

  useEffect(() => {
    let live = true;
    fetch(`/api/hedge-funds${listSearch}`)
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (j.error) throw new Error(j.error);
        setFunds(j.funds);
        setPeriods(j.periods ?? []);
      })
      .catch((e) => live && setListError(e.message));
    return () => {
      live = false;
    };
  }, [listSearch]);

  // A build in progress answers with its progress rather than an answer, so
  // this keeps asking until it stops saying "building". The timer is cleared on
  // unmount so a reader who leaves the page stops driving the build.
  const timer = useRef(null);
  useEffect(() => {
    let live = true;
    const ask = () => {
      fetch(`/api/hedge-funds?view=aggregate${back ? `&period=${encodeURIComponent(back)}` : ""}`)
        .then((r) => r.json())
        .then((j) => {
          if (!live) return;
          if (j.error) throw new Error(j.error);
          setAgg(j);
          if (j.building) timer.current = setTimeout(ask, POLL_MS);
        })
        .catch((e) => live && setAggError(e.message));
    };
    ask();
    return () => {
      live = false;
      clearTimeout(timer.current);
    };
    // Only the newest quarter is a read of the stored snapshot; every other one
    // is read from EDGAR when it's first asked for, which is what the progress
    // this polls for is reporting.
  }, [back]);

  // Match on the filed name, which is the longer of the two - a reader typing
  // "advisors" finds Citadel even though the table shows it shortened.
  const rows = useMemo(() => {
    if (!funds) return [];
    const q = query.trim().toLowerCase();
    const matched = q ? funds.filter((f) => f.name.toLowerCase().includes(q)) : funds;
    return sortRows(matched, sort);
  }, [funds, sort, query]);

  // One message for both panels: no aggregate yet, an aggregate still being
  // read, or the thing itself.
  // Which quarter the boards describe. The API serves them from a file read
  // once a quarter (lib/hedgeFundTop20.js), so saying so is what keeps a
  // reader from taking a three-month-old board for this morning's.
  const quarter = agg?.asOf ? ` · ${reportDate(agg.asOf)}` : "";

  // The boards show ten; the generated file keeps twenty per quarter.
  const topIncreased = (agg?.increased ?? []).slice(0, 20);
  const topOwned = (agg?.mostOwned ?? []).slice(0, 20);

  const aggState = aggError
    ? aggError
    : !agg
      ? "Reading filings…"
      : agg.building
        ? `Reading filings… ${agg.read} of ${agg.total} managers`
        : null;

  return (
    <div className="hf-page">
      <div className="hf-head">
        <h1 className="hf-title">13F Filings</h1>
        <p className="hf-sub">
          Every manager whose <b>Form 13F</b>{" "}for the quarter reports a book of {floorLabel} or
          more, read straight from the SEC&apos;s EDGAR archive. Switch between the hedgefunds and
          trading firms and the institutions - the asset managers, banks and brokers. Pick a
          quarter to see the list as it stood then, or a manager to see what it owned.
        </p>
        <QuarterPicker
          periods={periods}
          value={selected}
          onChange={showQuarter}
          label="Which quarter's 13F filings to show"
        />
      </div>

      {listError && <p className="screener-error">{listError}</p>}

      <div className="hf-grid">
        <section className="hf-panel">
          <div className="hf-panel-head">
            {/* The heading is the toggle. Two lists of 13F filers, split by
                what the firm is rather than by what it files - so the control
                that swaps them belongs where the label was, not off in a
                corner as a separate filter. */}
            <div className="hf-roster-toggle" role="group" aria-label="Which list to show">
              {[
                ["institutions", "Institutions"],
                ["hedgefunds", "Hedgefunds"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={roster === value}
                  onClick={() => showRoster(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* Same field as the site header, filtering the list under it. */}
            <div className="hf-search" role="search">
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
                <path
                  d="M16.5 16.5 21 21"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search hedgefunds or institutions by name"
                placeholder="Search hedgefunds or institutions by name."
                spellCheck={false}
              />
            </div>
            <span className="hf-note">
              {!funds
                ? "Loading filings…"
                : query.trim()
                  ? `${rows.length} of ${funds.length}`
                  : `${funds.length} over ${floorLabel}`}
            </span>
          </div>
          <div className="screener-table-scroll hf-scroll hf-list-scroll">
            <table className="screener-table hf-funds">
              <thead>
                <tr>
                  {columnsFor(roster).map((c) => {
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
                {rows.map((f) => (
                  <tr key={f.cik} className="hf-row">
                    <td>
                      {/* The link carries the row rather than sitting inside a
                          cell of it, so the whole name column is the target. */}
                      {/* The quarter and the list travel with the link, so
                          clicking a manager while looking at an older quarter
                          opens that manager at the same one - and the page
                          knows which list to send the reader back to. */}
                      <Link
                        className="hf-manager"
                        href={`/13Filings/${managerSlug(f.name)}${listSearch}`}
                        title={shortName(f.name)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          className="hf-logo"
                          src={managerLogoUrl(f.cik, f.name, MANAGER_TICKERS[f.cik])}
                          alt=""
                          width="22"
                          height="22"
                          loading="lazy"
                          onError={blankBrokenLogo}
                        />
                        <span>{shortName(f.name)}</span>
                      </Link>
                    </td>
                    <td className="num">{money(f.totalValue)}</td>
                    <td className={`num ${f.yoy == null ? "" : changeClass(f.yoy)}`}>
                      {f.yoy == null ? "n/a" : signedPct(f.yoy)}
                    </td>
                    <td className="num">{f.positions.toLocaleString()}</td>
                    <td className="num">{shortDate(f.period)}</td>
                  </tr>
                ))}
                {!rows.length && !listError && (
                  <tr>
                    <td colSpan={COLUMNS.length} className="hf-empty">
                      {funds ? `No hedgefund matches “${query.trim()}”` : "Loading filings…"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Under the list rather than at the foot of the page: the list is
              the tallest thing here, so anything after it sat in a screen of
              empty space below the leaderboards. */}
          <p className="hf-source">
            Source: SEC EDGAR Form 13F filings. Managers file within 45 days of quarter end, so a
            book is up to a quarter and a half old — and a 13F covers US-listed long positions only,
            not shorts, cash or anything held outside the US. The two leaderboards add up the share
            positions of every manager on this list: <b>added</b> is what each one bought since its
            previous filing, priced at what that filing implies those shares were worth;{" "}
            <b>buyers</b> counts the managers on the buying side of it; <b>opened</b> is
            how many started the position from nothing; and <b>funds</b> is how many report holding
            the ticker at all. Both boards follow the quarter you pick, and both measure buying
            against each manager&apos;s previous filing — so on Q1 2026 they describe what changed
            between Q4 2025 and Q1 2026. Every quarter in the picker is served from its recorded
            snapshot rather than being fetched from EDGAR again.{" "}
            <b>YoY</b> compares the reported total value with the same quarter one year earlier.
            It is not a fund return: subscriptions, withdrawals, purchases and sales also change it.
          </p>
        </section>

        <div className="hf-tops">
          <TopTable
            title="Top 20 increased positions"
            note={agg?.funds ? `across ${agg.funds} managers${quarter}` : "by value bought"}
            rows={topIncreased}
            columns={INCREASED_COLUMNS}
            state={aggState}
          />
          <TopTable
            title="Top 20 most owned"
            note={agg?.funds ? `across ${agg.funds} managers${quarter}` : "by value held"}
            rows={topOwned}
            columns={OWNED_COLUMNS}
            state={aggState}
          />
          <ShareDonut
            title="Top 20 increased positions"
            centerSub="by dollars added"
            sliceValue={sliceAdded}
            empty="No buying to show"
            rows={topIncreased}
            note={agg?.funds ? `top 20 increased${quarter}` : "of the top 20 increased"}
            state={aggState}
          />
          <ShareDonut
            title="Top 20 most owned positions"
            centerSub="by value held"
            sliceValue={sliceHeld}
            empty="Nothing held to show"
            rows={topOwned}
            note={agg?.funds ? `top 20 most owned${quarter}` : "of the top 20 most owned"}
            state={aggState}
          />
        </div>
      </div>
    </div>
  );
}
