// Shared rules for a watchlist entry, used by both the API routes and the
// client-side store so a symbol is stored the same way whether it lands in
// Aurora DSQL (signed in) or localStorage (signed out).

// A cap keeps one account from turning the ticker bar or the watchlist map
// into hundreds of upstream quote requests per refresh.
export const MAX_WATCHLIST_ITEMS = 60;

// Yahoo symbols aren't always plain letters: share classes (BRK-B), foreign
// listings (0700.HK) and futures (GC=F) all show up in search results.
// A leading caret marks an index (^VIX, ^GSPC) - the same notation the ticker
// tape already carries. It is only valid first, which is why it is its own
// optional character rather than another member of the trailing class.
const SYMBOL_RE = /^\^?[A-Z0-9][A-Z0-9.\-=^]{0,14}$/;

export function normalizeSymbol(raw) {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export function isValidSymbol(symbol) {
  return SYMBOL_RE.test(symbol);
}

// Parses a comma-separated `symbols` query param into a deduped, validated
// list, capped at MAX_WATCHLIST_ITEMS.
export function parseSymbolList(raw) {
  if (!raw) return [];
  const seen = new Set();
  for (const part of String(raw).split(",")) {
    const symbol = normalizeSymbol(part);
    if (isValidSymbol(symbol)) seen.add(symbol);
    if (seen.size >= MAX_WATCHLIST_ITEMS) break;
  }
  return [...seen];
}

// Names are only ever shown as a label beside the symbol, so anything longer
// than a company name is truncated rather than rejected.
export function normalizeName(raw) {
  const name = String(raw ?? "").trim();
  return name ? name.slice(0, 120) : null;
}

// Shares held. Fractional is normal (brokers sell slices of a share), so this
// is a float rather than an integer; anything not a positive finite number
// means "watched but not owned" and is stored as null rather than zero, so a
// cleared box and a never-filled one behave the same everywhere downstream.
export const MAX_SHARES = 1e12;

export function normalizeShares(raw) {
  if (raw == null || raw === "") return null;
  const shares = Number(raw);
  if (!Number.isFinite(shares) || shares <= 0 || shares > MAX_SHARES) return null;
  return shares;
}
