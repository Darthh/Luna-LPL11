// Self-check for the metric scatter's axis window: `node scripts/test-scatter-axis.mjs`.
//
// This is the one piece of that page that can be wrong without looking wrong.
// A window that quietly excludes half the companies still draws a perfectly
// convincing scatter - the dots that would have contradicted it are simply not
// there - so what's pinned down here is the two ways that happens: a long tail
// dragging every other company onto the axis line, and a trim so eager it cuts
// the company someone opened the chart to find.
import assert from "node:assert/strict";
import { axisRange, formatMetric, topFrontier, typedRange } from "../lib/scatterMetrics.js";

// Roughly the shape these fundamentals actually have: a tight middle, a modest
// spread, and one or two names off on their own.
const bulk = Array.from({ length: 60 }, (_, i) => 5 + (i % 30));
const withTail = [...bulk, 85, 251, 346, 684];

// The tail must not set the ceiling. Untrimmed, 684 would put the median at
// about 2% of the axis height.
{
  const trimmed = axisRange(withTail, true);
  const full = axisRange(withTail, false);
  assert.ok(trimmed.max < 200, `tail should be cut, got ${trimmed.max}`);
  assert.ok(full.max >= 684, `untrimmed must reach the tail, got ${full.max}`);
  assert.ok(full.max > trimmed.max, "trimming must narrow the window");
}

// ...but the near tail stays. A plain Tukey fence on this data cuts at ~50 and
// would drop the 85 - the p95 widening is what keeps it, and dropping that
// widening is exactly the regression this asserts against.
{
  const { min, max } = axisRange(withTail, true);
  assert.ok(85 <= max, `the 85 should stay on the chart, ceiling was ${max}`);
  assert.ok(min <= 5, "the bottom of the bulk must stay on the chart");
}

// Bounds land on round numbers - an axis reading "99.3%" is the bug this
// rounding exists to prevent.
{
  const { min, max } = axisRange([...bulk, 99.3], true);
  const round = (v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6;
  assert.ok(round(min) && round(max), `ragged bounds: ${min}..${max}`);
  assert.equal(min, Math.round(min), `min should be whole here, got ${min}`);
}

// Never narrower than the data above zero when nothing is being trimmed:
// every point that the floor doesn't cut has to be inside the window.
{
  const values = [0, 12, 33, 80];
  const { min, max } = axisRange(values, false);
  for (const v of values) {
    assert.ok(v >= min && v <= max, `${v} fell outside ${min}..${max}`);
  }
}

// The floor is zero, whichever way the outlier toggle is set. -6808 is a real
// Nasdaq 100 operating margin; the negative end of these axes is a couple of
// loss-making names strung along a stretch of empty chart.
{
  const margins = [...Array.from({ length: 60 }, (_, i) => i % 40), -6808, -5];
  assert.equal(axisRange(margins, true).min, 0, "trimmed axis starts at zero");
  assert.equal(axisRange(margins, false).min, 0, "untrimmed axis starts at zero too");
  assert.equal(axisRange([-30, -12, 5, 18, 44], false).min, 0, "a short series too");
}

// ...but a series with nothing above zero keeps its own floor, because a floor
// of zero there leaves no range at all and draws nothing.
{
  const range = axisRange([-40, -22, -9, -3], false);
  assert.ok(range && range.min < 0, `all-negative series needs its own floor, got ${range?.min}`);
  assert.ok(range.max >= -3, "and has to still reach its top");
}

// Roughly the top fifth of the companies above the line, and the line falling
// left to right. A frontier that quietly leaves half the chart above it is
// still a convincing diagonal, which is why this is asserted rather than eyed.
{
  // A spread of companies with no particular correlation between the axes.
  const points = Array.from({ length: 100 }, (_, i) => ({
    x: (i * 37) % 100,
    y: (i * 61) % 80,
  }));
  const line = topFrontier(points, 0.2);
  assert.ok(line, "a hundred companies should produce a frontier");
  assert.ok(line.to.x > line.from.x && line.to.y < line.from.y, "the line must fall to the right");

  // Above the line is the upper-right side of it, which is the sign of the
  // cross product. Scaling either axis by a positive factor can't change it,
  // so this reads the same in data units as it does in pixels.
  const dx = line.to.x - line.from.x;
  const dy = line.to.y - line.from.y;
  const above = points.filter(
    (p) => dx * (p.y - line.from.y) - dy * (p.x - line.from.x) > 0
  ).length;
  assert.ok(above >= 15 && above <= 25, `expected ~20 companies above the line, got ${above}`);

  // The same companies whichever window they're viewed in: the line is scored
  // off the companies, not off the axes.
  const zoomed = topFrontier(points.filter((p) => p.x >= 0), 0.2);
  assert.deepEqual(zoomed, line, "the frontier must not move when the view does");

  // Half the chart, when asked for half.
  const half = topFrontier(points, 0.5);
  const hdx = half.to.x - half.from.x;
  const hdy = half.to.y - half.from.y;
  const over = points.filter(
    (p) => hdx * (p.y - half.from.y) - hdy * (p.x - half.from.x) > 0
  ).length;
  assert.ok(over >= 45 && over <= 55, `expected ~50 above the median line, got ${over}`);

  assert.equal(topFrontier([{ x: 1, y: 2 }, { x: 3, y: 4 }], 0.2), null, "too few to score");
  // A metric where nine in ten companies report the same figure has no spread.
  const flat = Array.from({ length: 40 }, () => ({ x: 5, y: 5 }));
  assert.equal(topFrontier(flat, 0.2), null, "a flat metric has no frontier");
}

// Too few points to have a distribution: left alone rather than quartiled.
{
  const few = [1, 2, 3, 400];
  const { max } = axisRange(few, true);
  assert.ok(max >= 400, "a handful of points must not be trimmed");
  assert.equal(axisRange([7], true), null, "one point has no range");
  assert.equal(axisRange([5, 5, 5], true), null, "a flat series has no range");
}

// Small magnitudes get small steps - a PEG axis must not round to 0..10.
{
  const pegs = Array.from({ length: 40 }, (_, i) => 0.2 + i * 0.05);
  const { max } = axisRange(pegs, true);
  assert.ok(max <= 3, `PEG ceiling should stay tight, got ${max}`);
}

// Typed bounds. The chart going blank is the failure mode here, so what's
// asserted is that every partial or backwards entry falls back to the computed
// window rather than producing one nothing can be drawn in.
{
  const auto = { min: 0, max: 80 };
  assert.deepEqual(typedRange(auto, "10", "50"), { min: 10, max: 50 }, "both bounds");
  assert.deepEqual(typedRange(auto, "10", ""), { min: 10, max: 80 }, "empty max keeps the computed one");
  assert.deepEqual(typedRange(auto, "  ", "  "), auto, "two empty boxes are the auto range");
  // Half-typed entries are ignored on their own side only - the box that does
  // hold a number keeps working while the other is still being typed.
  assert.deepEqual(typedRange(auto, "-", "50"), { min: 0, max: 50 }, "a lone minus sign is not a bound");
  assert.deepEqual(typedRange(auto, "60", "50"), auto, "backwards bounds are refused");
  assert.deepEqual(typedRange(auto, "50", "50"), auto, "a zero-width window is refused");
  assert.deepEqual(typedRange(auto, "-30", "-5"), { min: -30, max: -5 }, "negatives are bounds");
  assert.deepEqual(typedRange(auto, "0", "0.5"), { min: 0, max: 0.5 }, "zero is a bound, not empty");
  // Fewer than two points means no computed range at all; a full pair still
  // has to work, and a half pair has nothing to complete itself from.
  assert.deepEqual(typedRange(null, "1", "9"), { min: 1, max: 9 }, "typed over no computed range");
  assert.equal(typedRange(null, "1", ""), null, "half a pair over no range stays unset");
}

// Units, since the axis ticks and the tooltip both read through this.
assert.equal(formatMetric(65.596, "%"), "65.6%");
assert.equal(formatMetric(30.789877, "x"), "30.79×");
assert.equal(formatMetric(4862365925376, "$"), "$4.86T");
assert.equal(formatMetric(null, "%"), "n/a");
assert.equal(formatMetric(Infinity, "x"), "n/a");

console.log("scatter axis ok");
