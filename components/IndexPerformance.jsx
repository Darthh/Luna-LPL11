"use client";

import { useEffect, useMemo, useState } from "react";
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
import { cssVar } from "@/lib/cssVar";
import { fitPercentAxis, toSeries } from "@/lib/whatIf";
import { HEADLINE_INDEXES } from "@/lib/overviewPanels";
import { pct } from "@/lib/num";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip);

// The three headline US indices off a shared zero - the chart at the middle of
// the home overview. Fixed to those three rather than configurable: this is
// the summary, and /country-etfs and /us-sectors are where a reader goes to
// pick their own lines.

const RANGES = [
  { key: "1m", label: "1M", fetch: "1m" },
  { key: "3m", label: "3M", fetch: "3m" },
  { key: "6m", label: "6M", fetch: "6m" },
  { key: "ytd", label: "YTD", fetch: "1y" },
  { key: "1y", label: "1Y", fetch: "1y" },
  { key: "3y", label: "3Y", fetch: "3y" },
  { key: "5y", label: "5Y", fetch: "5y" },
];

// One colour each, held constant across ranges so a line means the same index
// whichever tab is on.
const COLORS = { SPY: "#4f6df5", QQQ: "#9b59f6", DIA: "#f5a623" };

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

export default function IndexPerformance() {
  const theme = useTheme();
  const [range, setRange] = useState("1y");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const cfg = RANGES.find((r) => r.key === range);
    let cancelled = false;

    Promise.all(
      HEADLINE_INDEXES.map(async ({ symbol }) => {
        const res = await fetch(`/api/stock-chart?symbol=${symbol}&range=${cfg.fetch}`);
        const json = await res.json();
        if (!res.ok) throw new Error(`${symbol}: ${json?.error ?? "no price history"}`);
        return [symbol, toSeries(json.points)];
      })
    )
      .then((entries) => {
        if (cancelled) return;
        setResult({ series: new Map(entries), cfg, key: range });
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
  }, [range]);

  const built = useMemo(() => {
    if (!result || result.key !== range) return null;
    const cutoff = result.cfg.key === "ytd" ? `${new Date().getUTCFullYear()}-01-01` : null;
    const { series } = result;
    // Only dates all three priced, so the lines share a starting point rather
    // than each indexing off a different day.
    const dates = [...(series.get("SPY")?.keys() ?? [])]
      .sort()
      .filter(
        (d) =>
          (!cutoff || d >= cutoff) && HEADLINE_INDEXES.every(({ symbol }) => series.get(symbol)?.has(d))
      );
    if (dates.length < 2) return null;
    const first = dates[0];
    return {
      dates,
      lines: HEADLINE_INDEXES.map(({ symbol, label }) => {
        const s = series.get(symbol);
        const values = dates.map((d) => (s.get(d) / s.get(first) - 1) * 100);
        return { symbol, label, values, changePct: values[values.length - 1] };
      }),
    };
  }, [result, range]);

  const chart = useMemo(() => {
    if (!built) return null;
    const soft = cssVar("--text-soft") || "#8b949e";
    const axis = fitPercentAxis(built.lines.map((l) => l.values));
    return {
      data: {
        labels: built.dates,
        datasets: built.lines.map((l) => ({
          label: l.label,
          data: l.values,
          borderColor: COLORS[l.symbol],
          borderWidth: 1.8,
          pointRadius: 0,
          pointHoverRadius: 3,
          tension: 0.1,
          fill: false,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
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
              maxTicksLimit: 6,
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
              // Zero is where all three started, so it reads heavier.
              color: (ctx) =>
                ctx.tick.value === 0 ? "rgba(139,147,163,0.45)" : "rgba(139,147,163,0.12)",
            },
            ticks: {
              color: soft,
              includeBounds: false,
              stepSize: axis.step,
              maxTicksLimit: 7,
              callback: (v) => `${v.toFixed(axis.decimals)}%`,
            },
          },
        },
      },
    };
    // theme isn't read directly - it's here to redraw when the palette moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built, theme]);

  return (
    <section className="ov-panel ov-chart-panel" aria-label="Index performance">
      <header className="ov-panel-head">
        <h2>Normalized performance</h2>
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
      </header>

      {error ? (
        <div className="stock-chart-empty">{error}</div>
      ) : !chart ? (
        <div className="stock-chart-empty">Loading prices…</div>
      ) : (
        <>
          <div className="ov-chart">
            <Line data={chart.data} options={chart.options} />
          </div>
          <ul className="ov-legend">
            {built.lines.map((l) => (
              <li key={l.symbol}>
                <span
                  className="cmp-swatch"
                  style={{ background: COLORS[l.symbol] }}
                  aria-hidden="true"
                />
                <span className="ov-name">{l.label}</span>
                <span className={l.changePct >= 0 ? "up" : "down"}>{pct(l.changePct)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
