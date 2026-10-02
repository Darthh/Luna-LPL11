import { extractSymbols } from "./liloText.js";

export const STOCK_RANGES = [
  { key: "1d", label: "1D" },
  { key: "1m", label: "1M" },
  { key: "6m", label: "6M" },
  { key: "1y", label: "1Y" },
  { key: "2y", label: "2Y" },
];

const STOCK_TOPIC = /\b(stock|shares?|ticker|quote|chart|price|trading|performance)\b/i;
const COMPANY_QUESTION = /\b(tell me about|what can you tell me about|how is|look at|analy[sz]e|research)\b/i;

export function stockLookupForMessage(message) {
  const text = String(message || "").trim();
  if (!text) return null;

  const [symbol] = extractSymbols(text, 1);
  if (symbol) return { symbol };
  if (!STOCK_TOPIC.test(text) || !COMPANY_QUESTION.test(text)) return null;

  const query = text
    .replace(/\b(what can you tell me about|tell me about|how is|look at|analy[sz]e|research)\b/gi, " ")
    .replace(/\b(the|a|an|stock|shares?|company|ticker|quote|chart|price|trading|performance|today|please)\b/gi, " ")
    .replace(/[^a-z0-9.&'\- ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return query ? { query } : null;
}

export function chartGeometry(points, width, height, padding = 4) {
  const values = (Array.isArray(points) ? points : [])
    .map((point) => Number(point?.c))
    .filter(Number.isFinite);
  if (values.length < 2) return null;

  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const coords = values.map((value, index) => {
    const x = padding + (index / (values.length - 1)) * innerWidth;
    const y = span ? padding + ((high - value) / span) * innerHeight : height / 2;
    return `${Number(x.toFixed(2))},${Number(y.toFixed(2))}`;
  });
  const line = coords.join(" ");
  return {
    line,
    area: `${line} ${width - padding},${height - padding} ${padding},${height - padding}`,
    rising: values.at(-1) >= values[0],
  };
}

export function buildStockCard(profile, chart) {
  const quote = profile?.quote;
  const points = (Array.isArray(chart?.points) ? chart.points : [])
    .filter((point) => Number.isFinite(point?.c))
    .map(({ t, c }) => ({ t, c }));
  if (!profile?.symbol || !Number.isFinite(quote?.price) || points.length < 2) return null;

  return {
    symbol: profile.symbol,
    name: profile.name || profile.symbol,
    currency: profile.currency || chart?.currency || "USD",
    price: quote.price,
    change: quote.change,
    changePct: Number.isFinite(quote.changePct) ? quote.changePct * 100 : null,
    open: quote.open,
    dayLow: quote.dayLow,
    dayHigh: quote.dayHigh,
    volume: quote.volume,
    marketCap: quote.marketCap,
    trailingPE: profile.valuation?.trailingPE ?? quote.trailingPE ?? null,
    forwardPE: profile.valuation?.forwardPE ?? quote.forwardPE ?? null,
    profitMargin: profile.highlights?.profitMargin ?? null,
    range: chart.range || "1d",
    points,
  };
}
