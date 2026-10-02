import Link from "next/link";
import { ZONES, zoneOf, zoneColor } from "@/lib/zone";
import { clamp } from "@/lib/num";
// Shared with the Open Graph card, so the dial there points where this one does.
import {
  GAUGE,
  angleForValue,
  describeArc,
  needlePoints,
  pointForAngle,
} from "@/lib/gaugeGeometry";

const { cx: CX, cy: CY, radius: RADIUS, stroke: STROKE } = GAUGE;
const INNER_RADIUS = RADIUS - STROKE / 2;
const OUTER_RADIUS = RADIUS + STROKE / 2;
const GAP_DEG = 1.4;
const TICKS = [0, 25, 50, 75, 100];

function round(n) {
  return Math.round(n * 100) / 100;
}

function formatAsOf(asOf, fallbackDate) {
  if (asOf) {
    const d = new Date(asOf);
    const datePart = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const timePart = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
    return `Last updated ${datePart} at ${timePart}`;
  }
  if (fallbackDate) {
    const d = new Date(fallbackDate);
    return `Last updated ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  }
  return null;
}

export default function FearGreedGauge({ value, delta, asOf, fallbackDate, history }) {
  const hasValue = value != null;
  const clamped = hasValue ? clamp(value, 0, 100) : null;
  const needleAngle = hasValue ? angleForValue(clamped) : -90;
  const updatedText = formatAsOf(asOf, fallbackDate);
  const activeLabel = hasValue ? zoneOf(clamped) : null;

  return (
    <section className="gauge-card">
      <div className="gauge-left">
        <div className="gauge-top">
          <h2>Market Sentiment Index</h2>
          <p className="gauge-sub">How bullish or bearish is the market now?</p>
          <Link className="gauge-link" href="/about">
            Learn about Luna Terminal
          </Link>
        </div>
        <div className="gauge-visual">
          <svg
            viewBox="0 0 300 168"
            role="img"
            aria-label={hasValue ? `Market sentiment reading: ${Math.round(clamped)}, ${activeLabel}` : "Market sentiment reading unavailable"}
          >
            {ZONES.map((zone, i) => {
              const prevMax = i === 0 ? 0 : ZONES[i - 1].max;
              const startAngle = angleForValue(prevMax) + (i === 0 ? 0 : GAP_DEG / 2);
              const endAngle = angleForValue(zone.max) - (i === ZONES.length - 1 ? 0 : GAP_DEG / 2);
              const midAngle = round((angleForValue(prevMax) + angleForValue(zone.max)) / 2);
              const isActive = activeLabel === zone.label;
              const labelPos = pointForAngle(midAngle, RADIUS);
              return (
                <g key={zone.label}>
                  <path
                    d={describeArc(startAngle, endAngle, RADIUS)}
                    stroke={isActive ? zone.color : "var(--gauge-inactive-band)"}
                    strokeWidth={STROKE}
                    fill="none"
                    strokeLinecap="butt"
                  />
                  <text
                    x={labelPos.x}
                    y={labelPos.y}
                    transform={`rotate(${midAngle} ${labelPos.x} ${labelPos.y})`}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="7.6"
                    fontWeight="700"
                    letterSpacing="0.3"
                    fill={isActive ? "var(--gauge-active-text)" : "var(--gauge-inactive-text)"}
                  >
                    {zone.label.toUpperCase()}
                  </text>
                </g>
              );
            })}
            {TICKS.map((v) => {
              const p = pointForAngle(angleForValue(v), INNER_RADIUS - 14);
              return (
                <text
                  key={v}
                  x={p.x}
                  y={p.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="10"
                  fontWeight="600"
                  fill="var(--gauge-tick-text)"
                >
                  {v}
                </text>
              );
            })}
            {hasValue && (
              // Drawn at its final angle, then rotated back to the left edge and
              // released, so the needle sweeps up to today's reading on load.
              // CSS owns the animation and skips it under reduced motion.
              <g className="gauge-needle" style={{ "--needle-from": `${-(clamped / 100) * 180}deg` }}>
                <polygon points={needlePoints(needleAngle, INNER_RADIUS - 12, 7)} fill="var(--needle-color)" />
              </g>
            )}
            <circle cx={CX} cy={CY} r="7" fill="var(--needle-color)" stroke="var(--panel)" strokeWidth="2" />
          </svg>
          <div className="gauge-value-row">
            <div className="gauge-value">{hasValue ? Math.round(clamped) : "n/a"}</div>
            {hasValue && delta != null && delta !== 0 && (
              <span
                className={`gauge-delta ${delta > 0 ? "up" : "down"}`}
                aria-label={
                  delta > 0
                    ? `Up ${delta} points from previous close`
                    : `Down ${Math.abs(delta)} points from previous close`
                }
              >
                {delta > 0 ? "▲" : "▼"} {delta > 0 ? "+" : ""}
                {delta}
              </span>
            )}
          </div>
          <div className="gauge-zone-label">{hasValue ? activeLabel : "No data"}</div>
        </div>
        {updatedText && <div className="gauge-updated">{updatedText}</div>}
      </div>
      <div className="gauge-stats">
        {history.map((h) => (
          <div className="gauge-stat" key={h.label}>
            <span className="gauge-stat-meta">
              <span className="gauge-stat-when">{h.label}</span>
              <span className="gauge-stat-zone">{h.value != null ? zoneOf(h.value) : "n/a"}</span>
            </span>
            <span className="gauge-pill" style={{ background: h.value != null ? zoneColor(h.value) : "var(--border)" }}>
              {h.value != null ? Math.round(h.value) : "n/a"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
