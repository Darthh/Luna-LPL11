// Chart.js plugin: mark the high and the low of the visible range, and tag the
// last close against the price axis.
//
// Enable per chart with options.plugins.priceMarkers:
//
//   priceMarkers: {
//     enabled: true,
//     datasetIndex: 0,
//     format: (v) => `$${v.toFixed(2)}`,
//     lastColor: "#30cc5a",
//   }
//
// Drawn in afterDatasetsDraw so the callouts sit above the line and its fill.

import { clamp } from "./num.js";

const MUTED = "#8b93a3";
const LABEL_FONT = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
const TAG_FONT = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";

function extremes(values) {
  let hi = -Infinity;
  let lo = Infinity;
  let hiIndex = -1;
  let loIndex = -1;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) continue;
    if (v > hi) {
      hi = v;
      hiIndex = i;
    }
    if (v < lo) {
      lo = v;
      loIndex = i;
    }
  }
  return hiIndex < 0 ? null : { hi, hiIndex, lo, loIndex };
}

// The callout hangs off whichever side of the point has room, so a high set on
// the last day doesn't render its label off the right edge of the canvas.
function drawCallout(ctx, area, x, y, text, above, color) {
  const leader = 7;
  const gap = 4;
  ctx.font = LABEL_FONT;
  const width = ctx.measureText(text).width;
  const toLeft = x + leader + gap + width > area.right;
  const dir = toLeft ? -1 : 1;
  const labelY = above ? y - 9 : y + 9;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1;

  // A short elbow from the point out to the label, rather than a bare number
  // floating near the peak with nothing tying it to the candle.
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, labelY);
  ctx.lineTo(x + dir * leader, labelY);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, 2.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.textBaseline = "middle";
  ctx.textAlign = toLeft ? "right" : "left";
  ctx.fillText(text, x + dir * (leader + gap), labelY);
  ctx.restore();
}

// The last close, tagged into the axis gutter the way a live quote reads on a
// terminal: the number you want most is the one you never have to hunt for.
function drawLastTag(chart, y, text, color) {
  const { ctx, chartArea, width } = chart;
  ctx.save();
  ctx.font = TAG_FONT;
  const padX = 5;
  const textWidth = ctx.measureText(text).width;
  const boxWidth = Math.min(textWidth + padX * 2, width - chartArea.right - 1);
  const boxHeight = 16;
  const left = chartArea.right + 1;
  const top = clamp(y - boxHeight / 2, chartArea.top, chartArea.bottom - boxHeight);

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(left, top, boxWidth, boxHeight, 3);
  ctx.fill();

  // A dashed rule back to the line, so the tag reads as this series' price and
  // not as an axis label that happens to be coloured.
  ctx.beginPath();
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.moveTo(chartArea.left, y);
  ctx.lineTo(chartArea.right, y);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(text, left + boxWidth / 2, top + boxHeight / 2);
  ctx.restore();
}

export const priceMarkersPlugin = {
  id: "priceMarkers",

  afterDatasetsDraw(chart, args, opts) {
    if (!opts?.enabled) return;
    const datasetIndex = opts.datasetIndex ?? 0;
    const meta = chart.getDatasetMeta(datasetIndex);
    const values = chart.data.datasets?.[datasetIndex]?.data;
    if (!meta?.data?.length || !values?.length) return;

    const found = extremes(values);
    if (!found) return;
    const format = opts.format ?? ((v) => String(v));
    const { ctx, chartArea } = chart;

    if (opts.extremes !== false) {
      const hiPoint = meta.data[found.hiIndex];
      const loPoint = meta.data[found.loIndex];
      // A flat series puts the high and the low on the same point; one label
      // is honest there, two would just overprint each other.
      if (hiPoint) drawCallout(ctx, chartArea, hiPoint.x, hiPoint.y, format(found.hi), true, opts.color ?? MUTED);
      if (loPoint && found.loIndex !== found.hiIndex) {
        drawCallout(ctx, chartArea, loPoint.x, loPoint.y, format(found.lo), false, opts.color ?? MUTED);
      }
    }

    if (opts.last !== false) {
      let lastIndex = -1;
      for (let i = values.length - 1; i >= 0; i--) {
        if (values[i] != null && Number.isFinite(values[i])) {
          lastIndex = i;
          break;
        }
      }
      const point = lastIndex >= 0 ? meta.data[lastIndex] : null;
      if (point) drawLastTag(chart, point.y, format(values[lastIndex]), opts.lastColor ?? MUTED);
    }
  },
};
