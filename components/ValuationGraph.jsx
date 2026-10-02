"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { useTheme } from "@/components/PageChrome";
import { cssVar, hexToRgba } from "@/lib/cssVar";
import TickerInput from "@/components/TickerInput";

ChartJS.register(CategoryScale, Filler, LineElement, LinearScale, PointElement, Tooltip);

// One panel per multiple, stacked, each on its own scale. Stacked rather than
// overlaid because the three live on wildly different scales - a P/S of 4 and
// an EV/EBIT of 13 sharing one axis would flatten the cheaper one into the
// floor. Each panel also draws its own mean as a dashed line, since the
// question these charts answer is "expensive compared to its own history".
//
// The three colours are fixed rather than themed: they identify which multiple
// you are looking at, so they have to stay the same from theme to theme.
const METRICS = [
  { key: "pe", label: "Price / Earnings - P/E", color: "#3987e5" },
  { key: "evEbit", label: "EV / EBIT", color: "#9b5de5" },
  { key: "ps", label: "Price / Sales - P/S", color: "#e6772a" },
];

const RANGES = [
  ["1m", "1M"],
  ["3m", "3M"],
  ["6m", "6M"],
  ["1y", "1Y"],
  ["2y", "2Y"],
  ["3y", "3Y"],
  ["5y", "5Y"],
];

const fmtX = (t, range) =>
  new Date(t).toLocaleDateString("en-US",
    range === "1m" || range === "3m"
      ? { month: "short", day: "numeric" }
      : { month: "short", year: "2-digit" }
  );

export default function ValuationGraph({ initialSymbol = "NVDA" }) {
  const [symbol, setSymbol] = useState(initialSymbol);
  // What is typed in the box, kept apart from the symbol actually charted:
  // fetching on every keystroke would fire a request for "N", "NV", "NVD".
  const [draft, setDraft] = useState(initialSymbol);
  const [range, setRange] = useState("1y");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const theme = useTheme();

  useEffect(() => {
    // A range change mid-flight must not let the slower answer overwrite the
    // newer one - the flag is checked before every set.
    let live = true;
    setLoading(true);
    setError(null);
    fetch(`/api/valuation-history?symbol=${encodeURIComponent(symbol)}&range=${range}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Could not load that ticker");
        return json;
      })
      .then((json) => {
        if (!live) return;
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        if (!live) return;
        setError(err.message);
        setData(null);
        setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [symbol, range]);

  const panels = useMemo(() => {
    if (!data?.series?.length) return [];
    const labels = data.series.map((p) => fmtX(p.t, data.range));
    const grid = cssVar("--border") || "#e3e8ea";
    const tick = cssVar("--tick-color") || "#8a969d";

    return METRICS.map((m) => {
      const values = data.series.map((p) => p[m.key]);
      const known = values.filter((v) => typeof v === "number");
      // A mean over nothing is NaN, and a dashed line at NaN silently doesn't
      // draw - so a metric with no usable quarters says so instead.
      const mean = known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
      const latest = [...known].pop() ?? null;

      return {
        ...m,
        mean,
        latest,
        empty: !known.length,
        chart: {
          labels,
          datasets: [
            {
              label: m.label,
              data: values,
              borderColor: m.color,
              backgroundColor: hexToRgba(m.color, 0.12),
              borderWidth: 1.6,
              pointRadius: 0,
              tension: 0,
              fill: true,
              spanGaps: false,
            },
            ...(mean == null
              ? []
              : [
                  {
                    label: "Mean",
                    data: values.map(() => mean),
                    borderColor: tick,
                    borderWidth: 1,
                    borderDash: [5, 4],
                    pointRadius: 0,
                    fill: false,
                  },
                ]),
          ],
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
                  ctx.parsed.y == null ? null : `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}x`,
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
              ticks: {
                color: tick,
                font: { size: 10 },
                callback: (v) => `${v}x`,
              },
            },
          },
        },
      };
    });
    // theme is a dependency because the colours above are read out of CSS
    // variables, which change with it - the charts have to rebuild to repaint.
  }, [data, theme]);

  return (
    <div className="vg">
      <div className="vg-head">
        <TickerInput
          value={draft}
          index={0}
          onChange={setDraft}
          onPick={(s) => {
            setDraft(s);
            setSymbol(s);
          }}
          label="Ticker"
        />
        <div className="vg-ranges" role="group" aria-label="Range">
          {RANGES.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={range === key ? "vg-range active" : "vg-range"}
              aria-pressed={range === key}
              onClick={() => setRange(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="vg-note vg-error">{error}</p>}
      {loading && !error && <p className="vg-note">Loading {symbol}…</p>}

      {!loading &&
        !error &&
        panels.map((p) => (
          <section className="vg-panel" key={p.key}>
            <header className="vg-panel-head">
              <span className="vg-swatch" style={{ background: p.color }} aria-hidden="true" />
              <strong>{symbol}</strong>
              <span>{p.label}</span>
              {p.latest != null && <b style={{ color: p.color }}>{p.latest.toFixed(1)}x</b>}
              {p.mean != null && <span className="vg-mean">Mean {p.mean.toFixed(1)}x</span>}
            </header>
            <div className="vg-canvas">
              {p.empty ? (
                <p className="vg-note">
                  No {p.label} for this period — the denominator was negative or unfiled.
                </p>
              ) : (
                <Line data={p.chart} options={p.options} />
              )}
            </div>
          </section>
        ))}
    </div>
  );
}
