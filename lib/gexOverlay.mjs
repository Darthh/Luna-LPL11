// Keep gaps and rank changes explicit so neither presentation implies continuity.
export function gexOverlayRuns(points, levels, cadence) {
  const sorted = [...levels].sort((a, b) => a.t - b.t);
  const runs = [];
  const active = [null, null];
  let cursor = -1;
  points.forEach((point, index) => {
    while (cursor + 1 < sorted.length && sorted[cursor + 1].t <= point.t + cadence / 2) cursor++;
    const level = sorted[cursor];
    const stale = !level || point.t - level.t > Math.max(300, cadence * 2);
    ["strike", "secondStrike"].forEach((field, rank) => {
      const strike = level?.[field];
      if (stale || !Number.isFinite(strike)) {
        active[rank] = null;
        return;
      }
      if (!active[rank] || active[rank].strike !== strike || (index && point.t - points[index - 1].t > cadence * 2)) {
        active[rank] = { rank, strike, samples: [] };
        runs.push(active[rank]);
      }
      active[rank].samples.push({ index, value: level[rank ? "secondNetGex" : "netGex"] });
    });
  });
  return runs;
}

export function drawGexOverlay(ctx, runs, { style, xAt, priceY, left, right, candleWidth, slot }) {
  const palette = [
    { rgb: "210, 178, 65" },
    { rgb: "74, 157, 191" },
  ];
  const peak = runs.reduce((max, run) => run.samples.reduce((n, sample) => Math.max(n, Math.abs(sample.value) || 0), max), 1);
  ctx.save();
  ctx.shadowBlur = 0;
  for (const run of runs) {
    const { rgb } = palette[run.rank];
    const y = priceY(run.strike);
    const samples = run.samples.map((sample) => ({
      x: xAt(sample.index),
      half: Number.isFinite(sample.value) ? 3 + 7 * Math.sqrt(Math.abs(sample.value) / peak) : 6,
    }));
    if (samples.at(-1).x + slot / 2 < left || samples[0].x - slot / 2 > right) continue;
    if (style === "bands") {
      // Smooth thickness changes around the exact strike, without shifting its price.
      const edges = [{ ...samples[0], x: samples[0].x - slot / 2 }, ...samples, { ...samples.at(-1), x: samples.at(-1).x + slot / 2 }];
      const edge = (list, sign, move) => {
        const first = list[0];
        if (move) ctx.moveTo(first.x, y + sign * first.half);
        else ctx.lineTo(first.x, y + sign * first.half);
        for (let i = 1; i < list.length; i++) {
          const a = list[i - 1];
          const b = list[i];
          const mid = (a.x + b.x) / 2;
          ctx.bezierCurveTo(mid, y + sign * a.half, mid, y + sign * b.half, b.x, y + sign * b.half);
        }
      };
      const gradient = ctx.createLinearGradient(0, y - 10, 0, y + 10);
      gradient.addColorStop(0, `rgba(${rgb}, .08)`);
      gradient.addColorStop(.5, `rgba(${rgb}, .27)`);
      gradient.addColorStop(1, `rgba(${rgb}, .08)`);
      ctx.beginPath();
      edge(edges, -1, true);
      edge([...edges].reverse(), 1, false);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.strokeStyle = `rgba(${rgb}, .6)`;
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      ctx.fillStyle = `rgba(${rgb}, .62)`;
      for (const sample of samples) {
        if (sample.x < left || sample.x > right) continue;
        ctx.beginPath();
        ctx.arc(sample.x, y, Math.max(2.3, Math.min(4.2, candleWidth * .56)), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}
