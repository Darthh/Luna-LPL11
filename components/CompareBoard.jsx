"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import { fitPercentAxis, toSeries } from "@/lib/whatIf";
import { pct } from "@/lib/num";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip);

// A board of ETFs indexed off a shared zero: tick the ones you want, read the
// spread between them. Country ETFs and US sectors are the same picture over
// different lists, so they are one component taking a different `groups` prop
// rather than two pages that would drift apart.
//
// Percent rather than price, because a $770 SPY and a $37 EWZ only share an
// axis when both start at zero.

export const RANGES = [
  { key: "1m", label: "1M", fetch: "1m" },
  { key: "3m", label: "3M", fetch: "3m" },
  { key: "6m", label: "6M", fetch: "6m" },
  { key: "ytd", label: "YTD", fetch: "1y" },
  { key: "1y", label: "1Y", fetch: "1y" },
  { key: "3y", label: "3Y", fetch: "3y" },
  { key: "5y", label: "5Y", fetch: "5y" },
];

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

// Only dates every plotted symbol priced are drawn: a fund that listed inside
// the window would otherwise start its line at a price it never traded at.
function build(seriesBySymbol, picked, cutoff, colorOf) {
  const priced = picked.filter((p) => seriesBySymbol.get(p.symbol)?.size);
  if (!priced.length) return null;

  const dates = [...seriesBySymbol.get(priced[0].symbol).keys()]
    .sort()
    .filter(
      (d) => (!cutoff || d >= cutoff) && priced.every((p) => seriesBySymbol.get(p.symbol).has(d))
    );
  if (dates.length < 2) return null;

  const first = dates[0];
  const lines = priced.map((p) => {
    const s = seriesBySymbol.get(p.symbol);
    const base = s.get(first);
    const series = dates.map((d) => (s.get(d) / base - 1) * 100);
    return { ...p, series, changePct: series[series.length - 1], color: colorOf(p.symbol) };
  });
  // Ranked, so the list under the chart reads as a leaderboard.
  return { dates, lines: lines.sort((a, b) => b.changePct - a.changePct) };
}

// `footer` is an optional slot under the chart, taking the range the tabs are
// set to - the currencies board hangs its cross-rate matrix there so the two
// always describe the same window.
export default function CompareBoard({ title, subtitle, groups, defaultPicked, footer, showHeader = true }) {
  const theme = useTheme();
  const [range, setRange] = useState("1y");
  const [picked, setPicked] = useState(() => new Set(defaultPicked));
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const all = useMemo(() => groups.flatMap((g) => g.rows), [groups]);
  // A stable colour per symbol, taken from its position in the full list, so
  // ticking a row on and off never re-hues the lines already drawn.
  const colorOf = useMemo(() => {
    const map = Object.fromEntries(
      all.map((r, i) => [r.symbol, SERIES_COLORS[i % SERIES_COLORS.length]])
    );
    return (symbol) => map[symbol];
  }, [all]);

  const symbolKey = useMemo(() => [...picked].sort().join(","), [picked]);
  const requestKey = `${symbolKey}|${range}`;

  useEffect(() => {
    if (!symbolKey) return;
    const cfg = RANGES.find((r) => r.key === range);
    const key = `${symbolKey}|${range}`;
    let cancelled = false;

    Promise.all(
      symbolKey.split(",").map(async (symbol) => {
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

  const built = useMemo(() => {
    if (!result || result.key !== requestKey) return null;
    const cutoff = result.cfg.key === "ytd" ? `${new Date().getUTCFullYear()}-01-01` : null;
    return build(
      result.series,
      all.filter((r) => picked.has(r.symbol)),
      cutoff,
      colorOf
    );
  }, [result, requestKey, all, picked, colorOf]);

  const chart = useMemo(() => {
    if (!built) return null;
    const soft = cssVar("--text-soft") || "#8b949e";
    const axis = fitPercentAxis(built.lines.map((l) => l.series));
    return {
      data: {
        labels: built.dates,
        datasets: built.lines.map((l) => ({
          label: `${l.symbol} · ${l.label}`,
          data: l.series,
          borderColor: l.color,
          borderWidth: 1.6,
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
              // Zero is where every line started, so it reads heavier.
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
  }, [built, theme]);

  const toggle = (symbol) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });

  const setGroup = (rows, on) =>
    setPicked((prev) => {
      const next = new Set(prev);
      for (const r of rows) {
        if (on) next.add(r.symbol);
        else next.delete(r.symbol);
      }
      return next;
    });

  const busy = !built && !error && Boolean(symbolKey);

  return (
    <div className="cmp-page">
      {showHeader && (
        <header className="cmp-head">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </header>
      )}

      <div className="cmp-grid">
        <section className="cmp-list" aria-label="Symbols">
          {groups.map((g) => {
            const on = g.rows.every((r) => picked.has(r.symbol));
            return (
              <div className="cmp-group" key={g.label}>
                <div className="cmp-group-head">
                  <span>{g.label}</span>
                  <button type="button" onClick={() => setGroup(g.rows, !on)}>
                    {on ? "None" : "All"}
                  </button>
                </div>
                {g.rows.map((r) => {
                  const checked = picked.has(r.symbol);
                  return (
                    <label className="cmp-row" key={r.symbol}>
                      <input type="checkbox" checked={checked} onChange={() => toggle(r.symbol)} />
                      <span
                        className="cmp-swatch"
                        style={{ background: checked ? colorOf(r.symbol) : "transparent" }}
                        aria-hidden="true"
                      />
                      <span className="cmp-name">{r.label}</span>
                      <Link className="cmp-ticker" href={`/stock/${encodeURIComponent(r.symbol)}`}>
                        {r.symbol}
                      </Link>
                    </label>
                  );
                })}
              </div>
            );
          })}
        </section>

        <section className="cmp-chart-card" aria-label="Normalized performance">
          <div className="cmp-chart-head">
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
          </div>

          {!symbolKey ? (
            <div className="stock-chart-empty">Tick a row to chart it.</div>
          ) : error ? (
            <div className="stock-chart-empty">{error}</div>
          ) : busy ? (
            <div className="stock-chart-empty">Loading prices…</div>
          ) : (
            <>
              <div className="cmp-chart">
                <Line data={chart.data} options={chart.options} />
              </div>
              {/* The ranked list is the legend: it carries the swatches and
                  the returns a chart.js legend has nowhere to put. */}
              <ol className="cmp-rank">
                {built.lines.map((l) => (
                  <li key={l.symbol}>
                    <span
                      className="cmp-swatch"
                      style={{ background: l.color }}
                      aria-hidden="true"
                    />
                    <span className="cmp-name">{l.label}</span>
                    <span className="cmp-ticker">{l.symbol}</span>
                    <span className={l.changePct >= 0 ? "up" : "down"}>{pct(l.changePct)}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      </div>

      {footer?.(range)}
    </div>
  );
}
