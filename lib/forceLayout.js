// A small force-directed layout for the supply-chain graph.
//
// Hand-rolled for the same reason the treemap is: the graphs here are tens of
// nodes, not thousands, so the O(n²) repulsion every real library avoids costs
// nothing at this size and saves pulling d3 in for one screen.
//
// Three forces, the standard set:
//   · every pair pushes apart (Coulomb), which stops nodes piling up
//   · every edge pulls together (Hooke), which is what makes clusters
//   · everything drifts toward the middle, which stops disconnected pieces
//     sailing off the canvas
//
// The run is deterministic - seeded start positions, fixed iteration count -
// so the same company always lays out the same way. A graph that reshuffles
// itself on every search is much harder to read than a slightly worse one that
// holds still.

// Mulberry32: tiny seeded PRNG, so "random" start positions are reproducible.
import { clamp } from "./num.js";

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

export function layoutGraph(nodes, edges, options = {}) {
  const {
    width = 900,
    height = 620,
    iterations = 460,
    // Roughly how far apart two unconnected nodes want to sit.
    spacing = 46,
    rootId = null,
  } = options;

  if (!nodes.length) return [];

  const n = nodes.length;
  const cx = width / 2;
  const cy = height / 2;
  const random = rng(hash(rootId ?? nodes[0].id));

  // Start on rings by depth: the root in the middle, its direct partners
  // around it, the next hop outside them. The simulation refines this, but
  // starting close to the answer keeps it from having to untangle itself and
  // makes the final picture read as tiers.
  const maxDepth = Math.max(1, ...nodes.map((d) => d.depth));
  const index = new Map();
  const bodies = nodes.map((node, i) => {
    index.set(node.id, i);
    const ring = (node.depth / (maxDepth + 0.35)) * Math.min(width, height) * 0.46;
    // Upstream fans left, downstream fans right, so goods read as flowing
    // across the canvas rather than swirling.
    const bias = node.side === "up" ? Math.PI : node.side === "down" ? 0 : 0;
    const spread = node.side === "root" ? Math.PI * 2 : Math.PI * 0.9;
    const angle = bias + (random() - 0.5) * spread;
    return {
      id: node.id,
      x: cx + Math.cos(angle) * ring + (random() - 0.5) * 12,
      y: cy + Math.sin(angle) * ring + (random() - 0.5) * 12,
      vx: 0,
      vy: 0,
      // The root is heavy and the well-connected are heavier, so hubs hold the
      // middle and the long tail swings around them.
      mass: 1 + Math.min(node.degree, 12) * 0.22 + (node.id === rootId ? 6 : 0),
      radius: node.radius ?? 6,
    };
  });

  const springs = edges
    .map((e) => ({ a: index.get(e.from), b: index.get(e.to), weight: e.weight ?? 2 }))
    .filter((s) => s.a != null && s.b != null);

  const repulsion = spacing * spacing * 5.2;
  const centerPull = 0.0055;

  for (let step = 0; step < iterations; step++) {
    // Cooling: big moves early to find the shape, small ones late to settle.
    const alpha = Math.max(0.02, 1 - step / iterations) ** 1.6;

    for (let i = 0; i < n; i++) {
      const a = bodies[i];
      for (let j = i + 1; j < n; j++) {
        const b = bodies[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist2 = dx * dx + dy * dy;
        // Two nodes exactly on top of each other have no direction to separate
        // along, so nudge them apart deterministically.
        if (dist2 < 0.01) {
          dx = (i - j) * 0.1 + 0.05;
          dy = 0.05;
          dist2 = dx * dx + dy * dy;
        }
        const dist = Math.sqrt(dist2);
        const force = repulsion / dist2;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx -= fx / a.mass;
        a.vy -= fy / a.mass;
        b.vx += fx / b.mass;
        b.vy += fy / b.mass;
      }
    }

    for (const s of springs) {
      const a = bodies[s.a];
      const b = bodies[s.b];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.01;
      // A stronger relationship sits closer, which is what puts a company's
      // primary suppliers nearest it.
      const rest = spacing * (2.6 - s.weight * 0.35);
      const force = (dist - rest) * 0.045 * (0.6 + s.weight * 0.2);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx / a.mass;
      a.vy += fy / a.mass;
      b.vx -= fx / b.mass;
      b.vy -= fy / b.mass;
    }

    for (const body of bodies) {
      body.vx += (cx - body.x) * centerPull;
      body.vy += (cy - body.y) * centerPull;
      body.x += body.vx * alpha;
      body.y += body.vy * alpha;
      // Friction, or the whole thing oscillates forever.
      body.vx *= 0.82;
      body.vy *= 0.82;
    }
  }

  // Scale the settled cloud to fill the canvas: the simulation's absolute
  // size depends on node count, so without this a small graph sits in a
  // postage stamp in the middle and a big one runs off the edges.
  const pad = 46;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const b of bodies) {
    minX = Math.min(minX, b.x);
    maxX = Math.max(maxX, b.x);
    minY = Math.min(minY, b.y);
    maxY = Math.max(maxY, b.y);
  }
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const fitX = Math.min((width - pad * 2) / spanX, 2.4);
  const fitY = Math.min((height - pad * 2) / spanY, 2.4);
  // A uniform fit leaves a tall narrow canvas - a phone - with the whole
  // graph in a puddle in the middle and dead space above and below. Stretching
  // the other way fills it, but only so far: past about a third the edge
  // lengths stop reading as distances, so the stretch is capped and the rest
  // of the space is simply left alone.
  const MAX_STRETCH = 1.35;
  const base = Math.min(fitX, fitY);
  const scaleX = Math.min(fitX, base * MAX_STRETCH);
  const scaleY = Math.min(fitY, base * MAX_STRETCH);
  const offX = cx - ((minX + maxX) / 2) * scaleX;
  const offY = cy - ((minY + maxY) / 2) * scaleY;

  const placed = bodies.map((b) => ({
    id: b.id,
    x: b.x * scaleX + offX,
    y: b.y * scaleY + offY,
    radius: b.radius,
  }));

  // Separate overlapping dots, in final screen coordinates.
  //
  // This runs after the fit rather than inside the simulation because the fit
  // is what decides how big the cloud ends up: resolving overlaps in layout
  // space and then scaling the whole thing down by 0.7 puts them straight
  // back. Once dot size means market cap the overlaps matter - a mega-cap
  // swallows its neighbours whole - so a few relaxation passes push each
  // overlapping pair apart by half the overlap each, which converges quickly
  // because the simulation has already done the real work.
  const GAP = 2.5;
  for (let pass = 0; pass < 26; pass++) {
    let moved = false;
    for (let i = 0; i < placed.length; i++) {
      const a = placed[i];
      for (let j = i + 1; j < placed.length; j++) {
        const b = placed[j];
        const min = a.radius + b.radius + GAP;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        if (dist >= min) continue;
        if (dist < 0.01) {
          dx = (i - j) * 0.1 + 0.05;
          dy = 0.05;
          dist = Math.hypot(dx, dy);
        }
        const push = ((min - dist) / dist) * 0.5;
        a.x -= dx * push;
        a.y -= dy * push;
        b.x += dx * push;
        b.y += dy * push;
        moved = true;
      }
    }
    if (!moved) break;
  }

  // Separation can walk a dot off the canvas; bring it back inside, label
  // room included.
  for (const p of placed) {
    p.x = clamp(p.x, p.radius + 4, width - p.radius - 4);
    p.y = clamp(p.y, p.radius + 4, height - p.radius - 12);
  }

  return placed.map((p) => ({ id: p.id, x: p.x, y: p.y }));
}
