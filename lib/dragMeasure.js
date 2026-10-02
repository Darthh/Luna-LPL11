// Chart.js plugin: press and drag across a chart to measure the move between
// two points, showing the absolute change and the percent change the way
// dragging on a Google Finance chart does.
//
// Enable per chart with options.plugins.dragMeasure. `series` picks which
// dataset(s) to measure - one readout line each - so a chart plotting an
// index against a price can report both:
//
//   dragMeasure: {
//     series: [{ datasetIndex: 1, label: "SPY", format: (v) => `$${v.toFixed(2)}` }],
//   }
//
// A series already plotted as percent change off a baseline (an indexed
// comparison) is marked `indexed: true`. The move between two points on such
// a line is not the difference between them - going from +100% to +150% is a
// 25% move, not 50 - so those readouts compound instead of subtracting, and
// report the one number that means anything: the percent change over the
// dragged span.

import { clamp } from "./num.js";

const UP = "#30cc5a";
const DOWN = "#f63538";
const MUTED = "#8b93a3";

// Chart.js normalizes pointer and touch events onto these mouse types, so
// listening for them covers dragging with a finger too.
const DRAG_EVENTS = ["mousedown", "mousemove", "mouseup", "mouseout"];

const states = new WeakMap();

function getState(chart) {
  let state = states.get(chart);
  if (!state) {
    state = { start: null, end: null, dragging: false, moved: false };
    states.set(chart, state);
  }
  return state;
}

// The chart only receives the events listed in options.events, and the
// defaults stop at mousemove/click.
function ensureEvents(chart) {
  const events = chart.options.events ?? [];
  const missing = DRAG_EVENTS.filter((e) => !events.includes(e));
  if (missing.length) chart.options.events = [...events, ...missing];
}

function pointCount(chart) {
  return chart.data.labels?.length ?? chart.data.datasets?.[0]?.data?.length ?? 0;
}

// Pixel → data index, clamped to the plotted range.
function indexAt(chart, x) {
  const { chartArea, scales } = chart;
  const clamped = clamp(x, chartArea.left, chartArea.right);
  const index = Math.round(scales.x.getValueForPixel(clamped));
  const count = pointCount(chart);
  if (!count) return null;
  return clamp(index, 0, count - 1);
}

function valueAt(dataset, i) {
  const raw = dataset?.data?.[i];
  const value = raw && typeof raw === "object" ? raw.y : raw;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// Series can have gaps (a null estimate, a missing session), so fall back to
// the closest point that actually has a value.
function nearestValue(dataset, i, count) {
  if (valueAt(dataset, i) != null) return { value: valueAt(dataset, i), index: i };
  for (let d = 1; d < count; d++) {
    const before = valueAt(dataset, i - d);
    if (before != null) return { value: before, index: i - d };
    const after = valueAt(dataset, i + d);
    if (after != null) return { value: after, index: i + d };
  }
  return null;
}

// Labels are ISO dates on the sentiment charts and already-formatted strings
// on the stock page, so only reformat what parses as a date.
function labelText(raw) {
  if (typeof raw !== "string") return String(raw ?? "");
  if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw;
  const d = new Date(`${raw.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

export const dragMeasurePlugin = {
  id: "dragMeasure",

  beforeInit(chart) {
    ensureEvents(chart);
  },

  // React rebuilds the options object on every render, which would drop the
  // extra events again.
  beforeUpdate(chart) {
    ensureEvents(chart);
  },

  afterEvent(chart, args, opts) {
    if (opts?.enabled === false) return;
    const state = getState(chart);
    const { type, x, y } = args.event;
    const area = chart.chartArea;
    if (!area) return;

    if (type === "mousedown") {
      const inside = x >= area.left && x <= area.right && y >= area.top && y <= area.bottom;
      if (!inside) return;
      const index = indexAt(chart, x);
      if (index == null) return;
      state.dragging = true;
      state.moved = false;
      state.start = index;
      state.end = index;
      args.changed = true;
      return;
    }

    if (type === "mousemove" && state.dragging) {
      const index = indexAt(chart, x);
      if (index != null && index !== state.end) {
        state.end = index;
        state.moved = true;
        args.changed = true;
      }
      return;
    }

    if (type === "mouseup" || type === "mouseout") {
      if (!state.dragging) return;
      state.dragging = false;
      // A plain click (press and release without dragging) clears the last
      // measurement instead of leaving a zero-width one behind.
      if (!state.moved || state.start === state.end) {
        state.start = null;
        state.end = null;
      }
      args.changed = true;
    }
  },

  // Above the data, below the tooltip.
  afterDatasetsDraw(chart, args, opts) {
    if (opts?.enabled === false) return;
    const state = states.get(chart);
    if (!state || state.start == null || state.end == null || state.start === state.end) return;

    const { ctx, chartArea, scales } = chart;
    const count = pointCount(chart);
    // Always read left to right, so dragging backwards still reports the
    // change over the span rather than its negation.
    const i0 = Math.min(state.start, state.end);
    const i1 = Math.max(state.start, state.end);
    const x0 = scales.x.getPixelForValue(i0);
    const x1 = scales.x.getPixelForValue(i1);

    const series = opts?.series?.length ? opts.series : [{ datasetIndex: 0 }];
    const upColor = opts?.upColor ?? UP;
    const downColor = opts?.downColor ?? DOWN;
    const mutedColor = opts?.mutedColor ?? MUTED;

    const readouts = [];
    for (const entry of series) {
      const dataset = chart.data.datasets[entry.datasetIndex ?? 0];
      if (!dataset) continue;
      const from = nearestValue(dataset, i0, count);
      const to = nearestValue(dataset, i1, count);
      if (!from || !to) continue;
      const label = entry.label ? `${entry.label} ` : "";

      if (entry.indexed) {
        const growth = (100 + to.value) / (100 + from.value);
        if (!Number.isFinite(growth) || growth <= 0) continue;
        const move = (growth - 1) * 100;
        readouts.push({
          text: `${label}${move >= 0 ? "▲" : "▼"} ${move >= 0 ? "+" : "-"}${Math.abs(move).toFixed(2)}%`,
          color: move >= 0 ? upColor : downColor,
        });
        continue;
      }

      const delta = to.value - from.value;
      const pct = from.value === 0 ? null : (delta / Math.abs(from.value)) * 100;
      const format = entry.format ?? ((v) => v.toLocaleString(undefined, { maximumFractionDigits: 2 }));
      const sign = delta >= 0 ? "+" : "-";
      const magnitude = format(Math.abs(delta));
      const pctText = pct == null ? "" : ` (${sign}${Math.abs(pct).toFixed(2)}%)`;
      readouts.push({
        text: `${label}${delta >= 0 ? "▲" : "▼"} ${sign}${magnitude}${pctText}`,
        color: delta >= 0 ? upColor : downColor,
      });
    }
    if (!readouts.length) return;

    const primary = chart.data.datasets[series[0].datasetIndex ?? 0];
    const span = `${labelText(chart.data.labels?.[i0])} – ${labelText(chart.data.labels?.[i1])}`;

    ctx.save();

    // Selected band + its edges.
    ctx.fillStyle = opts?.bandColor ?? "rgba(125, 145, 185, 0.16)";
    ctx.fillRect(x0, chartArea.top, x1 - x0, chartArea.bottom - chartArea.top);
    ctx.strokeStyle = mutedColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    for (const x of [x0, x1]) {
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Endpoint dots on the first measured series.
    const yScale = scales[primary?.yAxisID] ?? scales.y ?? Object.values(scales).find((s) => s.axis === "y");
    if (yScale) {
      for (const i of [i0, i1]) {
        const point = nearestValue(primary, i, count);
        if (!point) continue;
        ctx.beginPath();
        ctx.fillStyle = readouts[0].color;
        ctx.arc(scales.x.getPixelForValue(point.index), yScale.getPixelForValue(point.value), 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Readout box, centered over the band and kept inside the plot.
    const valueFont = "600 11.5px system-ui, -apple-system, sans-serif";
    const spanFont = "500 10.5px system-ui, -apple-system, sans-serif";
    ctx.font = valueFont;
    let boxWidth = 0;
    for (const line of readouts) boxWidth = Math.max(boxWidth, ctx.measureText(line.text).width);
    ctx.font = spanFont;
    boxWidth = Math.max(boxWidth, ctx.measureText(span).width);

    const padX = 9;
    const lineHeight = 15;
    const width = boxWidth + padX * 2;
    const height = readouts.length * lineHeight + 15 + 10;
    const left = clamp((x0 + x1) / 2 - width / 2, chartArea.left + 2, chartArea.right - width - 2);
    const top = chartArea.top + 6;

    ctx.fillStyle = opts?.boxColor ?? "rgba(14, 16, 21, 0.92)";
    roundRect(ctx, left, top, width, height, 6);
    ctx.strokeStyle = opts?.boxBorderColor ?? "rgba(139, 147, 163, 0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    let textY = top + 6;
    ctx.font = valueFont;
    for (const line of readouts) {
      ctx.fillStyle = line.color;
      ctx.fillText(line.text, left + padX, textY);
      textY += lineHeight;
    }
    ctx.font = spanFont;
    ctx.fillStyle = mutedColor;
    ctx.fillText(span, left + padX, textY);

    ctx.restore();
  },
};
