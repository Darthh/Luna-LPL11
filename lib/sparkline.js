// A price series as one SVG <path>, scaled into a compact box. Drawn rather
// than charted: a Chart.js instance per row or per card would cost far more
// than the picture is worth, and a polyline is what this is.
//
// Shared by the market-cap ranking's 3M column and the stock page's peer cards.
export const SPARK_W = 124;
export const SPARK_H = 36;

export function sparkPath(points, width = SPARK_W, height = SPARK_H) {
  if (!points || points.length < 2) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of points) {
    if (p < lo) lo = p;
    if (p > hi) hi = p;
  }
  // A flat line has no range to scale into; draw it down the middle.
  const span = hi - lo || 1;
  const stepX = width / (points.length - 1);
  return points
    .map((p, i) => {
      const x = i * stepX;
      const y = height - ((p - lo) / span) * (height - 2) - 1;
      return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}
