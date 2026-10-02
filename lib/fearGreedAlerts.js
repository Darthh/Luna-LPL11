// The rules behind the F&G alert emails, kept apart from the database and the
// mailer so the one piece with real logic in it can be tested on plain values.

export const MAX_ALERTS_PER_USER = 10;
export const DIRECTIONS = ["above", "below"];

// The index is a 0-100 score. A threshold outside that can never fire, and one
// at the very edge ("above 100") can't either, so both are rejected at the
// boundary rather than saved as an alert that silently never sends.
export const MIN_THRESHOLD = 1;
export const MAX_THRESHOLD = 99;

export function validateAlert({ direction, threshold, email }) {
  if (!DIRECTIONS.includes(direction)) return "Pick above or below.";
  const n = Number(threshold);
  if (!Number.isInteger(n) || n < MIN_THRESHOLD || n > MAX_THRESHOLD) {
    return `Threshold must be a whole number between ${MIN_THRESHOLD} and ${MAX_THRESHOLD}.`;
  }
  // Deliberately loose. The real proof that an address exists is whether the
  // mail arrives; a strict regex here mostly rejects valid unusual addresses.
  if (typeof email !== "string" || !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email.trim())) {
    return "Enter a valid email address.";
  }
  return null;
}

// Fires on the crossing, not on the level.
//
// `previous` is the reading at the last check and null for an alert that has
// never been checked. A null previous never fires: there is no edge to have
// crossed, and treating "no baseline" as a crossing would email everyone whose
// threshold the market already sits past the moment they subscribe.
//
// The boundary belongs to the fear/greed side, matching the chart: "above 67"
// fires when the index is strictly greater than 67, "below 10" when strictly
// less than 10.
export function shouldFire({ direction, threshold, previous, current }) {
  if (previous == null || current == null) return false;
  if (direction === "above") return previous <= threshold && current > threshold;
  return previous >= threshold && current < threshold;
}
