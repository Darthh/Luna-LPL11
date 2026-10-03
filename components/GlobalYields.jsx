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
import { SERIES_COLORS } from "@/lib/portfolioColors";
import { ALL_SERIES, GLOBAL_10Y, US_CURVE } from "@/lib/yields";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip);

// Sovereign bond yields. Unlike the ETF boards this charts the level, not a
// percent change off a shared zero - a 4.7% ten-year and a 0.3% Swiss ten-year
// are directly comparable numbers already, and re-basing them to zero would
// throw away the one thing the reader came for.

const RANGES = [
  { key: "1y", label: "1Y" },
  { key: "3y", label: "3Y" },
  { key: "5y", label: "5Y" },
  { key: "10y", label: "10Y" },
  { key: "max", label: "MAX" },
];

const GROUPS = [
  {
    label: "United States (daily)",
    rows: US_CURVE.map((r) => ({ key: r.key, label: `United States ${r.tenor}` })),
  },
  {
    label: "Global 10Y (monthly)",
    rows: GLOBAL_10Y.map((r) => ({ key: r.key, label: `${r.country} 10Y` })),
  },
];

const DEFAULT = ["US2Y", "US5Y", "US10Y"];

const dayLabel = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

const tickLabel = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });

const colorOf = (() => {
  const map = Object.fromEntries(
    ALL_SERIES.map((s, i) => [s.key, SERIES_COLORS[i % SERIES_COLORS.length]])
  );
  return (key) => map[key];
})();

export default function GlobalYields() {
  const theme = useTheme();
  const [range, setRange] = useState("3y");
  const [picked, setPicked] = useState(() => new Set(DEFAULT));
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const keyList = useMemo(() => [...picked].sort().join(","), [picked]);
  const requestKey = `${keyList}|${range}`;

  useEffect(() => {
    if (!keyList) return;
    let cancelled = false;
    fetch(`/api/yields?range=${range}&keys=${encodeURIComponent(keyList)}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Yield data unavailable");
        return json;
      })
      .then((json) => {
        if (cancelled) return;
        setResult({ series: json.series ?? [], key: `${keyList}|${range}` });
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
  }, [keyList, range]);

  const series = result?.key === requestKey ? result.series : null;

  // The US curve is daily and the global series monthly, so the two do not
  // share observation dates. The x axis is the union of every date any plotted
  // series has, with each line drawing null where it has no reading - chart.js
  // spans those, which is what makes a monthly line legible beside a daily one
  // instead of collapsing to nine points on its own axis.
  const built = useMemo(() => {
    if (!series?.length) return null;
    const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort();
    if (dates.length < 2) return null;
    return {
      dates,
      lines: series
        .map((s) => {
          const byDate = new Map(s.points.map((p) => [p.date, p.value]));
          return { ...s, data: dates.map((d) => byDate.get(d) ?? null) };
        })
        .sort((a, b) => b.last - a.last),
    };
  }, [series]);

  const chart = useMemo(() => {
    if (!built) return null;
    const soft = cssVar("--text-soft") || "#8b949e";
    return {
      data: {
        labels: built.dates,
        datasets: built.lines.map((l) => ({
          label: l.label,
          data: l.data,
          borderColor: colorOf(l.key),
          borderWidth: 1.6,
          pointRadius: 0,
          pointHoverRadius: 3,
          tension: 0.1,
          spanGaps: true,
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
              label: (c) => `${c.dataset.label}: ${c.parsed.y.toFixed(3)}%`,
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
            grid: { color: "rgba(139,147,163,0.12)" },
            ticks: { color: soft, maxTicksLimit: 8, callback: (v) => Number(v.toFixed(2)) === 0 ? null : `${v.toFixed(2)}%` },
          },
        },
      },
    };
    // theme isn't read directly - it's here to redraw when the palette moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built, theme]);

  const toggle = (key) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const setGroup = (rows, on) =>
    setPicked((prev) => {
      const next = new Set(prev);
      for (const r of rows) {
        if (on) next.add(r.key);
        else next.delete(r.key);
      }
      return next;
    });

  const busy = !built && !error && Boolean(keyList);

  return (
    <div className="cmp-page">
      <header className="cmp-head">
        <div>
          <h1>Global Yields</h1>
          <p>
            Government bond yields from FRED. The US curve is daily; the other countries publish a
            monthly 10-year average that runs a few months behind, so each row carries its own
            as-of date.
          </p>
        </div>
      </header>

      <div className="cmp-grid">
        <section className="cmp-list" aria-label="Yield series">
          {GROUPS.map((g) => {
            const on = g.rows.every((r) => picked.has(r.key));
            return (
              <div className="cmp-group" key={g.label}>
                <div className="cmp-group-head">
                  <span>{g.label}</span>
                  <button type="button" onClick={() => setGroup(g.rows, !on)}>
                    {on ? "None" : "All"}
                  </button>
                </div>
                {g.rows.map((r) => {
                  const checked = picked.has(r.key);
                  return (
                    <label className="cmp-row" key={r.key}>
                      <input type="checkbox" checked={checked} onChange={() => toggle(r.key)} />
                      <span
                        className="cmp-swatch"
                        style={{ background: checked ? colorOf(r.key) : "transparent" }}
                        aria-hidden="true"
                      />
                      <span className="cmp-name">{r.label}</span>
                    </label>
                  );
                })}
              </div>
            );
          })}
        </section>

        <section className="cmp-chart-card" aria-label="Historical yields">
          <div className="cmp-chart-head">
            <h2>Historical yields</h2>
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

          {!keyList ? (
            <div className="stock-chart-empty">Tick a row to chart it.</div>
          ) : error ? (
            <div className="stock-chart-empty">{error}</div>
          ) : busy ? (
            <div className="stock-chart-empty">Loading yields…</div>
          ) : (
            <>
              <div className="cmp-chart">
                <Line data={chart.data} options={chart.options} />
              </div>
              {/* Ranked by level, each with the date its latest reading is
                  from - the whole point of the as-of column is that these are
                  not all the same day. */}
              <ol className="cmp-rank">
                {built.lines.map((l) => (
                  <li key={l.key}>
                    <span
                      className="cmp-swatch"
                      style={{ background: colorOf(l.key) }}
                      aria-hidden="true"
                    />
                    <span className="cmp-name">{l.label}</span>
                    <span className="cmp-ticker">{dayLabel(l.asOf)}</span>
                    <span>{l.last.toFixed(3)}%</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
