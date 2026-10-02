"use client";

import { useEffect, useRef } from "react";
import { cssVar, hexToRgba } from "@/lib/cssVar";

// The canvas backgrounds. Each entry is handed the current canvas state and
// returns the function that draws one frame; the harness at the bottom owns
// the canvas, DPR scaling, resize and the animation loop, so an effect is only
// its own maths. Effects are rebuilt on resize, which is also how each one
// seeds its particles.
//
// Colour is whatever the theme set --bg-effect-color to, falling back to its
// accent. The fallback is done here rather than by defining the variable as
// `var(--accent)` in CSS: getComputedStyle hands an unresolved `var(--accent)`
// back for a custom property written that way, and assigning that to fillStyle
// is a silent no-op that leaves the effect drawing in black. Overall strength
// is --bg-effect-intensity, applied as canvas opacity in CSS, not read here.
//
// "dots" and "synapse" also have a static CSS layer in globals.css; the
// patterns not listed here (none, dots) are CSS-only and render no canvas.

const rand = (a, b) => a + Math.random() * (b - a);

// Value noise, smoothed - enough for a flow field, and cheaper than importing
// a Perlin implementation for one effect.
function noise2d(x, y) {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}
function smoothNoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const a = noise2d(ix, iy);
  const b = noise2d(ix + 1, iy);
  const c = noise2d(ix, iy + 1);
  const d = noise2d(ix + 1, iy + 1);
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

const EFFECTS = {
  // Drifting stars that draw a line to every near neighbour.
  // Half again as many stars as the other effects carry, over a wider connect
  // radius, so the figures they trace are the point of the layer rather than a
  // texture behind it.
  constellations({ ctx, W, H, color }) {
    const CONNECT = 150;
    const stars = Array.from({ length: 75 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: rand(-0.075, 0.075),
      vy: rand(-0.075, 0.075),
      r: rand(0.8, 1.6),
      phase: Math.random() * Math.PI * 2,
    }));

    return (t) => {
      ctx.clearRect(0, 0, W, H);
      const c = color();

      for (const s of stars) {
        s.x = (s.x + s.vx + W) % W;
        s.y = (s.y + s.vy + H) % H;
      }

      ctx.strokeStyle = c;
      ctx.lineWidth = 0.5;
      for (let i = 0; i < stars.length; i++) {
        for (let j = i + 1; j < stars.length; j++) {
          const dx = stars[i].x - stars[j].x;
          const dy = stars[i].y - stars[j].y;
          const dist = Math.hypot(dx, dy);
          if (dist >= CONNECT) continue;
          ctx.globalAlpha = (1 - dist / CONNECT) * 0.28;
          ctx.beginPath();
          ctx.moveTo(stars[i].x, stars[i].y);
          ctx.lineTo(stars[j].x, stars[j].y);
          ctx.stroke();
        }
      }

      ctx.fillStyle = c;
      for (const s of stars) {
        const twinkle = 0.5 + 0.5 * Math.sin(t * 0.02 + s.phase);
        ctx.globalAlpha = 0.28 + twinkle * 0.38;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
  },

  // Thin vertical streaks, each fading out behind its head.
  rain({ ctx, W, H, color }) {
    const MAX = 130;
    const drops = [];
    const spawn = () => {
      const len = rand(20, 60);
      drops.push({ x: Math.random() * W, y: -len, len, speed: rand(4, 12), alpha: rand(0.32, 0.6) });
    };

    return () => {
      ctx.clearRect(0, 0, W, H);
      const c = color();
      if (drops.length < MAX && Math.random() < 0.6) spawn();

      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.y += d.speed;
        if (d.y > H + d.len) {
          drops.splice(i, 1);
          continue;
        }
        const grad = ctx.createLinearGradient(d.x, d.y - d.len, d.x, d.y);
        grad.addColorStop(0, "transparent");
        grad.addColorStop(1, c);
        ctx.strokeStyle = grad;
        ctx.globalAlpha = d.alpha;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y - d.len);
        ctx.lineTo(d.x, d.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };
  },

  // Pulses racing along the CSS grid drawn behind them.
  synapse({ ctx, W, H, color }) {
    const GRID = 24;
    const TRAIL = 12;
    const MAX = 20;
    const cols = Math.ceil(W / GRID);
    const rows = Math.ceil(H / GRID);
    const pulses = [];
    const spawn = () => {
      const speed = rand(2, 22);
      if (Math.random() > 0.5) {
        pulses.push({ x: -TRAIL, y: Math.floor(Math.random() * (rows + 1)) * GRID, dx: speed, dy: 0 });
      } else {
        pulses.push({ x: Math.floor(Math.random() * (cols + 1)) * GRID, y: -TRAIL, dx: 0, dy: speed });
      }
    };

    return () => {
      ctx.clearRect(0, 0, W, H);
      const c = color();
      if (pulses.length < MAX && Math.random() < 0.12) spawn();

      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i];
        p.x += p.dx;
        p.y += p.dy;
        if (p.x > W + TRAIL || p.y > H + TRAIL) {
          pulses.splice(i, 1);
          continue;
        }
        const tx = p.x - (p.dx > 0 ? TRAIL : 0);
        const ty = p.y - (p.dy > 0 ? TRAIL : 0);
        const grad = ctx.createLinearGradient(tx, ty, p.x, p.y);
        grad.addColorStop(0, "transparent");
        grad.addColorStop(1, c);
        ctx.strokeStyle = grad;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();

        ctx.globalAlpha = 0.55;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
  },

  // Particles steered by a noise field, smeared by never fully clearing.
  "perlin-flow"({ ctx, W, H, color, bg }) {
    const particles = Array.from({ length: 200 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      life: Math.random(),
    }));

    return (t) => {
      // Wash the previous frame toward the page background instead of
      // clearing, which is what leaves the trails.
      ctx.fillStyle = hexToRgba(bg(), 0.02);
      ctx.fillRect(0, 0, W, H);
      const c = color();
      ctx.fillStyle = c;

      for (const p of particles) {
        const angle = smoothNoise(p.x * 0.004 + t * 0.0008, p.y * 0.004 + 100) * Math.PI * 6;
        const speed = 1 + smoothNoise(p.x * 0.003, p.y * 0.003 + 50) * 1.5;
        p.x += Math.cos(angle) * speed;
        p.y += Math.sin(angle) * speed;
        p.life -= 0.001;
        if (p.life <= 0 || p.x < 0 || p.x > W || p.y < 0 || p.y > H) {
          p.x = Math.random() * W;
          p.y = Math.random() * H;
          p.life = 1;
        }
        ctx.globalAlpha = p.life * 0.15;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
  },

  // Petals falling on a sine drift.
  petals({ ctx, W, H, color }) {
    const make = () => ({
      x: Math.random() * W,
      y: rand(-50, -10),
      size: rand(3, 8),
      rot: Math.random() * Math.PI * 2,
      vr: rand(-0.015, 0.015),
      vy: rand(0.3, 0.9),
      drift: Math.random() * Math.PI * 2,
      driftSpeed: rand(0.008, 0.02),
      wobble: rand(0.3, 1.1),
    });
    const petals = Array.from({ length: 30 }, () => ({ ...make(), y: Math.random() * H }));

    return () => {
      ctx.clearRect(0, 0, W, H);
      const c = color();
      ctx.fillStyle = c;
      for (const p of petals) {
        p.y += p.vy;
        p.rot += p.vr;
        p.drift += p.driftSpeed;
        p.x += Math.sin(p.drift) * p.wobble;
        if (p.y > H + 15) Object.assign(p, make());

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        // Two overlapping ellipses read as a petal turning in the air.
        ctx.globalAlpha = 0.2;
        ctx.beginPath();
        ctx.ellipse(-p.size * 0.2, 0, p.size * 0.6, p.size * 0.3, 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.15;
        ctx.beginPath();
        ctx.ellipse(p.size * 0.2, 0, p.size * 0.6, p.size * 0.3, -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    };
  },

  // Four-point stars pulsing in and out.
  sparkles({ ctx, W, H, color }) {
    const make = () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      size: rand(2, 7),
      phase: Math.random() * Math.PI * 2,
      speed: rand(0.015, 0.045),
      life: rand(0.5, 1),
    });
    const sparks = Array.from({ length: 35 }, make);

    return () => {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = color();
      for (const s of sparks) {
        s.phase += s.speed;
        const twinkle = Math.max(0, Math.sin(s.phase));
        const alpha = twinkle * 0.25 * s.life;
        if (alpha > 0.01) {
          const r = s.size * (0.5 + twinkle * 0.5);
          ctx.save();
          ctx.translate(s.x, s.y);
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.moveTo(0, -r);
          ctx.quadraticCurveTo(r * 0.15, -r * 0.15, r, 0);
          ctx.quadraticCurveTo(r * 0.15, r * 0.15, 0, r);
          ctx.quadraticCurveTo(-r * 0.15, r * 0.15, -r, 0);
          ctx.quadraticCurveTo(-r * 0.15, -r * 0.15, 0, -r);
          ctx.fill();
          ctx.restore();
        }
        if (s.phase > Math.PI * 6) Object.assign(s, make());
      }
      ctx.globalAlpha = 1;
    };
  },

  // Glowing motes rising off the bottom edge, in bursts.
  embers({ ctx, W, H, color }) {
    const make = () => ({
      x: Math.random() * W,
      y: H + Math.random() * 40,
      vx: rand(-0.15, 0.15),
      vy: rand(-1.1, -0.3),
      r: rand(0.3, 0.9),
      life: 0,
      maxLife: rand(220, 440),
      wobble: Math.random() * Math.PI * 2,
    });
    const embers = Array.from({ length: 60 }, () => {
      const e = make();
      e.y = Math.random() * H;
      e.life = Math.random() * e.maxLife;
      return e;
    });

    return () => {
      // destination-out keeps the canvas transparent where nothing is burning,
      // so the page background still shows through.
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";

      const c = color();
      for (let i = embers.length - 1; i >= 0; i--) {
        const e = embers[i];
        e.wobble += 0.03;
        e.x += e.vx + Math.sin(e.wobble) * 0.5;
        e.y += e.vy;
        e.life++;
        if (e.life > e.maxLife || e.y < -20) {
          embers.splice(i, 1);
          if (embers.length < 70) embers.push(make());
          continue;
        }
        const ratio = e.life / e.maxLife;
        const fade = Math.min(1, ratio * 4, (1 - ratio) * 3);
        const spark = Math.random() < 0.003;
        const r = e.r * (spark ? 2.4 : 1);
        const a = (spark ? 0.9 : 0.55) * fade;

        const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r * 4);
        g.addColorStop(0, hexToRgba(c, a));
        g.addColorStop(0.4, hexToRgba(c, a * 0.3));
        g.addColorStop(1, hexToRgba(c, 0));
        ctx.fillStyle = g;
        ctx.fillRect(e.x - r * 4, e.y - r * 4, r * 8, r * 8);

        ctx.fillStyle = `rgba(255,255,255,${a * 0.6})`;
        ctx.beginPath();
        ctx.arc(e.x, e.y, r * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }

      if (Math.random() < 0.015) {
        const bx = Math.random() * W;
        for (let i = 0; i < 5; i++) {
          const e = make();
          e.x = bx + rand(-20, 20);
          e.y = H - 10;
          e.vy *= 1.5;
          embers.push(e);
        }
      }
      ctx.globalCompositeOperation = "source-over";
    };
  },
};

export default function BackgroundEffects({ pattern }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const build = EFFECTS[pattern];
    if (!build) return;
    // No prefers-reduced-motion check: picking a background out of the settings
    // dropdown is itself the request for motion, and "None" is the first option
    // in that list for anyone who doesn't want it.
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let draw;
    let raf;
    let frame = 0;

    function resize() {
      const W = window.innerWidth;
      const H = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      draw = build({
        ctx,
        W,
        H,
        color: () => cssVar("--bg-effect-color") || cssVar("--accent") || "#18a999",
        bg: () => cssVar("--bg") || "#000000",
      });
    }
    resize();
    window.addEventListener("resize", resize);

    function tick() {
      raf = requestAnimationFrame(tick);
      draw(++frame);
    }
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [pattern]);

  if (!EFFECTS[pattern]) return null;
  return <canvas ref={canvasRef} aria-hidden="true" className="bg-effect-canvas" />;
}
