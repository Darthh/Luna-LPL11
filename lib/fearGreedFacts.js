// Relative, not the "@/" alias: the self-check in scripts/ runs this under
// plain node, which has no idea what "@/" means.
import { zoneOf, nearestValue, daysAgoIso, monthsAgoIso, yearsAgoIso } from "./zone.js";

const LONG_DATE = { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" };

export const formatLongDate = (iso) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", LONG_DATE) : null;

// Derives every headline number the site quotes about the index from a raw
// {dates, values} series. Used by the server-rendered summary, the JSON-LD,
// and the client gauge, so all three can never disagree.
export function fearGreedFacts(dates, values) {
  if (!dates?.length || !values?.length) return null;

  const lastDate = dates[dates.length - 1];
  const current = values[values.length - 1];
  const prevClose = values.length >= 2 ? values[values.length - 2] : null;
  const rounded = Math.round(current);

  const lookback = (value) => (value == null ? null : { value, zone: zoneOf(value) });

  return {
    lastDate,
    current,
    rounded,
    zone: zoneOf(current),
    prevClose,
    delta: prevClose == null ? null : rounded - Math.round(prevClose),
    items: [
      { label: "Previous close", value: prevClose },
      { label: "1 week ago", value: nearestValue(dates, values, daysAgoIso(lastDate, 7))?.value ?? null },
      { label: "1 month ago", value: nearestValue(dates, values, monthsAgoIso(lastDate, 1))?.value ?? null },
      { label: "3 months ago", value: nearestValue(dates, values, monthsAgoIso(lastDate, 3))?.value ?? null },
      { label: "1 year ago", value: nearestValue(dates, values, yearsAgoIso(lastDate, 1))?.value ?? null },
    ],
    yearAgo: lookback(nearestValue(dates, values, yearsAgoIso(lastDate, 1))?.value ?? null),
  };
}

// The one sentence every AI fetcher and search snippet should be able to lift
// verbatim. Flat, declarative, no markup, numbers inline.
//
// `move: false` drops the comparison against the previous close. Meta
// descriptions pass it: a search snippet is cut to roughly 160 characters, and
// the day's move is the least useful thing to spend that budget on - it pushed
// what the site actually does off the end of the result. On the page itself
// the comparison is worth keeping, so it stays on by default.
export function headlineSentence(facts, { move: withMove = true } = {}) {
  if (!facts) return "The market sentiment reading is temporarily unavailable.";
  const move =
    !withMove || facts.delta == null
      ? ""
      : facts.delta === 0
        ? ", unchanged from the previous close"
        : `, ${facts.delta > 0 ? "up" : "down"} ${Math.abs(facts.delta)} ${
            Math.abs(facts.delta) === 1 ? "point" : "points"
          } from the previous close`;
  return `The market sentiment reading is ${facts.rounded} (${facts.zone}) as of ${formatLongDate(
    facts.lastDate,
  )}${move}.`;
}
