// Parses Twelve Data's /time_series response into { dates, closes } (ascending).
// Twelve Data returns HTTP 200 even for unknown symbols, with a body like
// { status: "error", code, message }. Throw a typed error in that case so the
// route handler can respond with a clean 400.
export class TwelveDataError extends Error {
  constructor(message, { planRestricted = false } = {}) {
    super(message);
    this.planRestricted = planRestricted;
  }
}

// Symbols that exist but aren't available on the caller's Twelve Data plan
// (e.g. many indices require a paid tier) aren't a "bad ticker" the user can
// fix by typing something else, so callers may want to treat this
// differently from a genuine unknown-symbol error.
function isPlanRestricted(message) {
  return /plan/i.test(message || "");
}

export function parseTwelveDataResponse(json) {
  if (json?.status === "error" || !Array.isArray(json?.values)) {
    const message = json?.message || "Unknown ticker";
    throw new TwelveDataError(message, { planRestricted: isPlanRestricted(message) });
  }
  const rows = [...json.values].sort((a, b) => a.datetime.localeCompare(b.datetime));
  return {
    dates: rows.map((r) => r.datetime),
    closes: rows.map((r) => Number(r.close)),
  };
}
