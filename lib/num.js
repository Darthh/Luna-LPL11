// Small formatting and range helpers that several charts and panels had each
// defined privately. They are here rather than in lib/hedgeFundFormat.js
// because that module's money() abbreviates through formatCap ("$1.2B") for
// tables of very large filings, while these render a plain currency amount -
// the same name for two different outputs is what would actually confuse.

// Digits differ by caller: a portfolio total wants whole dollars, a single
// share price wants cents.
export const money = (v, digits = 0) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits });

// Signed, because every caller uses it for a change rather than a level, and a
// change that only shows a sign when negative reads as an absolute number.
export const pct = (v, digits = 2) => `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;

// JS has no Math.clamp. Inlined as Math.min(Math.max(...)) in a dozen places,
// where the nesting is what makes it hard to see which bound is which.
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
