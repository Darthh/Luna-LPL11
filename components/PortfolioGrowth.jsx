"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { useTheme } from "@/components/PageChrome";
import { cssVar } from "@/lib/cssVar";
import { hideBrokenLogo, logoUrl } from "@/lib/companyLogo";
import { dragMeasurePlugin } from "@/lib/dragMeasure";
import { priceMarkersPlugin } from "@/lib/priceMarkers";
import {
  BENCHMARK_LINE_COLOR,
  PORTFOLIO_FILL_TOP,
  PORTFOLIO_LINE_COLOR,
  holdingColors,
} from "@/lib/portfolioColors";
import { BENCHMARK, fitPercentAxis, toSeries } from "@/lib/whatIf";
import { money, pct } from "@/lib/num";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  dragMeasurePlugin,
  priceMarkersPlugin
);

// Your holdings' growth over time: the portfolio as one line, weighted by what
// each position is actually worth, with every holding plotted beside it so you
// can see which one the shape belongs to. Percent off a shared zero, because
// $400 of one stock and $40,000 of another only share an axis that way.
//
// The ranges are the windows /portfolio-comparison offers plus the two short
// ones a holder checks most - 1M and YTD. YTD has no upstream preset, so it is
// a 1Y fetch trimmed to January 1st: one request either way, and it cannot
// drift from the 1Y line the way a separate feed would.
export const RANGES = [
  { key: "1m", label: "1M", fetch: "1m" },
  { key: "6m", label: "6M", fetch: "6m" },
  { key: "ytd", label: "YTD", fetch: "1y" },
  { key: "1y", label: "1Y", fetch: "1y" },
  { key: "2y", label: "2Y", fetch: "2y" },
  { key: "3y", label: "3Y", fetch: "3y" },
  { key: "5y", label: "5Y", fetch: "5y" },
];

// How each range reads in the headline, matching the stock page's phrasing so
// the two say the same thing about the same window.
const RANGE_WORDING = {
  "1m": "past month",
  "6m": "past 6 months",
  ytd: "so far this year",
  "1y": "past year",
  "2y": "past 2 years",
  "3y": "past 3 years",
  "5y": "past 5 years",
};

// The headline gain, signed, in dollars - "+$12,481.20" reads as a number you
// made rather than a total you hold.
const signedMoney = (v) =>
  `${v >= 0 ? "+" : "-"}${Math.abs(v).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  })}`;

const tickLabel = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });

const dayLabel = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

// Indexes each holding off its own first close in the window, then combines
// them at today's weights. Only dates every holding priced are plotted, so a
// name that listed inside the window trims the chart rather than starting the
// portfolio at a price it never traded at.
function build(seriesBySymbol, holdings, cutoff, colors) {
  const priced = holdings.filter((h) => seriesBySymbol.get(h.symbol)?.size);
  if (!priced.length) return null;

  // The benchmark is plotted when it priced the same window, and simply left
  // off when it didn't - it is the comparison, not a requirement.
  const benchmark = seriesBySymbol.get(BENCHMARK)?.size ? BENCHMARK : null;
  const needed = [...priced.map((h) => h.symbol), ...(benchmark ? [benchmark] : [])];

  const dates = [...seriesBySymbol.get(priced[0].symbol).keys()]
    .sort()
    .filter((d) => (!cutoff || d >= cutoff) && needed.every((sym) => seriesBySymbol.get(sym).has(d)));
  if (dates.length < 2) return null;

  const first = dates[0];
  const last = dates[dates.length - 1];
  const growth = (symbol, d) =>
    seriesBySymbol.get(symbol).get(d) / seriesBySymbol.get(symbol).get(first);

  // Weighted by what each position is worth today, which is what the wheel
  // above is drawn from too - so the two pictures agree by construction.
  const total = priced.reduce((a, h) => a + h.value, 0);
  const basis = dates.map((d) =>
    priced.reduce((a, h) => a + (h.value / total) * growth(h.symbol, d), 0)
  );

  const portfolioPct = (basis[basis.length - 1] - 1) * 100;
  // What the same holdings were worth at the start of this window, which is
  // what today's value has to be measured against to report a gain in dollars.
  const startValue = total / basis[basis.length - 1];
  const benchmarkPct = benchmark ? (growth(benchmark, last) - 1) * 100 : null;

  return {
    dates,
    portfolioPct,
    benchmarkPct,
    startValue,
    endValue: total,
    changeAbs: total - startValue,
    // The portfolio line and the benchmark are always drawn; the per-holding
    // lines are what the toggle switches on and off, so they are kept apart
    // rather than filtered out of one list by index.
    base: [
      {
        key: "portfolio",
        label: "Your portfolio",
        note: `${priced.length} holding${priced.length === 1 ? "" : "s"}`,
        series: basis.map((v) => (v - 1) * 100),
        color: PORTFOLIO_LINE_COLOR,
        value: total,
        changePct: portfolioPct,
        width: 2.6,
      },
      ...(benchmark
        ? [
            {
              key: benchmark,
              label: "S&P 500",
              note: benchmark,
              symbol: benchmark,
              series: dates.map((d) => (growth(benchmark, d) - 1) * 100),
              color: BENCHMARK_LINE_COLOR,
              changePct: benchmarkPct,
              width: 1.8,
            },
          ]
        : []),
    ],
    holdings: priced.map((h) => ({
      key: h.symbol,
      label: h.symbol,
      symbol: h.symbol,
      note: `${((h.value / total) * 100).toFixed(1)}% · ${money(h.value)}`,
      series: dates.map((d) => (growth(h.symbol, d) - 1) * 100),
      color: colors[h.symbol],
      value: h.value,
      changePct: (growth(h.symbol, last) - 1) * 100,
      width: 1.2,
    })),
  };
}

export default function PortfolioGrowth({ holdings }) {
  const theme = useTheme();
  const [range, setRange] = useState("1y");
  // Off by default: the portfolio against the market is the question the panel
  // opens with, and a dozen holding lines behind it drown that out.
  const [showHoldings, setShowHoldings] = useState(false);
  // The result carries the request it answers, so a result that doesn't match
  // what's being asked for now is what "loading" means - no separate flag to
  // fall out of step with the fetch.
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Sorted so reordering the list cannot look like a different set of tickers
  // and refetch every series.
  const symbolKey = useMemo(() => [...holdings.map((h) => h.symbol)].sort().join(","), [holdings]);
  // Weights move with price, but the shape of the fetch does not, so the
  // holdings' values are read at draw time rather than being a fetch input.
  const valueKey = useMemo(
    () => holdings.map((h) => `${h.symbol}:${h.value.toFixed(2)}`).join(","),
    [holdings]
  );

  const colors = useMemo(() => holdingColors(holdings), [holdings]);

  const requestKey = `${symbolKey}|${range}`;

  // The fetch lives in the effect rather than in a callback the effect calls,
  // so a state update can never happen on the render pass itself. Same shape
  // as the quote and meta loads on the watchlist page above.
  useEffect(() => {
    if (!symbolKey) return;
    // The benchmark rides along with the holdings; a portfolio that already
    // holds SPY doesn't fetch it twice.
    const symbols = [...new Set([...symbolKey.split(","), BENCHMARK])];
    const cfg = RANGES.find((r) => r.key === range);
    const key = `${symbolKey}|${range}`;
    let cancelled = false;

    Promise.all(
      symbols.map(async (symbol) => {
        const res = await fetch(
          `/api/stock-chart?symbol=${encodeURIComponent(symbol)}&range=${cfg.fetch}`
        );
        const json = await res.json();
        if (!res.ok) throw new Error(`${symbol}: ${json?.error ?? "no price history"}`);
        return [symbol, toSeries(json.points)];
      })
    )
      .then((entries) => {
        if (cancelled) return;
        setResult({ series: new Map(entries), cfg, key });
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setResult(null);
      });

    return () => {
      cancelled = true;
    };
  }, [symbolKey, range]);

  const busy = result?.key !== requestKey && !error;

  const built = useMemo(() => {
    if (!result || result.key !== requestKey) return null;
    const cutoff = result.cfg.key === "ytd" ? `${new Date().getUTCFullYear()}-01-01` : null;
    return build(result.series, holdings, cutoff, colors);
    // valueKey stands in for the holdings' weights; `holdings` itself is a new
    // array on every render of the page above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, requestKey, valueKey, colors]);

  // What is actually drawn: the portfolio and the benchmark always, the
  // individual holdings only when asked for.
  const lines = useMemo(
    () => (built ? [...built.base, ...(showHoldings ? built.holdings : [])] : []),
    [built, showHoldings]
  );

  const chart = useMemo(() => {
    if (!built) return null;
    const soft = cssVar("--text-soft") || "#8b949e";
    const axis = fitPercentAxis(lines.map((l) => l.series));
    return {
      data: {
        labels: built.dates,
        datasets: lines.map((l, i) => ({
          label: l.label,
          data: l.series,
          borderColor: l.color,
          // The portfolio is the line the panel is about; the holdings behind
          // it are context, so they are drawn thinner.
          borderWidth: l.width,
          pointRadius: 0,
          pointHoverRadius: 3,
          tension: 0.1,
          // Only the portfolio is filled. Every line here starts at zero, so
          // stacking a gradient under each of them would bury whichever sits
          // lowest - the same reason the stock page drops the fill in compare
          // mode. The fill runs from the line down to the zero baseline rather
          // than to the bottom of the panel, because zero is where the series
          // started and a fill that ran past it would shade a loss as a gain.
          fill: i === 0 ? { value: 0 } : false,
          backgroundColor:
            i === 0
              ? (ctx) => {
                  const { chartArea, ctx: c } = ctx.chart;
                  if (!chartArea) return "transparent";
                  // The gradient runs the height of the plot area, not from
                  // the line down to zero: anchoring it at the baseline puts
                  // the whole fade below a series that sits well above zero,
                  // leaving the fill almost invisible. Spanning the panel is
                  // what the stock page does, and it keeps the top of the
                  // band under the line whatever the axis is scaled to.
                  const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                  g.addColorStop(0, PORTFOLIO_FILL_TOP);
                  g.addColorStop(1, "rgba(24,169,153,0)");
                  return g;
                }
              : undefined,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          // The table below is the legend: it carries the swatches and the
          // returns a legend has nowhere to put.
          legend: { display: false },
          // The window's high and low called out on the portfolio line, and
          // its latest value tagged against the axis - the same marks the
          // stock page draws. Percent here rather than dollars, because that
          // is what this axis carries.
          priceMarkers: {
            enabled: true,
            datasetIndex: 0,
            extremes: true,
            last: true,
            format: (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`,
            lastColor: PORTFOLIO_LINE_COLOR,
          },
          // Drag across the chart to measure between two dates, same as every
          // other chart on the site. Every line here is indexed, so the
          // readouts compound rather than subtracting.
          dragMeasure: {
            series: lines.map((l, i) => ({
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
              label: (c) => `${c.dataset.label}: ${pct(c.parsed.y)}`,
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
              // Zero is the line every series started from, so it reads
              // heavier than the rest of the grid.
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
  }, [built, lines, theme]);

  return (
    <section className="stock-card wl-growth-card">
      <div className="wl-card-head">
        <div>
          <h2 className="stock-card-title">Growth over time</h2>
          <p className="wl-card-sub">
            Your portfolio at today&rsquo;s weights, against the S&amp;P 500.
          </p>
        </div>
        <div className="wl-chart-controls">
          <button
            type="button"
            className={`wl-toggle${showHoldings ? " active" : ""}`}
            onClick={() => setShowHoldings((v) => !v)}
            aria-pressed={showHoldings}
          >
            <span className="wl-toggle-track" aria-hidden="true">
              <span className="wl-toggle-knob" />
            </span>
            Show all holdings
          </button>
          <div className="wl-ranges" role="group" aria-label="Chart range">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              className={`wl-range${range === r.key ? " active" : ""}`}
              onClick={() => setRange(r.key)}
              aria-pressed={range === r.key}
            >
              {r.label}
            </button>
          ))}
          </div>
        </div>
      </div>

      {error ? (
        <div className="stock-chart-empty">{error}</div>
      ) : !chart ? (
        <div className="stock-chart-empty">
          {busy ? "Loading prices…" : "Not enough price history to chart."}
        </div>
      ) : (
        <>
          {/* What the portfolio did over the window the tabs are set to, in
              dollars and percent - the headline re-reads on every range
              change, the same way the stock page's does. */}
          <div className="wl-headline">
            <span className="wl-headline-value">{money(built.endValue)}</span>
            <span className={`wl-headline-change ${built.changeAbs >= 0 ? "up" : "down"}`}>
              {signedMoney(built.changeAbs)} ({pct(built.portfolioPct)})
            </span>
            <span className="wl-headline-range">{RANGE_WORDING[range]}</span>
          </div>

          {built.benchmarkPct != null && (
            // The one number the panel exists to answer: ahead of the market
            // over this window, or behind it, and by how much.
            <div className="wl-versus">
              <div className="wl-versus-side">
                <span className="wl-versus-label">
                  <span className="wl-growth-swatch" style={{ background: PORTFOLIO_LINE_COLOR }} />
                  Your portfolio
                </span>
                <span className={`wl-versus-pct ${built.portfolioPct >= 0 ? "up" : "down"}`}>
                  {pct(built.portfolioPct)}
                </span>
              </div>
              <div className="wl-versus-side">
                <span className="wl-versus-label">
                  <span className="wl-growth-swatch" style={{ background: BENCHMARK_LINE_COLOR }} />
                  S&amp;P 500
                </span>
                <span className={`wl-versus-pct ${built.benchmarkPct >= 0 ? "up" : "down"}`}>
                  {pct(built.benchmarkPct)}
                </span>
              </div>
              <div className="wl-versus-gap">
                <span className="wl-versus-label">Difference</span>
                <span
                  className={`wl-versus-pct ${
                    built.portfolioPct - built.benchmarkPct >= 0 ? "up" : "down"
                  }`}
                >
                  {built.portfolioPct - built.benchmarkPct >= 0 ? "Ahead by " : "Behind by "}
                  {Math.abs(built.portfolioPct - built.benchmarkPct).toFixed(2)}%
                </span>
              </div>
            </div>
          )}
          <div className="wl-growth-chart">
            <Line data={chart.data} options={chart.options} />
          </div>
          <table className="wl-growth-table">
            <thead>
              <tr>
                <th>Holding</th>
                <th className="num">Value</th>
                <th className="num">Change</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.key} className={i === 0 ? "wl-growth-total" : ""}>
                  <td>
                    <span className="wl-growth-name">
                      <span className="wl-growth-swatch" style={{ background: l.color }} />
                      {l.symbol ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          className="wl-growth-logo"
                          src={logoUrl(l.symbol)}
                          alt=""
                          width="20"
                          height="20"
                          loading="lazy"
                          onError={hideBrokenLogo}
                        />
                      ) : (
                        <span className="wl-growth-logo-blank" aria-hidden="true" />
                      )}
                      {l.symbol && l.symbol !== BENCHMARK ? (
                        <Link
                          className="wl-growth-link"
                          href={`/stock/${encodeURIComponent(l.symbol)}`}
                        >
                          {l.label}
                        </Link>
                      ) : (
                        l.label
                      )}
                      <span className="wl-growth-note">{l.note}</span>
                    </span>
                  </td>
                  <td className="num">{l.value != null ? money(l.value) : "—"}</td>
                  <td className={`num ${l.changePct >= 0 ? "up" : "down"}`}>{pct(l.changePct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
