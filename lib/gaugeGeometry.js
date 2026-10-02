// The half-wheel's geometry, shared by the on-page gauge and the Open Graph
// card so the two can never draw the same reading at different angles.
//
// The dial spans 180 degrees: 0 sits at the left (-90), 100 at the right (+90),
// and the needle angle is a straight interpolation between them.
export const GAUGE = { cx: 150, cy: 148, radius: 118, stroke: 36 };

const round = (n) => Math.round(n * 100) / 100;

export function pointForAngle(angleDeg, radius, { cx, cy } = GAUGE) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: round(cx + radius * Math.sin(rad)), y: round(cy - radius * Math.cos(rad)) };
}

export const angleForValue = (v) => -90 + (v / 100) * 180;

export function describeArc(startAngle, endAngle, radius, origin) {
  const start = pointForAngle(startAngle, radius, origin);
  const end = pointForAngle(endAngle, radius, origin);
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 1 ${end.x} ${end.y}`;
}

// A kite: tip at the reading, two shoulders square to it, and a short tail
// behind the hub so the needle reads as balanced rather than as a spike.
export function needlePoints(angleDeg, length, baseWidth, origin) {
  const tip = pointForAngle(angleDeg, length, origin);
  const b1 = pointForAngle(angleDeg + 90, baseWidth / 2, origin);
  const b2 = pointForAngle(angleDeg - 90, baseWidth / 2, origin);
  const back = pointForAngle(angleDeg, -baseWidth * 0.35, origin);
  return `${b1.x},${b1.y} ${tip.x},${tip.y} ${b2.x},${b2.y} ${back.x},${back.y}`;
}
