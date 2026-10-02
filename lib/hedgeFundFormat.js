// Shared by the hedge fund list and a single fund's page, so the two can't
// end up writing the same number two different ways.
import { formatCap } from "@/lib/formatCap";

// Values here are all dollars and all in the same column, so the symbol on
// every row is a character of noise repeated a few hundred times.
export const money = (v) => (v == null ? "n/a" : formatCap(v));
export const pct = (v) => `${v.toFixed(2)}%`;
export const signed = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString()}`;
export const signedPct = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}%`;
export const changeClass = (v) => (v > 0 ? "ticker-change-up" : v < 0 ? "ticker-change-down" : "");

// "CITADEL ADVISORS LLC" reads badly in a table of twenty; the legal form is
// the same on all of them and carries nothing.
export const shortName = (name) =>
  name.replace(/[,]?\s+(LLC|L\.L\.C\.|LLP|LP|L\.P\.|Ltd|Inc|Corp|plc|B\.V\.|ET AL)\.?$/i, "").trim();

// Same quarter end, compact enough for a table column: 2026-03-31 → 3-31-26.
export const shortDate = (iso) =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso ?? "")
    ? `${+iso.slice(5, 7)}-${+iso.slice(8, 10)}-${iso.slice(2, 4)}`
    : (iso ?? "n/a");

// A quarter end named as the quarter it is: 2026-06-30 → Q2 2026. The picker is
// a row of four of these, and four dates a few months apart are much harder to
// tell apart at a glance than four quarter names.
export const quarterLabel = (iso) =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso ?? "")
    ? `Q${Math.ceil(+iso.slice(5, 7) / 3)} ${iso.slice(0, 4)}`
    : (iso ?? "n/a");

// A report date is a quarter end and reads better as one than as an ISO date.
export function reportDate(iso) {
  if (!iso) return "n/a";
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}
