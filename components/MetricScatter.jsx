"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chart as ChartJS, LinearScale, PointElement, Tooltip } from "chart.js";
import { Scatter } from "react-chartjs-2";
import { useTheme } from "@/components/PageChrome";
import { cssVar, hexToRgba } from "@/lib/cssVar";
import { formatCap } from "@/lib/formatCap";
import {
  DEFAULT_X,
  DEFAULT_Y,
  INDEXES,
  METRICS,
  METRIC_BY_KEY,
  axisRange,
  formatMetric,
  topFrontier,
  typedRange,
} from "@/lib/scatterMetrics";

// What share of the companies the frontier leaves above it, and what it's
// called on the chart. The two have to move together - the caption is the
// claim the line is making.
const TOP_FRACTION = 0.2;
const TOP_LABEL = `Top ${Math.round(TOP_FRACTION * 100)}%`;

// Ticker captions on the dots. Chart.js has no label element, and pulling in a
// datalabels plugin for one chart is more dependency than this is worth, so the
// captions are drawn straight onto the canvas after the points.
//
// Only the biggest few are captioned. A hundred labels on a hundred dots is a
// solid block of text - the rest are read by hovering, which is what the
// tooltip is for.
const pointLabelsPlugin = {
  id: "pointLabels",
  afterDatasetsDraw(chart) {
    const opts = chart.options.plugins?.pointLabels;
    if (!opts?.labels?.size) return;
    const meta = chart.getDatasetMeta(0);
    const { ctx } = chart;
    ctx.save();
    ctx.font = "600 10px sans-serif";
    ctx.fillStyle = opts.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";

    // Clustered companies would otherwise print their tickers on top of each
    // other - four overlapping labels read as none. Biggest first (the order
    // the set was built in), and a later one gives way if its box is already
    // taken.
    const taken = [];
    const clear = (box) =>
      !taken.some(
        (t) => box.l < t.r && box.r > t.l && box.t < t.b && box.b > t.t
      );

    meta.data.forEach((point, i) => {
      const row = chart.data.datasets[0].data[i];
      if (!opts.labels.has(row.symbol)) return;
      const half = ctx.measureText(row.symbol).width / 2 + 2;
      // Above the dot, clear of its own radius.
      const bottom = point.y - (point.options.radius ?? 4) - 3;
      const box = { l: point.x - half, r: point.x + half, t: bottom - 11, b: bottom };
      if (!clear(box)) return;
      taken.push(box);
      ctx.fillText(row.symbol, point.x, bottom);
    });
    ctx.restore();
  },
};

// The dashed diagonal, drawn between the two data points topFrontier() works
// out - see lib/scatterMetrics.js for where the line comes from. On the canvas
// for the same reason the captions are: one dashed line is not worth an
// annotation plugin.
const frontierPlugin = {
  id: "frontier",
  afterDatasetsDraw(chart) {
    const o = chart.options.plugins?.frontier;
    if (!o?.show || !o.line) return;
    const { ctx, chartArea: a, scales } = chart;
    const x1 = scales.x.getPixelForValue(o.line.from.x);
    const y1 = scales.y.getPixelForValue(o.line.from.y);
    const dx = scales.x.getPixelForValue(o.line.to.x) - x1;
    const dy = scales.y.getPixelForValue(o.line.to.y) - y1;

    // Liang-Barsky: narrow the segment to the part inside the plot instead of
    // clipping the canvas. The caption needs a point that is really on the
    // chart, and that falls out of the same two numbers.
    let t0 = 0;
    let t1 = 1;
    const edge = (p, q) => {
      if (p === 0) return q >= 0; // parallel to this edge: in or out entirely
      const r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
      return true;
    };
    const inside =
      edge(-dx, x1 - a.left) &&
      edge(dx, a.right - x1) &&
      edge(-dy, y1 - a.top) &&
      edge(dy, a.bottom - y1);
    if (!inside || t1 <= t0) return;

    ctx.save();
    ctx.strokeStyle = o.color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.moveTo(x1 + dx * t0, y1 + dy * t0);
    ctx.lineTo(x1 + dx * t1, y1 + dy * t1);
    ctx.stroke();

    // A quarter of the way down the visible run, riding on top of the line
    // rather than crossing it.
    const t = t0 + (t1 - t0) * 0.25;
    ctx.setLineDash([]);
    ctx.translate(x1 + dx * t, y1 + dy * t);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.fillStyle = o.color;
    ctx.font = "700 11px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(o.label, 6, -4);
    ctx.restore();
  },
};

ChartJS.register(LinearScale, PointElement, Tooltip, pointLabelsPlugin, frontierPlugin);

// Sector colours, reused from the palette the rest of the site draws groups in.
// Anything unclassified falls through to the muted grey.
const SECTOR_COLORS = {
  Technology: "#8b5cf6",
  "Communication Services": "#3b82f6",
  "Consumer Cyclical": "#f97316",
  "Consumer Defensive": "#eab308",
  Healthcare: "#14b8a6",
  "Financial Services": "#22c55e",
  Industrials: "#64748b",
  Energy: "#ef4444",
  "Basic Materials": "#a16207",
  "Real Estate": "#ec4899",
  Utilities: "#06b6d4",
};
const OTHER_COLOR = "#8b93a3";

// How many of the largest companies get a caption. Enough to orient the chart
// without the labels colliding into a smear.
const LABEL_COUNT = 14;

// Dot size by market cap, on a square root so a $4T company is a readable dot
// rather than a disc covering a quarter of the chart.
function radiusFor(cap, maxCap) {
  if (!cap || !maxCap) return 5;
  return 4 + 12 * Math.sqrt(cap / maxCap);
}

export default function MetricScatter() {
  const [index, setIndex] = useState("qqq");
  const [xKey, setXKey] = useState(DEFAULT_X);
  const [yKey, setYKey] = useState(DEFAULT_Y);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [trim, setTrim] = useState(true);
  const [frontier, setFrontier] = useState(true);
  // The four axis bounds when a reader has typed their own, `null` while the
  // chart is picking them. Held as the typed strings rather than numbers so a
  // half-typed "-" or an emptied box isn't read as a bound of zero, and tagged
  // with the metrics they were typed against - see `bounds` below.
  const [typedBounds, setTypedBounds] = useState(null);
  // Whatever the settings menu has the site set to. Read here for the same
  // reason every other chart on the site reads it: it is the signal that the
  // CSS variables the canvas draws in now hold different colours.
  const theme = useTheme();
  const chartRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/chart-metrics?index=${encodeURIComponent(index)}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Could not load fundamentals");
        return json;
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError({ index, message: err.message });
        setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [index]);

  // Derived rather than a third piece of state: an index is loading precisely
  // while what came back isn't the one now selected. Setting a loading flag in
  // the effect body would be a synchronous setState on every render pass that
  // changes the index, which is the cascade React warns about.
  const failure = error?.index === index ? error.message : null;
  const loading = !failure && data?.index !== index;

  const xMetric = METRIC_BY_KEY[xKey];
  const yMetric = METRIC_BY_KEY[yKey];

  // A typed range belongs to the metrics it was typed against - keeping "0 to
  // 80" on the axis after switching it from operating margin to market cap
  // would empty the chart with no hint as to why. Derived rather than cleared
  // from an effect, for the same reason `loading` above is: a setState in an
  // effect body is the cascading render React warns about, and what's wanted
  // here is simply that bounds belonging to another pair of axes don't count.
  const boundsFor = `${index}|${xKey}|${yKey}`;
  const bounds = typedBounds?.for === boundsFor ? typedBounds : null;

  const { points, labelled, plotted, dropped, xRange, yRange, offScale, frontierLine } = useMemo(() => {
    const rows = data?.rows ?? [];
    // A company missing either axis has no place on the chart - it can't be
    // drawn at zero without claiming something the data doesn't say.
    const usable = rows.filter(
      (r) => Number.isFinite(r[xKey]) && Number.isFinite(r[yKey])
    );
    const maxCap = Math.max(...usable.map((r) => r.cap ?? 0), 0);
    const points = usable.map((r) => ({
      x: r[xKey],
      y: r[yKey],
      symbol: r.symbol,
      name: r.name,
      sector: r.sector,
      cap: r.cap ?? null,
      r: radiusFor(r.cap, maxCap),
    }));

    const xRange = typedRange(axisRange(points.map((p) => p.x), trim), bounds?.xMin, bounds?.xMax);
    const yRange = typedRange(axisRange(points.map((p) => p.y), trim), bounds?.yMin, bounds?.yMax);
    const outside = (p) =>
      (xRange && (p.x < xRange.min || p.x > xRange.max)) ||
      (yRange && (p.y < yRange.min || p.y > yRange.max));
    const offScale = points.filter(outside).length;

    // Captions go to the biggest companies that are actually on screen -
    // labelling a point the axis has cut off just prints a ticker in a corner.
    const labelled = new Set(
      points
        .filter((p) => !outside(p))
        .sort((a, b) => (b.cap ?? 0) - (a.cap ?? 0))
        .slice(0, LABEL_COUNT)
        .map((p) => p.symbol)
    );
    return {
      points,
      labelled,
      plotted: usable.length,
      dropped: rows.length - usable.length,
      xRange,
      yRange,
      offScale,
      // Over every company plotted, on screen or off: the line is about the
      // companies, not about the window they're being viewed through.
      frontierLine: topFrontier(points, TOP_FRACTION),
    };
  }, [data, xKey, yKey, trim, bounds]);

  const chart = useMemo(() => {
    const text = cssVar("--text") || "#e6e8ee";
    const soft = cssVar("--text-soft") || "#9aa3b2";
    const border = cssVar("--border") || "#2a2f3a";
    const accent = cssVar("--accent") || "#c2410c";

    return {
      data: {
        datasets: [
          {
            data: points,
            // Do not add `parsing: false` here. A scatter is drawn by the line
            // controller, and skipping parsing puts it on the path that finds
            // the visible points by binary search - which assumes the data is
            // sorted ascending by x. These rows are in market-cap order, so it
            // computed a window of 96 starting at 6 and silently never drew
            // the first six: Nvidia, Apple, Alphabet, Microsoft, Amazon and
            // Broadcom. The largest companies, every time, with no error.
            // Parsing a hundred points costs nothing.
            pointRadius: (ctx) => ctx.raw?.r ?? 5,
            pointHoverRadius: (ctx) => (ctx.raw?.r ?? 5) + 3,
            pointBackgroundColor: (ctx) =>
              hexToRgba(SECTOR_COLORS[ctx.raw?.sector] ?? OTHER_COLOR, 0.75),
            pointBorderColor: (ctx) => SECTOR_COLORS[ctx.raw?.sector] ?? OTHER_COLOR,
            pointBorderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
          // Written as explicit keys, undefined and all: chart.js merges new
          // options over the live scale, so a bound left out of the object is
          // a bound that keeps its old value. Turning the trim off has to
          // clear these, not just decline to set them.
          x: {
            type: "linear",
            min: xRange?.min,
            max: xRange?.max,
            title: { display: true, text: xMetric.label, color: soft, font: { size: 12 } },
            ticks: { color: soft, callback: (v) => formatMetric(v, xMetric.unit) },
            grid: { color: hexToRgba(border, 0.6) },
          },
          y: {
            type: "linear",
            min: yRange?.min,
            max: yRange?.max,
            title: { display: true, text: yMetric.label, color: soft, font: { size: 12 } },
            ticks: { color: soft, callback: (v) => formatMetric(v, yMetric.unit) },
            grid: { color: hexToRgba(border, 0.6) },
          },
        },
        plugins: {
          pointLabels: { labels: labelled, color: text },
          frontier: { show: frontier, line: frontierLine, label: TOP_LABEL, color: accent },
          tooltip: {
            displayColors: false,
            callbacks: {
              title: (items) => {
                const row = items[0]?.raw;
                return row ? `${row.symbol} — ${row.name}` : "";
              },
              label: (item) => {
                const row = item.raw;
                return [
                  `${xMetric.label}: ${formatMetric(row.x, xMetric.unit)}`,
                  `${yMetric.label}: ${formatMetric(row.y, yMetric.unit)}`,
                  `Market cap: ${formatCap(row.cap)}`,
                  row.sector ?? "",
                ].filter(Boolean);
              },
            },
          },
        },
        onClick: (_e, elements) => {
          const row = elements.length ? points[elements[0].index] : null;
          if (row) window.open(`/stock/${encodeURIComponent(row.symbol)}`, "_blank", "noopener");
        },
      },
    };
    // `theme` is not read directly - it's the signal that the CSS variables
    // above have new values to re-read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, labelled, xMetric, yMetric, xRange, yRange, frontier, frontierLine, theme]);

  // Only the sectors actually on the chart, so the legend doesn't list eleven
  // when the Nasdaq 100 shows seven.
  const legend = useMemo(() => {
    const present = new Set(points.map((p) => p.sector).filter(Boolean));
    return Object.entries(SECTOR_COLORS).filter(([name]) => present.has(name));
  }, [points]);

  return (
    <div className="scatter-wrap">
      <div className="scatter-head">
        <h1 className="scatter-title">Chart metrics</h1>
        <p className="scatter-sub">
          Every company in an index on two axes of your choosing. Dot size is market cap, colour is
          sector; hover for the numbers, click to open the company.
        </p>
      </div>

      <div className="scatter-controls">
        <label className="scatter-control">
          <span className="scatter-control-label">Index</span>
          <select value={index} onChange={(e) => setIndex(e.target.value)}>
            {INDEXES.map((i) => (
              <option key={i.key} value={i.key}>
                {i.label}
              </option>
            ))}
          </select>
        </label>
        <label className="scatter-control">
          <span className="scatter-control-label">X axis</span>
          <select value={xKey} onChange={(e) => setXKey(e.target.value)}>
            {METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="scatter-control">
          <span className="scatter-control-label">Y axis</span>
          <select value={yKey} onChange={(e) => setYKey(e.target.value)}>
            {METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="scatter-toggle" title="Scale the axes to every company, however extreme">
          <input type="checkbox" checked={!trim} onChange={(e) => setTrim(!e.target.checked)} />
          Include outliers
        </label>
        <label
          className="scatter-toggle"
          title={`A dashed diagonal with roughly the top ${Math.round(
            TOP_FRACTION * 100
          )}% of these companies above it, scored on the two axes together.`}
        >
          <input
            type="checkbox"
            checked={frontier}
            onChange={(e) => setFrontier(e.target.checked)}
          />
          {TOP_LABEL} line
        </label>
        <button
          type="button"
          className="scatter-swap"
          onClick={() => {
            setXKey(yKey);
            setYKey(xKey);
          }}
        >
          Swap axes
        </button>
        {/* Opens filled with the range the chart is currently showing, so the
            boxes start from the numbers on the axes rather than from empty. */}
        <button
          type="button"
          className={`scatter-swap${bounds ? " active" : ""}`}
          onClick={() =>
            setTypedBounds(
              bounds
                ? null
                : {
                    for: boundsFor,
                    xMin: xRange ? String(xRange.min) : "",
                    xMax: xRange ? String(xRange.max) : "",
                    yMin: yRange ? String(yRange.min) : "",
                    yMax: yRange ? String(yRange.max) : "",
                  }
            )
          }
        >
          {bounds ? "Auto axis range" : "Set axis range"}
        </button>
      </div>

      {bounds && (
        <div className="scatter-controls scatter-bounds">
          {[
            ["X axis", xMetric.label, "xMin", "xMax"],
            ["Y axis", yMetric.label, "yMin", "yMax"],
          ].map(([axis, label, minKey, maxKey]) => (
            <div className="scatter-control" key={axis}>
              <span className="scatter-control-label">
                {axis} · {label}
              </span>
              {[
                ["Min", minKey],
                ["Max", maxKey],
              ].map(([word, key]) => (
                <label className="scatter-bound" key={key}>
                  <span>{word}</span>
                  <input
                    type="number"
                    step="any"
                    value={bounds[key]}
                    aria-label={`${axis} ${word.toLowerCase()}`}
                    onChange={(e) => setTypedBounds({ ...bounds, [key]: e.target.value })}
                  />
                </label>
              ))}
            </div>
          ))}
          {/* An empty box or a max under its min leaves that axis on the range
              the chart worked out, rather than blanking the plot. */}
          <span className="scatter-note">Leave a box empty to let the chart pick that end.</span>
        </div>
      )}

      {failure && <p className="scatter-error">{failure}</p>}

      <div className="scatter-panel">
        {loading ? (
          <p className="scatter-status">
            Loading fundamentals for every constituent — the first load takes a few seconds.
          </p>
        ) : points.length ? (
          <div className="scatter-canvas">
            <Scatter ref={chartRef} data={chart.data} options={chart.options} />
          </div>
        ) : (
          !failure && <p className="scatter-status">No company has both of these figures.</p>
        )}
      </div>

      {points.length > 0 && (
        <div className="scatter-footer">
          <div className="scatter-legend">
            {legend.map(([name, color]) => (
              <span className="scatter-legend-item" key={name}>
                <i style={{ background: color }} />
                {name}
              </span>
            ))}
          </div>
          <span className="scatter-note">
            {plotted} of {data?.members ?? plotted} plotted
            {dropped > 0 ? ` · ${dropped} without one of these figures` : ""}
            {offScale > 0 ? ` · ${offScale} off-scale` : ""}
          </span>
        </div>
      )}
    </div>
  );
}
