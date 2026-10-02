// Column layout for the supply-chain map: the company in the middle, who
// supplies it on the left, who it sells to on the right, competitors along the
// bottom.
//
// The force layout answers "what shape is this neighbourhood". This one answers
// "which side of the company is this on", which is the question a terminal's
// supply-chain screen is built around - and it is the reason this is a plain
// placement rather than a simulation. Nothing here is iterative: a column is a
// sorted list, so the same company always lands in the same slot and the order
// down a column means something (strongest relationship first) instead of being
// wherever physics left it.

// Room for one dot and the caption under it. Both floors matter: MIN_ROW is
// what keeps a column of small dots from stacking their labels on each other,
// and the radius term is what stops two mega-caps from overlapping. The +18 is
// the caption - a label sits below its dot, so consecutive rows need the dot,
// the text and a gap between them.
import { clamp } from "./num.js";

const MIN_ROW = 30;
// The widest dot the map draws is 21 across the radius, so a row is allowed to
// grow to fit one with its caption - under that, the biggest companies would
// come out shrunk on a canvas with room to spare.
const MAX_ROW = 60;
// Below this a dot stops being something you can point at, so a column that
// tight keeps the size and drops its captions instead.
const MIN_RADIUS = 4;
const rowHeight = (node) => Math.max(MIN_ROW, (node.radius ?? 6) * 2 + 18);

// Horizontal room between one column of dots and the next, and between two
// lanes of the same column when it has to double up.
const COL_GAP = 155;
const LANE = 58;
// How far a column gap may be squeezed before extra lanes have to give way.
const MIN_GAP = 0.34;

const PAD_X = 20;
// The "Suppliers" and "Customers" captions sit over their columns rather than
// off in the corners, so the band has to start below them - far enough that the
// widest dot on the top row still clears the text.
const CAPTION_Y = 26;
const PAD_TOP = 56;
// Roughly half of "Suppliers" at caption size. Only used to keep the text on
// the canvas when a side's columns crowd an edge - a caption a little off its
// columns still reads, a clipped one does not.
const CAPTION_HALF = 52;

// The competitor row and the hub above it, measured up from the bottom edge.
// The gap clears the hub's own pill, and the row clears the captions under the
// dots sitting on it.
const PEER_ROW = 44;
const HUB_RISE = 76;
const PEER_STEP_MAX = 132;

const capOf = (node) => node.cap ?? 0;

// How strongly a node is tied to the company being mapped: the weight of the
// link it arrived on. It decides the order down the first column, so a
// company's main suppliers sit at the top of the list rather than wherever the
// alphabet put them.
function pullMap(edges, rootId) {
  const pull = new Map();
  for (const e of edges) {
    if (e.from === rootId) pull.set(e.to, Math.max(pull.get(e.to) ?? 0, e.weight ?? 2));
    if (e.to === rootId) pull.set(e.from, Math.max(pull.get(e.from) ?? 0, e.weight ?? 2));
  }
  return pull;
}

function neighbourMap(edges) {
  const adj = new Map();
  const add = (a, b) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a).push(b);
  };
  for (const e of edges) {
    add(e.from, e.to);
    add(e.to, e.from);
  }
  return adj;
}

// One side of the map: the suppliers, or the customers. `dir` is -1 for the
// left half and +1 for the right, and everything below is written once for
// both rather than mirrored by hand.
//
// Returns the middle of the columns it laid out, which is where that side's
// caption goes - over its companies rather than out at the canvas edge.
function placeSide(list, dir, ctx) {
  const { cx, top, bottom, span, pull, adj, placedY, out } = ctx;
  if (!list.length) return null;
  const usableH = Math.max(bottom - top, MIN_ROW);
  const mid = (top + bottom) / 2;

  const depths = [...new Set(list.map((n) => n.depth))].sort((a, b) => a - b);

  // Lanes first, because how wide a column ends up is what decides where the
  // next column starts. A column takes a second lane only when one lane of it
  // would not fit down the canvas - so a 3-supplier map keeps clean single
  // columns and a 40-supplier one doubles up instead of overlapping.
  //
  // The count comes from the total height the rows need rather than from
  // packing them, because the packing order isn't known yet: it depends on
  // where the previous column landed.
  const columns = depths.map((depth) => {
    const members = list.filter((n) => n.depth === depth);
    const stack = members.reduce((sum, n) => sum + rowHeight(n), 0);
    return { depth, members, stack, lanes: Math.max(1, Math.ceil(stack / usableH)) };
  });

  // A lane costs horizontal room the columns need too, and on a narrow canvas
  // there is not enough for both. A column given a second lane its side cannot
  // fit is just two dots drawn on top of each other, so lanes are capped at
  // what the width holds and the rows that no longer have one close up
  // vertically instead - dense, but still a column.
  const spare = Math.max(0, Math.floor((span - columns.length * COL_GAP * MIN_GAP) / LANE));
  let wanted = columns.reduce((sum, c) => sum + c.lanes - 1, 0);
  while (wanted > spare) {
    const widest = columns.reduce((a, b) => (b.lanes > a.lanes ? b : a));
    if (widest.lanes <= 1) break;
    widest.lanes--;
    wanted--;
  }
  for (const col of columns) col.target = col.stack / col.lanes;

  const total = columns.reduce((sum, c) => sum + COL_GAP + (c.lanes - 1) * LANE, 0);
  const scale = total > span ? span / total : 1;

  const laneStep = LANE * scale;
  let cursor = cx;
  let nearest = null;
  let furthest = null;
  for (const col of columns) {
    col.x = cursor + dir * COL_GAP * scale;
    cursor = col.x + dir * (col.lanes - 1) * laneStep;

    // The first column is ordered by how strong the relationship with the
    // centred company is. Every column after it is ordered by where its
    // partners in the previous column already sit, which is what keeps the
    // lines between columns from crossing into a braid.
    const ordered = [...col.members].sort((a, b) => {
      if (col.depth === 1) {
        return (pull.get(b.id) ?? 0) - (pull.get(a.id) ?? 0) || capOf(b) - capOf(a);
      }
      const ay = barycentre(a.id, adj, placedY);
      const by = barycentre(b.id, adj, placedY);
      if (ay == null && by == null) return capOf(b) - capOf(a);
      if (ay == null) return 1;
      if (by == null) return -1;
      return ay - by;
    });

    // Deal the column into its lanes in that order, filling each lane down the
    // canvas before starting the next, and splitting on height rather than on
    // a count so a lane of mega-caps holds fewer companies than a lane of
    // small suppliers.
    const lanesOf = [[]];
    let used = 0;
    for (const node of ordered) {
      const h = rowHeight(node);
      if (used > 0 && used + h / 2 > col.target && lanesOf.length < col.lanes) {
        lanesOf.push([]);
        used = 0;
      }
      lanesOf[lanesOf.length - 1].push(node);
      used += h;
    }

    lanesOf.forEach((members, laneIdx) => {
      if (!members.length) return;
      const x = col.x + dir * laneIdx * laneStep;
      nearest = nearest == null ? x : dir < 0 ? Math.max(nearest, x) : Math.min(nearest, x);
      furthest = furthest == null ? x : dir < 0 ? Math.min(furthest, x) : Math.max(furthest, x);
      // Spread the lane down the canvas rather than packing it tight, but
      // never past the band: a row pushed outside it would be clamped back to
      // the edge on top of its neighbour. `need` is the spacing two dots want
      // between them, and `room` is all there is - where they conflict the
      // band wins and the dots close up.
      const room = usableH / Math.max(members.length - 1, 1);
      const need = Math.max(...members.map(rowHeight));
      const step = Math.min(room, Math.max(need, Math.min(MAX_ROW, room)));
      // A lane with more companies than it has room for gets smaller dots
      // rather than overlapping ones. Dot size is market cap, so this is a
      // real loss - but a column of touching dots loses it too, and loses the
      // reading the view exists for on top.
      const cap = Math.max(MIN_RADIUS, (step - 18) / 2);
      const first = mid - (step * (members.length - 1)) / 2;
      members.forEach((node, i) => {
        const y = first + i * step;
        placedY.set(node.id, y);
        out.push({ id: node.id, x, y, radius: Math.min(node.radius ?? 6, cap) });
      });
    });
  }

  return nearest == null ? null : (nearest + furthest) / 2;
}

function barycentre(id, adj, placedY) {
  const ys = (adj.get(id) ?? []).map((other) => placedY.get(other)).filter((y) => y != null);
  if (!ys.length) return null;
  return ys.reduce((a, b) => a + b, 0) / ys.length;
}

// Returns the placed nodes, where each side's caption belongs, and where the
// competitors hub goes. The map draws those last two itself - they are captions
// for a part of the canvas, not companies.
export function flowLayout(nodes, edges, options = {}) {
  const { width = 900, height = 640, rootId = null } = options;
  if (!nodes.length) return { placed: [], axes: null, hub: null };

  const root = nodes.find((n) => n.id === rootId) ?? nodes[0];
  const peers = nodes.filter((n) => n.side === "peer");
  const ups = nodes.filter((n) => n.side === "up");
  const downs = nodes.filter((n) => n.side === "down");
  // Anything the walk left without a side - there shouldn't be much - reads as
  // a supplier rather than being dropped off the canvas.
  const strays = nodes.filter(
    (n) => n !== root && n.side !== "peer" && n.side !== "up" && n.side !== "down"
  );

  const cx = width / 2;
  const peerY = peers.length ? height - PEER_ROW : height;
  const hubY = peers.length ? peerY - HUB_RISE : null;
  const top = PAD_TOP;
  // Without a competitor row the columns run most of the way down, stopping
  // short of the edge by enough for the bottom row's captions.
  const bottom = peers.length ? Math.max(hubY - 40, top + MIN_ROW) : height - 34;

  const out = [{ id: root.id, x: cx, y: (top + bottom) / 2, radius: root.radius }];
  const ctx = {
    cx,
    top,
    bottom,
    span: Math.max(cx - PAD_X - 34, COL_GAP),
    pull: pullMap(edges, root.id),
    adj: neighbourMap(edges),
    placedY: new Map([[root.id, (top + bottom) / 2]]),
    out,
  };

  const onCanvas = (x) =>
    x == null ? null : clamp(x, CAPTION_HALF + 6, width - CAPTION_HALF - 6);
  const axes = {
    up: onCanvas(placeSide([...ups, ...strays], -1, ctx)),
    down: onCanvas(placeSide(downs, 1, ctx)),
    y: CAPTION_Y,
  };

  if (peers.length) {
    const step = Math.min(PEER_STEP_MAX, (width - PAD_X * 2) / peers.length);
    // Biggest in the middle, under the hub, working outwards - the row has no
    // depth to read, so size is the only order it can carry.
    const ordered = [...peers].sort((a, b) => capOf(b) - capOf(a));
    const seats = ordered
      .map((_, i) => i - (peers.length - 1) / 2)
      .sort((a, b) => Math.abs(a) - Math.abs(b) || a - b);
    const cap = Math.max(MIN_RADIUS, step / 2 - 5);
    ordered.forEach((node, i) => {
      out.push({
        id: node.id,
        x: cx + seats[i] * step,
        y: peerY,
        radius: Math.min(node.radius ?? 6, cap),
      });
    });
  }

  return {
    placed: out,
    axes,
    hub: peers.length ? { x: cx, y: hubY, count: peers.length } : null,
  };
}
