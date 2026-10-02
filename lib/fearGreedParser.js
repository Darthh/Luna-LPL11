// Parses the upstream fearandgreed/graphdata response into { dates, values,
// asOf }.
// Real shape (verified live): { fear_and_greed: { timestamp, score, ... }, fear_and_greed_historical: { data: [{x: epochMs, y: score, rating}, ...] } }
export function parseFearGreedResponse(json) {
  const points = json?.fear_and_greed_historical?.data ?? [];
  if (!points.length) return { dates: [], values: [], asOf: null };
  const sorted = [...points].sort((a, b) => a.x - b.x);
  return {
    dates: sorted.map((p) => new Date(p.x).toISOString().slice(0, 10)),
    values: sorted.map((p) => Math.round(p.y * 10) / 10),
    asOf: json?.fear_and_greed?.timestamp ?? null,
  };
}

// The same graphdata response also carries each of the 7 sub-indicators that
// make up the overall score, keyed by these upstream field names. Each is shaped
// like { timestamp, score, rating, data: [{x: epochMs, y, rating}, ...] }.
const INDICATOR_KEYS = [
  "market_momentum_sp500",
  "market_momentum_sp125",
  "stock_price_strength",
  "stock_price_breadth",
  "put_call_options",
  "market_volatility_vix",
  "market_volatility_vix_50",
  "junk_bond_demand",
  "safe_haven_demand",
];

export function parseIndicators(json) {
  const out = {};
  for (const key of INDICATOR_KEYS) {
    const entry = json?.[key];
    if (!entry?.data?.length) continue;
    const sorted = [...entry.data].sort((a, b) => a.x - b.x);
    out[key] = {
      dates: sorted.map((p) => new Date(p.x).toISOString().slice(0, 10)),
      values: sorted.map((p) => p.y),
      score: entry.score ?? null,
      rating: entry.rating ?? null,
      asOf: entry.timestamp ?? null,
    };
  }
  return out;
}
