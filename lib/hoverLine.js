// A dotted vertical rule under the cursor, so it reads at a glance which
// point on the series the tooltip is describing. Opt in per chart with
// `options.plugins.hoverLine = { enabled: true }`.
export const hoverLinePlugin = {
  id: "hoverLine",

  afterDatasetsDraw(chart, args, opts) {
    if (!opts?.enabled) return;
    const active = chart.tooltip?.getActiveElements?.() ?? [];
    if (!active.length) return;

    const { top, bottom } = chart.chartArea;
    const x = active[0].element.x;
    const { ctx } = chart;

    ctx.save();
    ctx.beginPath();
    ctx.setLineDash(opts.dash ?? [3, 3]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = opts.color ?? "rgba(255,255,255,0.55)";
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.restore();
  },
};
