// Compact money and compact counts: $4.81T, $56.9B, $840M, 12.4K employees.
//
// Intl picks the magnitude, the suffix and the separators, so what's left here
// is the null case. Some securities have neither a cap nor a size - a preferred
// share, a depositary line, a symbol Yahoo answered late for - and the
// placeholder belongs here rather than at each call site, three of which
// rendered the label with nothing at all after it.
//
// Locale is pinned to en-US rather than the reader's: these are US listings
// quoted in dollars, and a browser set to de-DE would otherwise render the
// same figure as "4,81 Bio. $" beside a column of "$56.9B".
const MONEY = new Intl.NumberFormat("en-US", {
  notation: "compact",
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const COUNT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });

export function formatCap(cap) {
  if (cap == null || !Number.isFinite(cap)) return "n/a";
  return MONEY.format(cap);
}

// The same number without the currency mark: share counts, volumes, headcounts,
// and the money columns whose unit is already stated in the label beside them.
export function formatCount(v) {
  if (v == null || !Number.isFinite(v)) return "n/a";
  return COUNT.format(v);
}

// Compact money capped at three significant digits: $1.56T, $360B, $302M,
// $6.92B. maximumFractionDigits alone is not enough - it bounds the decimals,
// not the total width, so a $360.25B cap still renders five digits. Significant
// digits bound what the reader actually counts.
const MONEY_3SIG = new Intl.NumberFormat("en-US", {
  notation: "compact",
  style: "currency",
  currency: "USD",
  maximumSignificantDigits: 3,
});

export function formatCapShort(cap) {
  if (cap == null || !Number.isFinite(cap)) return "n/a";
  return MONEY_3SIG.format(cap);
}
