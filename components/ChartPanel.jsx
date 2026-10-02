"use client";

import { useMemo } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { fgLineColor } from "@/lib/zone";
import { cssVar, hexToRgba } from "@/lib/cssVar";
import { dragMeasurePlugin } from "@/lib/dragMeasure";

// Draws dashed overbought/oversold reference lines on the RSI chart. Only
// active when options.plugins.rsiZones.enabled is set (see ChartPanel below)
// so it stays a no-op for every other metric's chart.
const rsiZonesPlugin = {
  id: "rsiZones",
  afterDraw(chart) {
    const opts = chart.options.plugins?.rsiZones;
    if (!opts?.enabled) return;
    const { ctx, chartArea, scales } = chart;
    const yScale = scales.yFG;
    if (!chartArea || !yScale) return;

    const drawLine = (value, color, label, labelBaseline) => {
      const y = yScale.getPixelForValue(value);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(chartArea.left, y);
      ctx.lineTo(chartArea.right, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.font = "10px sans-serif";
      ctx.textBaseline = labelBaseline;
      ctx.fillText(label, chartArea.left + 4, y + (labelBaseline === "bottom" ? -2 : 2));
      ctx.restore();
    };
    drawLine(70, "#e5484d", "Overbought (70)", "bottom");
    drawLine(30, "#3fae5e", "Oversold (30)", "top");
  },
};

ChartJS.register(
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
  rsiZonesPlugin,
  dragMeasurePlugin
);

const RANGES = [
  { key: "all", label: "All" },
  { key: "6m", label: "6m" },
  { key: "ytd", label: "YTD" },
  { key: "1y", label: "1y" },
  { key: "2y", label: "2y" },
  { key: "3y", label: "3y" },
  { key: "5y", label: "5y" },
];

export default function ChartPanel({
  labels,
  fgData,
  pxData,
  metrics,
  activeMetric,
  onMetricChange,
  metricsEnabled,
  ticker,
  tickerName,
  range,
  onRangeChange,
  fill,
  logScale,
  showStock = true,
  loading,
  isDemo,
  theme,
  // Rendered at the end of the zoom row. Passed in rather than imported so
  // ChartPanel stays the generic panel the per-ticker and stock pages reuse -
  // only the home page hands it the alert control.
  zoomRowExtra = null,
}) {
  const meta = metrics.find((m) => m.key === activeMetric) ?? metrics[0];
  const isFG = meta.key === "fg";

  const data = useMemo(() => {
    const fgLine = cssVar("--fg-line");
    const priceLine = cssVar("--price-line");
    const datasets = [
      {
        label: `${meta.label} (L)`,
        data: fgData,
        yAxisID: "yFG",
        borderColor: fgLine,
        segment: isFG ? { borderColor: (ctx) => fgLineColor(ctx.p1.parsed.y) } : undefined,
        backgroundColor: hexToRgba(fgLine, 0.12),
        borderWidth: 1.8,
        pointRadius: 0,
        pointHitRadius: 6,
        tension: 0.15,
        fill: fill ? "origin" : false,
      },
    ];
    // The price line is dropped from the dataset list entirely rather than
    // hidden, so the right-hand axis, the tooltip and the drag-measure
    // readout all fall away with it instead of pointing at a missing series.
    if (showStock) {
      datasets.push({
        label: `${ticker} (R)`,
        data: pxData,
        yAxisID: "yPX",
        borderColor: priceLine,
        backgroundColor: hexToRgba(priceLine, 0.1),
        borderWidth: 1.8,
        pointRadius: 0,
        pointHitRadius: 6,
        tension: 0.15,
        fill: false,
      });
    }
    return { labels, datasets };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labels, fgData, pxData, fill, ticker, theme, meta, isFG, showStock]);

  const options = useMemo(() => {
    const tickColor = cssVar("--tick-color");
    const gridColor = cssVar("--grid");
    const tooltipBg = cssVar("--tooltip-bg");
    const tooltipText = cssVar("--tooltip-text");
    const tooltipBorder = cssVar("--tooltip-border");
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        rsiZones: { enabled: meta.key === "rsi_14" },
        // Drag across the chart to measure a move. This chart carries two
        // series on separate axes, so report both: the price in dollars and
        // the sentiment metric in its own units.
        dragMeasure: {
          series: [
            ...(showStock
              ? [
                  {
                    datasetIndex: 1,
                    label: ticker,
                    format: (v) => v.toLocaleString(undefined, { maximumFractionDigits: 2 }),
                  },
                ]
              : []),
            { datasetIndex: 0, label: meta.label, format: (v) => meta.format(v) },
          ],
          mutedColor: tickColor,
          boxColor: tooltipBg,
          boxBorderColor: tooltipBorder,
        },
        tooltip: {
          backgroundColor: tooltipBg,
          titleColor: tooltipText,
          bodyColor: tooltipText,
          borderColor: tooltipBorder,
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label(item) {
              if (item.dataset.yAxisID === "yFG") return ` ${meta.label}: ${meta.format(item.parsed.y)}`;
              return ` ${ticker}: ${item.parsed.y.toLocaleString()}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: "transparent" },
          ticks: {
            maxTicksLimit: 12,
            color: tickColor,
            font: { size: 11 },
            callback(v) {
              const d = new Date(this.getLabelForValue(v));
              return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }).replace(" ", " '");
            },
          },
        },
        yFG: {
          position: "left",
          min: meta.min,
          max: meta.max,
          title: { display: true, text: meta.axisLabel, color: tickColor },
          grid: { color: gridColor },
          ticks: { stepSize: isFG ? 20 : undefined, color: tickColor, font: { size: 11 } },
        },
        // Omitted entirely when the price line is off, or Chart.js keeps
        // drawing an empty right-hand axis with no series behind it.
        ...(showStock && {
          yPX: {
            type: logScale ? "logarithmic" : "linear",
            position: "right",
            title: { display: true, text: "Price", color: tickColor },
            grid: { drawOnChartArea: false },
            ticks: {
              color: tickColor,
              font: { size: 11 },
              callback: (v) =>
                v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 2).replace(/\.00$/, "") + "K" : v,
            },
          },
        }),
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logScale, ticker, theme, meta, isFG, showStock]);

  return (
    <main>
      <div className="chart-card">
        <div className="chart-head">
          <h2 id="chartTitle">
            US – {meta.chartTitle}
            {showStock && <> vs. {tickerName}</>}
          </h2>
          <div className="sub">
            Market sentiment
            {isDemo && <span className="demo-badge">Demo data</span>}
          </div>
        </div>
        <div className="metric-row" role="group" aria-label="Chart metric">
          {metrics.map((m) => {
            const disabled = m.key !== "fg" && !m.computeFromPrice && !metricsEnabled;
            return (
              <button
                key={m.key}
                className={m.key === activeMetric ? "chip active" : "chip"}
                disabled={disabled}
                title={disabled ? "Unavailable in demo mode" : undefined}
                onClick={() => onMetricChange(m.key)}
              >
                {m.label}
              </button>
            );
          })}
        </div>
        {meta.description && <div className="metric-desc">{meta.description}</div>}
        <div className="zoom-row" role="group" aria-label="Date range">
          <span className="lbl">Zoom</span>
          {RANGES.map((r) => (
            <button
              key={r.key}
              className={r.key === range ? "zbtn active" : "zbtn"}
              data-range={r.key}
              onClick={() => onRangeChange(r.key)}
            >
              {r.label}
            </button>
          ))}
          {zoomRowExtra}
        </div>
        <div className="chart-wrap">
          <div className="watermark">◍ Luna Terminal</div>
          <Line data={data} options={options} />
          {loading && (
            <div className="loading-overlay show" id="loading">
              Loading…
            </div>
          )}
        </div>
        <div className="legend-row">
          <div className="item">
            <span className="swatch" style={{ background: "var(--fg-line)" }}></span>
            {meta.label} (L)
          </div>
          {showStock && (
            <div className="item">
              <span className="swatch" style={{ background: "var(--price-line)" }}></span>
              <span id="legendTicker">{tickerName}</span> (R)
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
