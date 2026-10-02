// Single source of truth for the 5 sentiment zones: their upper bound (on a
// 0-100 scale), label, and color. The gauge's colored bands are drawn from
// these same boundaries so the needle position always lands in the band
// matching zoneOf/zoneColor for that value.
export const ZONES = [
  { max: 25, label: "Very Bearish", color: "#D97757" },
  { max: 45, label: "Bearish", color: "#f0ad4e" },
  { max: 55, label: "Neutral", color: "#9aa4ab" },
  { max: 75, label: "Bullish", color: "#7dc97a" },
  { max: 100, label: "Very Bullish", color: "#3fae5e" },
];

export const zoneOf = (v) => (ZONES.find((z) => v < z.max) ?? ZONES[ZONES.length - 1]).label;

export const zoneColor = (v) => (ZONES.find((z) => v < z.max) ?? ZONES[ZONES.length - 1]).color;

// Highlights extremes on the market sentiment chart line: deep red below 10, bright
// green once it's above 67. Anything in between falls back to the line's
// default color (undefined tells Chart.js's segment styling to use the
// dataset's base borderColor).
export const fgLineColor = (v) => (v < 10 ? "#8b0f14" : v > 67 ? "#34c759" : undefined);

// Finds the reading closest to targetIso (an ISO date string) in an
// ascending-sorted {dates, values} pair. Used for "1 week/month/year ago"
// style lookbacks against the full (unfiltered) series.
export function nearestValue(dates, values, targetIso) {
  const n = dates.length;
  if (!n) return null;
  let idx = dates.findIndex((d) => d >= targetIso);
  if (idx === -1) {
    idx = n - 1;
  } else if (idx > 0) {
    const diffAfter = Math.abs(new Date(dates[idx]) - new Date(targetIso));
    const diffBefore = Math.abs(new Date(dates[idx - 1]) - new Date(targetIso));
    if (diffBefore <= diffAfter) idx = idx - 1;
  }
  return { date: dates[idx], value: values[idx] };
}

export function daysAgoIso(fromIso, days) {
  const d = new Date(fromIso);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function monthsAgoIso(fromIso, months) {
  const d = new Date(fromIso);
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

export function yearsAgoIso(fromIso, years) {
  const d = new Date(fromIso);
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

export function rangeStartIndex(dates, range) {
  const n = dates.length;
  if (!n) return 0;
  const last = new Date(dates[n - 1]);
  let cutoff;
  switch (range) {
    case "6m":
      cutoff = new Date(last);
      cutoff.setMonth(cutoff.getMonth() - 6);
      break;
    case "1y":
      cutoff = new Date(last);
      cutoff.setFullYear(cutoff.getFullYear() - 1);
      break;
    case "2y":
      cutoff = new Date(last);
      cutoff.setFullYear(cutoff.getFullYear() - 2);
      break;
    case "3y":
      cutoff = new Date(last);
      cutoff.setFullYear(cutoff.getFullYear() - 3);
      break;
    case "5y":
      cutoff = new Date(last);
      cutoff.setFullYear(cutoff.getFullYear() - 5);
      break;
    case "ytd":
      cutoff = new Date(last.getFullYear(), 0, 1);
      break;
    default:
      return 0;
  }
  const iso = cutoff.toISOString().slice(0, 10);
  const idx = dates.findIndex((d) => d >= iso);
  return idx === -1 ? 0 : idx;
}
