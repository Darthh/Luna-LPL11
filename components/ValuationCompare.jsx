"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CategoryScale,
  Chart as ChartJS,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { useTheme } from "@/components/PageChrome";
import { cssVar } from "@/lib/cssVar";
import TickerInput from "@/components/TickerInput";

ChartJS.register(CategoryScale, LineElement, LinearScale, PointElement, Tooltip);

// Three companies against each other on three measures. One colour per
// company, held across all three panels - that consistency is the whole point
// of a comparison chart, so the colours belong to the ticker, not the metric.
const SERIES_COLORS = ["#3987e5", "#9b5de5", "#e6772a"];
const MAX = 3;

const RANGES = [
  ["1m", "1M"],
  ["3m", "3M"],
  ["6m", "6M"],
  ["1y", "1Y"],
  ["2y", "2Y"],
  ["3y", "3Y"],
  ["5y", "5Y"],
];

// Total return is rebased to the first close in view so three companies at
// three different share prices start from the same place - otherwise the
// chart compares price tags rather than performance.
const rebase = (series) => {
  const base = series.find((p) => typeof p.close === "number")?.close;
  return base ? series.map((p) => ((p.close - base) / base) * 100) : series.map(() => null);
};

// Revenue growth per point: the TTM revenue on this date against the TTM
// revenue a year earlier. Both come off the filings the API already resolved
// per point, so the comparison is between two actual twelve-month figures -
// deriving it from the price and P/S instead meant dividing two ratios across
// a filing step, which spiked to several hundred percent on the step day.
//
// Where only annual figures exist, consecutive steps sit roughly a year apart,
// and the exact day the lookback crosses one produces a single point comparing
// the new year against the one before last. That is an artifact of the
// sampling, not a quarter the company had, so growth is computed between the
// distinct revenue levels themselves and held flat across each level - which
// is also the true shape: a TTM figure does not change between filings.
const YEAR_MS = 365 * 86400 * 1000;

const revenueGrowth = (series) => {
  // The distinct revenue levels in view, each with the date it took effect.
  const steps = [];
  for (const p of series) {
    if (!p.revenue) continue;
    if (!steps.length || steps[steps.length - 1].revenue !== p.revenue) {
      steps.push({ t: p.t, revenue: p.revenue });
    }
  }

  // Each level against the level in effect a year before it started.
  const growthAt = new Map();
  for (const step of steps) {
    let prev = null;
    for (const s of steps) if (s.t <= step.t - YEAR_MS) prev = s;
    if (prev && prev.revenue > 0) {
      growthAt.set(step.revenue, ((step.revenue - prev.revenue) / prev.revenue) * 100);
    }
  }

  return series.map((p) => (p.revenue ? growthAt.get(p.revenue) ?? null : null));
};

const PANELS = [
  { key: "return", label: "Total Return", unit: "%", pick: rebase },
  { key: "revenue", label: "Total Revenues, CAGR (1Y TTM)", unit: "%", pick: revenueGrowth },
  { key: "pe", label: "Price / Earnings - P/E", unit: "x", pick: (s) => s.map((p) => p.pe) },
];

const fmtX = (t, range) =>
  new Date(t).toLocaleDateString("en-US",
    range === "1m" || range === "3m"
      ? { month: "short", day: "numeric" }
      : { month: "short", year: "2-digit" }
  );

export default function ValuationCompare({ initialSymbols = ["NVDA", "GOOGL", "MSFT"] }) {
  const [symbols, setSymbols] = useState(initialSymbols.slice(0, MAX));
  const [draft, setDraft] = useState("");
  const [range, setRange] = useState("3y");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const theme = useTheme();

  const key = symbols.join(",");
  useEffect(() => {
    if (!key) {
      setData(null);
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    fetch(`/api/valuation-compare?symbols=${encodeURIComponent(key)}&range=${range}`)
      .then((r) => r.json())
      .then((json) => {
        if (!live) return;
        setData(json);
        setLoading(false);
      })
      .catch(() => {
        if (!live) return;
        setData(null);
        setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [key, range]);

  const panels = useMemo(() => {
    const good = (data?.results ?? []).filter((r) => r.series?.length);
    if (!good.length) return [];

    // The three companies rarely have identical trading days - a foreign
    // listing has its own holidays. The longest series supplies the axis and
    // the others are aligned onto it by date, so a missing day is a gap in one
    // line rather than a shift of every point after it.
    const spine = good.reduce((a, b) => (b.series.length > a.series.length ? b : a)).series;
    const labels = spine.map((p) => fmtX(p.t, data.range));
    const grid = cssVar("--border") || "#e3e8ea";
    const tick = cssVar("--tick-color") || "#8a969d";

    return PANELS.map((panel) => ({
      ...panel,
      legend: good.map((r, i) => {
        const values = panel.pick(r.series);
        const last = [...values].reverse().find((v) => typeof v === "number");
        return { symbol: r.symbol, color: SERIES_COLORS[i % SERIES_COLORS.length], last };
      }),
      chart: {
        labels,
        datasets: good.map((r, i) => {
          const values = panel.pick(r.series);
          const byDate = new Map(r.series.map((p, j) => [p.t, values[j]]));
          return {
            label: r.symbol,
            data: spine.map((p) => byDate.get(p.t) ?? null),
            borderColor: SERIES_COLORS[i % SERIES_COLORS.length],
            borderWidth: 1.6,
            pointRadius: 0,
            tension: 0,
            fill: false,
            spanGaps: true,
          };
        }),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: cssVar("--tooltip-bg") || "#fff",
            titleColor: cssVar("--tooltip-text") || "#222",
            bodyColor: cssVar("--tooltip-text") || "#222",
            borderColor: cssVar("--tooltip-border") || grid,
            borderWidth: 1,
            callbacks: {
              label: (ctx) =>
                ctx.parsed.y == null
                  ? null
                  : `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}${panel.unit}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: tick, font: { size: 10 }, maxTicksLimit: 10, maxRotation: 0 },
          },
          y: {
            grid: { color: grid },
            ticks: { color: tick, font: { size: 10 }, callback: (v) => `${v}${panel.unit}` },
          },
        },
      },
    }));
  }, [data, theme]);

  const failed = (data?.results ?? []).filter((r) => r.error);

  const add = (symbol) => {
    const s = symbol.trim().toUpperCase();
    if (!s || symbols.includes(s) || symbols.length >= MAX) return;
    setSymbols([...symbols, s]);
    setDraft("");
  };

  return (
    <div className="vg">
      <div className="vg-head">
        <div className="vg-tickers">
          {symbols.map((s, i) => (
            <span className="vg-tag" key={s}>
              <i style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} aria-hidden="true" />
              {s}
              <button
                type="button"
                onClick={() => setSymbols(symbols.filter((x) => x !== s))}
                aria-label={`Remove ${s}`}
              >
                ×
              </button>
            </span>
          ))}
          {symbols.length < MAX && (
            <TickerInput value={draft} index={symbols.length} onChange={setDraft} onPick={add} label="Add ticker" />
          )}
        </div>
        <div className="vg-ranges" role="group" aria-label="Range">
          {RANGES.map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={range === k ? "vg-range active" : "vg-range"}
              aria-pressed={range === k}
              onClick={() => setRange(k)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {failed.map((r) => (
        <p className="vg-note vg-error" key={r.symbol}>
          {r.symbol}: {r.error}
        </p>
      ))}
      {loading && <p className="vg-note">Loading…</p>}
      {!loading && !symbols.length && <p className="vg-note">Add up to three tickers to compare.</p>}

      {!loading &&
        panels.map((p) => (
          <section className="vg-panel" key={p.key}>
            <header className="vg-panel-head">
              <span>{p.label}</span>
              {p.legend.map((l) => (
                <span className="vg-legend" key={l.symbol}>
                  <i style={{ background: l.color }} aria-hidden="true" />
                  <b>{l.symbol}</b>
                  {l.last != null && (
                    <em>
                      {l.last.toFixed(2)}
                      {p.unit}
                    </em>
                  )}
                </span>
              ))}
            </header>
            <div className="vg-canvas">
              <Line data={p.chart} options={p.options} />
            </div>
          </section>
        ))}
    </div>
  );
}
