"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { useTheme } from "@/components/PageChrome";
import { useWatchlist } from "@/components/WatchlistProvider";
import { cssVar } from "@/lib/cssVar";
import { blankBrokenLogo, hideBrokenLogo, logoUrl } from "@/lib/companyLogo";
import TickerInput from "@/components/TickerInput";
import { dragMeasurePlugin } from "@/lib/dragMeasure";
import { money, pct } from "@/lib/num";
import {
  BENCHMARK,
  BENCHMARK_COLOR,
  COMPARE_COLORS,
  DEFAULT_TICKERS,
  PORTFOLIO_COLOR,
  PRESETS,
  RANGES,
  STAKE,
  buildComparison,
  fitPercentAxis,
  toSeries,
} from "@/lib/whatIf";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, dragMeasurePlugin);

const RANGE_WORDING = {
  "6m": "past 6 months",
  "1y": "past year",
  "2y": "past 2 years",
  "3y": "past 3 years",
  "5y": "past 5 years",
  "10y": "past 10 years",
};

// "…invested 2 years ago", the same windows the tabs offer.
const RANGE_AGO = {
  "6m": "6 months ago",
  "1y": "a year ago",
  "2y": "2 years ago",
  "3y": "3 years ago",
  "5y": "5 years ago",
  "10y": "10 years ago",
};

// The comparison the page opens with. Unselecting it is allowed - the S&P 500
// is a default, not a fixture.
const DEFAULT_COMPARE = PRESETS.find((p) => p.label === "S&P 500");

// "2024-05-28" as the axis wants it: month and year, which is the granularity
// a one-to-ten-year window is read at.
const tickLabel = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });

// The hover reads one session rather than one month, so it names the day:
// "Jun 9, 2026".
const dayLabel = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

// Two empty slots under the default holding: a basket is the point of the
// page, and an empty row is the invitation to build one.
const blankRow = () => ({ symbol: "", weight: "" });
const rowsFor = (tickers) => [
  ...tickers.map((symbol) => ({ symbol, weight: "" })),
  blankRow(),
  blankRow(),
];

export default function PortfolioComparison() {
  const theme = useTheme();
  // The list you already keep, as a basket. A watchlist lives on an account,
  // so signed-out visitors are told that rather than shown a dead button.
  const { items: watchlist, signedIn, loading: watchlistLoading } = useWatchlist();
  const [rows, setRows] = useState(() => rowsFor(DEFAULT_TICKERS));
  const [range, setRange] = useState("1y");
  // Presets are plotted beside the basket rather than replacing it.
  const [compares, setCompares] = useState(() => [
    { label: DEFAULT_COMPARE.label, note: DEFAULT_COMPARE.note, tickers: DEFAULT_COMPARE.tickers },
  ]);
  const [customTicker, setCustomTicker] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const setRow = (i, patch) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  // A blank weight column means "split it evenly", which is what most people
  // mean by a basket - weights are only there for when you want it uneven.
  const holdings = useCallback(() => {
    const picked = rows
      .map((r) => ({ symbol: r.symbol.trim().toUpperCase(), weight: Number(r.weight) }))
      .filter((r) => r.symbol);
    const anyWeights = picked.some((r) => r.weight > 0);
    return picked.map((r) => ({ ...r, weight: anyWeights ? r.weight : 1 }));
  }, [rows]);

  const run = useCallback(
    async (e) => {
      e?.preventDefault();
      const picks = holdings().filter((h) => h.weight > 0);
      if (!picks.length) {
        setError("Add at least one ticker.");
        setResult(null);
        return;
      }
      setBusy(true);
      setError(null);
      const symbols = [
        ...new Set([
          ...picks.map((p) => p.symbol),
          BENCHMARK,
          ...compares.flatMap((c) => c.tickers),
        ]),
      ];
      try {
        const series = new Map(
          await Promise.all(
            symbols.map(async (symbol) => {
              const res = await fetch(
                `/api/stock-chart?symbol=${encodeURIComponent(symbol)}&range=${range}`
              );
              const json = await res.json();
              if (!res.ok) throw new Error(`${symbol}: ${json?.error ?? "no price history"}`);
              return [symbol, toSeries(json.points)];
            })
          )
        );
        const built = buildComparison(series, picks, compares);
        if (!built) throw new Error("Not enough overlapping price history to compare.");
        setResult(built);
      } catch (err) {
        setError(err.message);
        setResult(null);
      } finally {
        setBusy(false);
      }
    },
    [holdings, range, compares]
  );

  // The chart keeps up with the form: a range tab, a preset and a typed
  // ticker all redraw on their own. Typing is given a moment to finish first,
  // so "NV" doesn't get priced on the way to "NVDA". The button stays for
  // anyone who wants to force it.
  useEffect(() => {
    const timer = setTimeout(run, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, compares, rows]);

  // A second click takes the preset back off the chart.
  function toggleCompare(preset) {
    setCompares((c) =>
      c.some((x) => x.label === preset.label)
        ? c.filter((x) => x.label !== preset.label)
        : [...c, { label: preset.label, note: preset.note, tickers: preset.tickers }]
    );
  }

  // One typed ticker, compared against as its own line.
  function addCustomCompare(e) {
    e?.preventDefault();
    const symbol = customTicker.trim().toUpperCase();
    if (!symbol) return;
    setCustomTicker("");
    setCompares((c) =>
      c.some((x) => x.label === symbol)
        ? c
        : [...c, { label: symbol, note: "single stock", tickers: [symbol], custom: true }]
    );
  }

  const lines = result?.lines ?? [];
  const colorOf = (i) =>
    i === 0
      ? PORTFOLIO_COLOR
      : i === 1
        ? BENCHMARK_COLOR
        : COMPARE_COLORS[(i - 2) % COMPARE_COLORS.length];

  const chart = useMemo(() => {
    if (!result) return null;
    const soft = cssVar("--text-soft") || "#8b949e";
    const axis = fitPercentAxis(result.lines.map((l) => l.series));
    return {
      data: {
        labels: result.dates,
        datasets: result.lines.map((l, i) => ({
          label: l.label,
          data: l.series,
          borderColor: colorOf(i),
          borderWidth: 1.8,
          pointRadius: 0,
          pointHoverRadius: 3,
          tension: 0.1,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          // The table below is the legend: it carries the swatches, and the
          // returns a legend has nowhere to put.
          legend: { display: false },
          // Drag across the chart to measure the move between two dates, the
          // same as on the home and stock charts. Every line here is indexed,
          // so the readouts compound rather than subtracting.
          dragMeasure: {
            series: result.lines.map((l, i) => ({
              datasetIndex: i,
              label: l.label,
              indexed: true,
            })),
          },
          tooltip: {
            backgroundColor: cssVar("--tooltip-bg") || "#161b22",
            titleColor: cssVar("--tooltip-text") || "#e6edf3",
            bodyColor: cssVar("--tooltip-text") || "#e6edf3",
            borderColor: cssVar("--tooltip-border") || cssVar("--border") || "#30363d",
            borderWidth: 1,
            callbacks: {
              title: (items) => dayLabel(items[0].label),
              label: (c) =>
                `${c.dataset.label}: ${pct(c.parsed.y)} · ${money(STAKE * (1 + c.parsed.y / 100))}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: soft,
              maxTicksLimit: 8,
              autoSkip: true,
              callback(i) {
                return tickLabel(this.getLabelForValue(i));
              },
            },
          },
          y: {
            position: "right",
            min: axis.min,
            max: axis.max,
            grid: {
              // Zero is the line every series started from, so it reads heavier
              // than the rest of the grid.
              color: (ctx) =>
                ctx.tick.value === 0 ? "rgba(139,147,163,0.45)" : "rgba(139,147,163,0.12)",
            },
            ticks: {
              color: soft,
              includeBounds: false,
              stepSize: axis.step,
              maxTicksLimit: 8,
              callback: (v) => `${v.toFixed(axis.decimals)}%`,
            },
          },
        },
      },
    };
    // theme isn't read directly - it's here to redraw when the palette moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, theme]);

  // The plotted baskets, then what each of your holdings did on its own. One
  // holding *is* the portfolio, so it isn't listed a second time.
  const tableRows = [
    ...lines.map((l, i) => ({
      key: l.key,
      name: l.label,
      note: l.note,
      color: colorOf(i),
      value: l.value,
      changePct: l.changePct,
    })),
    ...(result && result.legs.length > 1
      ? result.legs.map((leg) => ({
          key: `leg-${leg.symbol}`,
          name: leg.symbol,
          logo: leg.symbol,
          basis: leg.basis,
          note: `${leg.weight.toFixed(0)}% of the basket · ${money(leg.basis)} in`,
          color: null,
          value: leg.value,
          changePct: leg.pct,
        }))
      : []),
  ];

  return (
    <div className="whatif-wrap">
      <div className="whatif-head">
        <h1 className="whatif-title">Portfolio comparison</h1>
        <p className="whatif-sub">
          Build a {money(STAKE)} portfolio of your own choosing and compare its performance. Pick the
          stocks and ETFs, weight them however you like, or leave the weights blank for an even split,
          then see how the portfolio would have performed against the market or another investment.
        </p>
      </div>

      <div className="whatif-grid">
        <form className="whatif-side" onSubmit={run}>
          <div className="whatif-card">
            <div className="whatif-card-head">
              <h2>Your holdings</h2>
              <button
                type="button"
                className="whatif-import"
                onClick={() => setRows(rowsFor(watchlist.map((w) => w.symbol)))}
                disabled={!signedIn || watchlistLoading || !watchlist.length}
                title={
                  signedIn
                    ? watchlist.length
                      ? `Fill the slots with your ${watchlist.length} watchlist tickers`
                      : "Your watchlist is empty"
                    : "Sign in to use your watchlist"
                }
              >
                Import watchlist
              </button>
            </div>
            <div className="whatif-weight-label">
              <span>Weight %</span>
            </div>
            {rows.map((row, i) => (
              <div className="whatif-row" key={i}>
                <TickerInput
                  value={row.symbol}
                  index={i}
                  onChange={(symbol) => setRow(i, { symbol })}
                />
                <input
                  className="whatif-weight"
                  type="number"
                  min="0"
                  placeholder="even"
                  value={row.weight}
                  onChange={(e) => setRow(i, { weight: e.target.value })}
                  aria-label={`Weight ${i + 1}`}
                />
                <button
                  type="button"
                  className="whatif-drop"
                  onClick={() => setRows((r) => (r.length > 1 ? r.filter((_, j) => j !== i) : r))}
                  aria-label={`Remove holding ${i + 1}`}
                >
                  &times;
                </button>
              </div>
            ))}
            <button
              type="button"
              className="whatif-add"
              onClick={() => setRows((r) => [...r, blankRow()])}
            >
              + Add holding
            </button>

            <button type="submit" className="whatif-run" disabled={busy}>
              {busy ? "Comparing…" : "Compare portfolios"}
            </button>
            {error && <p className="whatif-error">{error}</p>}
          </div>

          <div className="whatif-card">
            <div className="whatif-card-head">
              <h2>Choose a benchmark</h2>
            </div>
            {/* Anything not on the list: type a ticker and it joins the
                chart as its own line. */}
            <div className="whatif-custom">
              <TickerInput
                value={customTicker}
                index={-1}
                label="Use a single stock as the benchmark"
                placeholder="Compare a stock…"
                onChange={setCustomTicker}
                onPick={(symbol) => {
                  setCustomTicker("");
                  setCompares((c) =>
                    c.some((x) => x.label === symbol)
                      ? c
                      : [...c, { label: symbol, note: "single stock", tickers: [symbol], custom: true }]
                  );
                }}
              />
              <button type="button" className="whatif-custom-add" onClick={addCustomCompare}>
                Add
              </button>
            </div>
            {compares.some((c) => c.custom) && (
              <div className="whatif-chips">
                {compares
                  .filter((c) => c.custom)
                  .map((c) => (
                    <button
                      type="button"
                      key={c.label}
                      className="whatif-chip"
                      onClick={() => setCompares((list) => list.filter((x) => x.label !== c.label))}
                      aria-label={`Stop comparing against ${c.label}`}
                    >
                      <span>{c.label}</span>
                      <span aria-hidden="true">&times;</span>
                    </button>
                  ))}
              </div>
            )}

            <h3 className="whatif-subhead">Presets</h3>
            <div className="whatif-presets">
              {PRESETS.map((p) => {
                const on = compares.some((c) => c.label === p.label);
                return (
                  <button
                    type="button"
                    key={p.label}
                    className={on ? "whatif-preset on" : "whatif-preset"}
                    onClick={() => toggleCompare(p)}
                    aria-pressed={on}
                  >
                    {/* A basket has no logo of its own, so the first holding
                        stands in for it. Not every symbol resolves on the CDN
                        (broad ETFs especially), so a miss drops the image and
                        the label slides over rather than holding an empty
                        square - same as the home sidebar. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="home-compare-logo"
                      src={logoUrl(p.tickers[0], 48)}
                      alt=""
                      onError={hideBrokenLogo}
                    />
                    <span>{p.label}</span>
                    <small>{on ? "on the chart" : p.note}</small>
                  </button>
                );
              })}
            </div>
          </div>
        </form>

        <div className="whatif-main">
          <div className="whatif-top">
            <div>
              {/* The answer in a sentence, above the window it was measured
                  over. */}
              {result && result.lines.length > 1 && (
                <div className="whatif-verdict">
                  {result.lines.slice(1).map((l) => {
                    const gap = result.portfolioPct - l.changePct;
                    return (
                      <p key={l.key}>
                        Your portfolio has{" "}
                        <b className={gap >= 0 ? "up" : "down"}>
                          {gap >= 0 ? "outperformed" : "underperformed"}
                        </b>{" "}
                        {l.label} by <b className={gap >= 0 ? "up" : "down"}>{pct(gap)}</b> over the{" "}
                        {RANGE_WORDING[range]}.
                      </p>
                    );
                  })}
                </div>
              )}

              {/* The same segmented bar the stock page puts over its chart. */}
              <div className="stock-ranges whatif-ranges">
                {RANGES.map((r) => (
                  <button
                    type="button"
                    key={r.key}
                    className={range === r.key ? "stock-range-btn active" : "stock-range-btn"}
                    onClick={() => setRange(r.key)}
                    disabled={busy}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* What the stake actually turned into, per line on the chart -
                the percentages above in the money they stand for. */}
            {result && (
              <div className="whatif-stake">
                <span className="whatif-stake-head">
                  {money(STAKE)} invested {RANGE_AGO[range]}
                </span>
                {result.lines.map((l, i) => (
                  <span className="whatif-stake-row" key={l.key}>
                    <i className="whatif-swatch" style={{ background: colorOf(i) }} />
                    <span className="whatif-stake-name">{l.label}</span>
                    <b>{money(l.value)}</b>
                    <em className={l.changePct >= 0 ? "up" : "down"}>{pct(l.changePct)}</em>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="whatif-chart">
            {chart ? (
              <Line data={chart.data} options={chart.options} />
            ) : (
              <div className="whatif-empty">
                <p>{busy ? "Pricing the basket…" : "Pick some tickers and run it."}</p>
              </div>
            )}
          </div>

          {result && (
            <>
              <div className="whatif-caption">
                <span>
                  Indexed to the start of the range · % change {RANGE_WORDING[range]} on{" "}
                  {money(STAKE)} · drag the chart to measure
                </span>
                <span className="whatif-span">
                  {result.dates[0]} – {result.dates[result.dates.length - 1]}
                </span>
              </div>
              <div className="whatif-table">
                <div className="whatif-trow head">
                  <span>Holding</span>
                  <span>Total value</span>
                  <span>Change</span>
                  <span>% Change</span>
                </div>
                {tableRows.map((row) => (
                  <div className="whatif-trow" key={row.key}>
                    <span className="whatif-tid">
                      <i
                        className="whatif-swatch"
                        style={{ background: row.color ?? "transparent" }}
                      />
                      {row.logo && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          className="whatif-tlogo"
                          src={logoUrl(row.logo, 48)}
                          alt=""
                          onError={blankBrokenLogo}
                        />
                      )}
                      <span className="whatif-tnames">
                        <b>{row.name}</b>
                        <em>{row.note}</em>
                      </span>
                    </span>
                    <span className="whatif-tvalue">{money(row.value)}</span>
                    <span className={row.value - (row.basis ?? STAKE) >= 0 ? "up" : "down"}>
                      {row.value - (row.basis ?? STAKE) >= 0 ? "+" : "−"}
                      {money(Math.abs(row.value - (row.basis ?? STAKE)))}
                    </span>
                    <span className={row.changePct >= 0 ? "up" : "down"}>
                      {row.changePct >= 0 ? "↗" : "↘"} {Math.abs(row.changePct).toFixed(2)}%
                    </span>
                  </div>
                ))}
              </div>
              {result.limitedBy.length > 0 && (
                <p className="whatif-warn">
                  {result.limitedBy.join(" and ")} only {result.limitedBy.length > 1 ? "have" : "has"}{" "}
                  prices back to {result.dates[0]}, so every line is measured from there rather than
                  the full {RANGE_WORDING[range].replace("past ", "")}.
                </p>
              )}
              <p className="whatif-note">
                Prices only - no dividends, no rebalancing, no fees. The window starts where every
                line on the chart has a price.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
