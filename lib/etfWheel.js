// Layout math for the ETF holdings donut. Pure geometry, no React: given a
// weight-ranked holdings list it returns the wedges to draw and where each
// label sits, choosing how many holdings to name so every label lands inside
// the frame.

export const W = 920;
export const H = 620;
export const CX = W / 2;
export const CY = H / 2;
const R_OUT = 180;
const R_IN = 102;
export const LABEL_X = 250; // horizontal offset from center where labels sit

// Each label is two lines of text (~31px tall), so this leaves real air
// between neighbours rather than butting them together.
const LABEL_GAP = 44;
// Labels must stay inside these bounds; a stack that can't is what "doesn't
// fit" means.
const LABEL_TOP = 26;
const LABEL_BOTTOM = H - 26;

// Upper bound on labeled slices; broad-market funds settle well below this
// because the wheel only labels as many as fit cleanly.
const MAX_WEDGES = 20;
// A holding below this weight isn't worth its own slice - it rolls into
// "Other" rather than crowding the wheel with names too small to matter.
const MIN_WEDGE_PCT = 1;

const COLORS = [
  "#4f6df5", "#f5a623", "#9b59f6", "#2fbf9b", "#f65f8e",
  "#37a2eb", "#f6c744", "#7ed957", "#e8825a", "#5fd4f5",
  "#c95ff5", "#f57d5f", "#4fc3a1", "#f56da6", "#8a97f5",
  "#d4b95f", "#67e0c4", "#f59e6d", "#b5d95f", "#6db3f5",
];
const OTHER_COLOR = "#565d6e";

const polar = (r, a) => [CX + r * Math.cos(a), CY + r * Math.sin(a)];

// Donut wedge from angle a0 to a1 (radians, clockwise, y-down).
export function wedgePath(a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = polar(R_OUT, a0);
  const [x1, y1] = polar(R_OUT, a1);
  const [x2, y2] = polar(R_IN, a1);
  const [x3, y3] = polar(R_IN, a0);
  return [
    `M ${x0} ${y0}`,
    `A ${R_OUT} ${R_OUT} 0 ${large} 1 ${x1} ${y1}`,
    `L ${x2} ${y2}`,
    `A ${R_IN} ${R_IN} 0 ${large} 0 ${x3} ${y3}`,
    "Z",
  ].join(" ");
}

// Nudge one side's labels apart so they never overlap: forward pass pushes
// down from the top bound, backward pass pulls back up if the stack ran past
// the bottom. `fits` is false when the stack is taller than the frame, i.e.
// this side is carrying more labels than the picture can hold.
function spreadLabels(items) {
  const sorted = [...items].sort((a, b) => a.y - b.y);
  let floor = LABEL_TOP;
  for (const item of sorted) {
    item.y = Math.max(item.y, floor);
    floor = item.y + LABEL_GAP;
  }
  if (sorted.length && sorted[sorted.length - 1].y > LABEL_BOTTOM) {
    let ceil = LABEL_BOTTOM;
    for (let i = sorted.length - 1; i >= 0; i--) {
      sorted[i].y = Math.min(sorted[i].y, ceil);
      ceil = sorted[i].y - LABEL_GAP;
    }
  }
  return { items: sorted, fits: !sorted.length || sorted[0].y >= LABEL_TOP - 0.5 };
}

// Lays out a donut of the top `count` holdings plus an "Other" remainder,
// reporting whether every label landed inside the frame.
function buildWheel(ranked, count) {
  const shown = ranked.slice(0, count);
  const otherPct = Math.max(0, 100 - shown.reduce((a, h) => a + h.percent, 0));

  const wedges = shown.map((h, i) => ({ ...h, color: COLORS[i % COLORS.length] }));
  if (otherPct >= 0.05) {
    wedges.push({ symbol: null, name: "Other", percent: otherPct, color: OTHER_COLOR });
  }

  // Slices start at 12 o'clock and run clockwise, biggest first.
  const total = wedges.reduce((a, w) => a + w.percent, 0) || 1;
  const slices = [];
  for (let i = 0, angle = -Math.PI / 2; i < wedges.length; i++) {
    const w = wedges[i];
    const span = (w.percent / total) * Math.PI * 2;
    slices.push({ ...w, a0: angle, a1: angle + span, mid: angle + span / 2 });
    angle += span;
  }

  const left = [];
  const right = [];
  for (const s of slices) {
    const onRight = Math.cos(s.mid) >= 0;
    const [ax, ay] = polar(R_OUT + 6, s.mid);
    const label = { slice: s, ax, ay, y: CY + (R_OUT + 42) * Math.sin(s.mid), right: onRight };
    (onRight ? right : left).push(label);
  }
  const spreadLeft = spreadLabels(left);
  const spreadRight = spreadLabels(right);
  return {
    slices,
    labels: [...spreadLeft.items, ...spreadRight.items],
    namedCount: shown.length,
    fits: spreadLeft.fits && spreadRight.fits,
  };
}

// Show as many holdings as the picture can label cleanly, no more: drop the
// smallest into "Other" until every label fits inside the frame. A
// concentrated fund like SOXX keeps ~20 names; a broad one like SPY, whose
// tail is hundreds of sub-1% positions, settles on its top handful.
export function layoutWheel(holdings) {
  const ranked = holdings.filter((h) => h.percent != null && h.percent >= MIN_WEDGE_PCT);
  if (!ranked.length) return null;
  let candidate = null;
  for (let n = Math.min(ranked.length, MAX_WEDGES); n >= 1; n--) {
    candidate = buildWheel(ranked, n);
    if (candidate.fits) break;
  }
  return candidate;
}
