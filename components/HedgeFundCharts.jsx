"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import { useTheme } from "@/components/PageChrome";
import { donutPalette } from "@/lib/donutChart";
import FundHoldingsMap from "@/components/FundHoldingsMap";
import { cssVar, hexToRgba } from "@/lib/cssVar";
import { dragMeasurePlugin } from "@/lib/dragMeasure";
import { hoverLinePlugin } from "@/lib/hoverLine";
import { money, pct, quarterLabel, reportDate } from "@/lib/hedgeFundFormat";

ChartJS.register(
  BarElement,
  CategoryScale,
  Filler,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  dragMeasurePlugin,
  hoverLinePlugin
);

// The manager's own line and the benchmark it's read against. The benchmark is
// deliberately not one of the categorical hues: it's the reference the eye
// keeps coming back to, not another series competing with them.
const FUND_COLOR = "#3987e5";
const BENCH_COLOR = "#8b93a3";

function axes(palette, { stacked = false, max } = {}) {
  const grid = cssVar("--border") || palette.border;
  const ticks = { color: palette.text, font: { size: 10 } };
  return {
    x: { stacked, grid: { display: false }, ticks: { ...ticks, maxRotation: 60, minRotation: 0 } },
    y: { stacked, max, grid: { color: grid }, border: { display: false }, ticks },
  };
}

function tooltipStyle(palette) {
  return {
    backgroundColor: cssVar("--tooltip-bg") || palette.surface,
    titleColor: cssVar("--tooltip-text") || palette.text,
    bodyColor: cssVar("--tooltip-text") || palette.text,
    borderColor: cssVar("--tooltip-border") || palette.border,
    borderWidth: 1,
    padding: 10,
  };
}

function Panel({ title, note, children, empty }) {
  return (
    <section className="hf-panel hf-chart-panel">
      <div className="hf-panel-head">
        <h2>{title}</h2>
        {note && <span className="hf-note">{note}</span>}
      </div>
      {empty ? <p className="hf-empty">{empty}</p> : children}
    </section>
  );
}

// A legend that names every series, for the two stacked charts. Twelve bands
// of colour is well past what colour alone can carry, and these are stacked
// rather than side by side - so a band's identity comes from the label, and
// the swatch is only there to tie it to the chart.
function Key({ items, color }) {
  return (
    <ul className="hf-legend hf-chart-key">
      {items.map((item, i) => (
        <li key={item.label}>
          <span className="hf-swatch" style={{ background: color(i) }} />
          <span className="hf-legend-label">{item.label}</span>
          <span className="hf-legend-pct">{pct(item.last)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function HedgeFundCharts({ cik, name }) {
  const theme = useTheme();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/hedge-funds?cik=${encodeURIComponent(cik)}&view=charts`)
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (j.error) throw new Error(j.error);
        setData(j);
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [cik]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const palette = useMemo(() => donutPalette(), [theme]);
  const hue = useCallback((i) => palette.series[i % palette.series.length], [palette]);

  const labels = useMemo(
    () => (data?.periods ? [...data.periods].reverse().map(quarterLabel) : []),
    [data]
  );

  // --- 0. What the whole filed table was worth, quarter by quarter ---------
  //
  // The cover-page total rather than the sum of the positions: it is the number
  // the filing puts on itself and the one the list page ranks by, so a manager
  // reading $875B there sees $875B here.
  const totalValue = useMemo(() => {
    const points = data?.valueHistory ?? [];
    if (points.length < 2) return null;
    const line = cssVar("--accent") || FUND_COLOR;
    return {
      data: {
        labels: points.map((p) => quarterLabel(p.period)),
        datasets: [
          {
            label: "Total value",
            data: points.map((p) => p.totalValue),
            borderColor: line,
            backgroundColor: hexToRgba(line, 0.12),
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 5,
            tension: 0.2,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        // Off, because dragging redraws on every pointer move and an animated
        // line under a measurement is a line that will not sit still.
        animation: false,
        interaction: { mode: "index", intersect: false },
        scales: {
          ...axes(palette),
          y: {
            ...axes(palette).y,
            ticks: { ...axes(palette).y.ticks, callback: (v) => money(v) },
          },
        },
        plugins: {
          legend: { display: false },
          // The same two mechanics the stock chart has: a rule under the
          // cursor saying which quarter is being read, and a press-and-drag
          // across the line to measure the move between two quarters.
          hoverLine: { enabled: true, color: cssVar("--tick-color") || palette.text },
          dragMeasure: {
            series: [{ datasetIndex: 0, label: "Total value", format: (v) => money(v) }],
            mutedColor: cssVar("--tick-color") || palette.text,
            boxColor: cssVar("--tooltip-bg") || palette.surface,
            boxBorderColor: cssVar("--tooltip-border") || palette.border,
          },
          tooltip: {
            ...tooltipStyle(palette),
            callbacks: {
              label: (item) => ` ${money(item.raw)}`,
              // The position count is the other half of what a quarter's
              // filing says, and it costs nothing to carry - it is on the
              // same cover page.
              afterLabel: (item) => {
                const n = points[item.dataIndex]?.positions;
                return n ? ` ${n.toLocaleString()} positions` : "";
              },
            },
          },
        },
      },
      first: points[0],
      last: points.at(-1),
      // The move across the whole span, which is what the chart is for.
      change: points[0].totalValue ? (points.at(-1).totalValue / points[0].totalValue - 1) * 100 : null,
    };
  }, [data, palette]);

  // --- 1. The filed book against SPY ---------------------------------------
  const performance = useMemo(() => {
    const points = data?.performance ?? [];
    if (points.length < 2) return null;
    const line = (label, key, color) => ({
      label,
      data: points.map((p) => p[key]),
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 5,
      tension: 0.2,
    });
    return {
      data: {
        labels: points.map((p) => quarterLabel(p.period)),
        datasets: [line(name, "fund", FUND_COLOR), line("SPY", "benchmark", BENCH_COLOR)],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        scales: axes(palette),
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tooltipStyle(palette),
            callbacks: {
              // Both lines start at 100, so what a reader wants off the axis is
              // the move since then rather than the index level.
              label: (item) =>
                ` ${item.dataset.label}: ${item.raw >= 100 ? "+" : "−"}${Math.abs(item.raw - 100).toFixed(1)}%`,
            },
          },
        },
      },
      // The last point of each line, which is the number the chart is for.
      endFund: points.at(-1).fund - 100,
      endBench: points.at(-1).benchmark - 100,
    };
  }, [data, palette, name]);

  // --- 2. Top ten holdings per quarter -------------------------------------
  const holdings = useMemo(() => {
    const series = data?.topHoldings?.series ?? [];
    if (!series.length) return null;
    return {
      data: {
        labels,
        datasets: series.map((s, i) => ({
          label: s.ticker,
          data: s.points,
          borderColor: hue(i),
          backgroundColor: hue(i),
          borderWidth: 1,
          pointRadius: 0,
          pointHoverRadius: 4,
          fill: true,
          tension: 0.25,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        scales: axes(palette, { stacked: true }),
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tooltipStyle(palette),
            // Twelve stacked bands is a wall of rows if they all report; the
            // ones worth reading are the ones actually held that quarter.
            filter: (item) => item.raw > 0.01,
            callbacks: { label: (item) => ` ${item.dataset.label}: ${pct(item.raw)}` },
          },
        },
      },
      key: series.map((s) => ({ label: s.ticker, last: s.points.at(-1) ?? 0 })),
    };
  }, [data, labels, palette, hue]);

  // --- 4. Sector exposure per quarter --------------------------------------
  const sectors = useMemo(() => {
    const series = data?.sectors?.series ?? [];
    if (!series.length) return null;
    return {
      data: {
        labels,
        datasets: series.map((s, i) => ({
          label: s.sector,
          data: s.points,
          backgroundColor: s.sector === "Other" ? palette.other : hue(i),
          borderWidth: 0,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: axes(palette, { stacked: true, max: 100 }),
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tooltipStyle(palette),
            filter: (item) => item.raw > 0.05,
            callbacks: { label: (item) => ` ${item.dataset.label}: ${pct(item.raw)}` },
          },
        },
      },
      key: series.map((s) => ({ label: s.sector, last: s.points.at(-1) ?? 0 })),
    };
  }, [data, labels, palette, hue]);

  if (error) return <p className="screener-error">{error}</p>;
  if (!data) {
    return (
      <div className="hf-placeholder">
        <p>Reading five quarters of filings…</p>
      </div>
    );
  }

  const span =
    data.periods.length > 1
      ? `${reportDate(data.periods.at(-1))} → ${reportDate(data.periods[0])}`
      : reportDate(data.periods[0]);

  return (
    <div className="hf-charts">
      <Panel
        title="Total value by quarter"
        note={
          totalValue
            ? `${quarterLabel(totalValue.first.period)} → ${quarterLabel(totalValue.last.period)}`
            : null
        }
        empty={totalValue ? null : "Not enough filed quarters to draw a line."}
      >
        {totalValue && (
          <>
            <div className="hf-chart-figures">
              <span className="hf-chart-figure">
                Latest <b>{money(totalValue.last.totalValue)}</b>
              </span>
              {totalValue.change != null && (
                <span className="hf-chart-figure">
                  Since {quarterLabel(totalValue.first.period)}{" "}
                  <b className={totalValue.change >= 0 ? "ticker-change-up" : "ticker-change-down"}>
                    {totalValue.change >= 0 ? "+" : "−"}
                    {Math.abs(totalValue.change).toFixed(1)}%
                  </b>
                </span>
              )}
            </div>
            <div className="hf-chart">
              <Line data={totalValue.data} options={totalValue.options} />
            </div>
            <p className="hf-chart-note">
              What each quarter&apos;s Form 13F reported the whole table to be worth — the number
              on the filing&apos;s own cover page, which is what the list ranks managers by. It
              counts options at the value of the shares underneath them, so for a firm that trades
              them it runs well above the stock book. Hover a quarter to read it; press and drag
              across the line to measure the move between two.
            </p>
          </>
        )}
      </Panel>

      <Panel
        title="Performance vs SPY"
        note={span}
        empty={
          performance
            ? null
            : "Not enough priced quarters to draw a line. A replication needs two quarter ends with most of the book priced at both."
        }
      >
        {performance && (
          <>
            <div className="hf-chart-figures">
              <span className="hf-chart-figure">
                <span className="hf-swatch" style={{ background: FUND_COLOR }} />
                Reported book{" "}
                <b className={performance.endFund >= 0 ? "ticker-change-up" : "ticker-change-down"}>
                  {performance.endFund >= 0 ? "+" : "−"}
                  {Math.abs(performance.endFund).toFixed(1)}%
                </b>
              </span>
              <span className="hf-chart-figure">
                <span className="hf-swatch" style={{ background: BENCH_COLOR }} />
                SPY{" "}
                <b className={performance.endBench >= 0 ? "ticker-change-up" : "ticker-change-down"}>
                  {performance.endBench >= 0 ? "+" : "−"}
                  {Math.abs(performance.endBench).toFixed(1)}%
                </b>
              </span>
            </div>
            <div className="hf-chart">
              <Line data={performance.data} options={performance.options} />
            </div>
            {/* This is the single most misreadable chart on the site, so what
                it is not says as much as what it is. */}
            <p className="hf-chart-note">
              A <b>replication</b>, not a return. It holds each filing&apos;s reported weights until
              the next filing and rebalances there, over the {data.pricedSample} largest positions.
              A 13F reports US-listed long positions on one day and never what was paid — so shorts,
              options, cash, leverage and every trade between two filings are outside this line, and
              it is not what the fund earned.
            </p>
          </>
        )}
      </Panel>

      <Panel
        title="Top 10 holdings per quarter"
        note={`share of the reported stock book${data.periods.length ? ` · ${data.periods.length} quarters` : ""}`}
        empty={holdings ? null : "No holdings resolved to a ticker."}
      >
        {holdings && (
          <>
            <div className="hf-chart">
              <Line data={holdings.data} options={holdings.options} />
            </div>
            {/* Every ticker that reached some quarter's top ten, so a name that
                falls out of it still has a band rather than disappearing. */}
            <Key items={holdings.key} color={hue} />
          </>
        )}
      </Panel>

      <Panel
        title={`Stock holdings map${data.map?.rows?.length ? ` — top ${data.map.rows.length}` : ""}`}
        note={data.map?.period ? reportDate(data.map.period) : null}
        empty={data.map?.rows?.length ? null : "No holdings resolved to a ticker."}
      >
        {data.map?.rows?.length > 0 && (
          <>
            <FundHoldingsMap map={data.map} />
            <p className="hf-chart-note">
              Every tile is a reported position, sized by what it was worth at the filing and
              grouped by sector. The color is what the stock has done over the period above,
              which is a different question from what the fund paid - a 13F says what was held,
              never when it was bought. Together these are <b>{pct(data.map.covered)}</b> of the
              stock book; the rest is a long tail of smaller positions. Options are not here;
              they have their own ring above.
            </p>
          </>
        )}
      </Panel>

      <Panel
        title="Sector exposure by quarter"
        note={`share of the ${data.sectorSample} largest positions`}
        empty={sectors ? null : "No sectors could be resolved."}
      >
        {sectors && (
          <>
            <div className="hf-chart">
              <Bar data={sectors.data} options={sectors.options} />
            </div>
            <Key items={sectors.key} color={(i) => (sectors.key[i].label === "Other" ? palette.other : hue(i))} />
            <p className="hf-chart-note">
              Each quarter is the {data.sectorSample} largest reported positions of that quarter,
              split by sector and shown as a percentage of them. Anything without a sector — most
              trusts and some foreign lines — is grouped as <b>Other</b> rather than dropped, so
              every column is a whole.
            </p>
          </>
        )}
      </Panel>
    </div>
  );
}
