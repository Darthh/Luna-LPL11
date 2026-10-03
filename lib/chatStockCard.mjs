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

// Bare symbols are case-insensitive, but ordinary prose and financial acronyms
// are weak signals. Explicit cashtags and stock-page links bypass this list.
const CHAT_WORDS = new Set("a i an the and or for to of in on at by as is it be are was were been being have has had do does did can could will would may might shall should must me my we our you your they their them he she his her us its this that these those what where when why how who which with from into about tell show look more less than then also only just very any all some each every both other no not yes if so but because while today now stock stocks share shares price chart quote graph fund funds market ratio terms versus vs compare best good bad high low buy sell hold long short risk data need using use see read time year month day up down over under per new old one two three five ten first last next open close value growth help please ETF CEO EPS GDP CPI FED SEC USD EUR API JSON ROI YTD PE AI P E".toUpperCase().split(" "));
const FINANCIAL_TERMS = new Set("A I P E ETF CEO EPS GDP CPI FED SEC USD EUR API JSON ROI YTD PE AI".split(" "));
for (const word of "jan feb mar apr jun jul aug sep sept oct nov dec chip chips gpu gpus cpu cpus moat edge team cost cash core form note notes tax taxes rate rates yield yields debt earns earn beats beat sells sales total firm firms peer peers cap caps name named chart charts most often still much well right left clear lower upper great small large own make makes made get gets got give gives gave take takes took want wants work works think says said put puts call calls help helps ask asks true false sure real live why worth after before since until prior past back away near far fast slow way ways run runs set sets end ends same full such many out off go goes let lets".split(" ")) CHAT_WORDS.add(word.toUpperCase());

function collectStockLookups(messages, includeLowercase) {
  const found = new Set();
  for (const message of messages) {
    const text = String(message || "");
    for (const match of text.matchAll(/(?:\$|\/stock\/)([a-z][a-z0-9.-]{0,14})|\b([a-z]{1,5}(?:[.-][a-z]{1,3})?)\b/gi)) {
      const symbol = (match[1] || match[2]).toUpperCase().replace(/[.-]+$/, "");
      const uppercaseTicker = match[2] === symbol && !FINANCIAL_TERMS.has(symbol);
      if (match[1] || uppercaseTicker || (includeLowercase && !CHAT_WORDS.has(symbol))) found.add(symbol);
    }
  }
  const lookups = [...found].map(symbol => ({ symbol }));
  const company = stockLookupForMessage(messages[0]);
  if (company?.query) lookups.push(company);
  return lookups;
}

export function stockLookupsForMessages(...messages) {
  return collectStockLookups(messages, true);
}

// Answers contain much more prose than questions. Require an uppercase ticker,
// cashtag or stock link for newly introduced stocks rather than interpreting
// ordinary verbs such as "adds" as the ADDS ETF.
export function stockLookupsForAnswer(message) {
  return collectStockLookups([message], false).filter(lookup => lookup.symbol);
}

export async function loadStockCards(lookups, request = fetch) {
  const cards = [];
  const companyName = name => String(name || "").toLowerCase()
    .replace(/\b(inc|incorporated|corp|corporation|company|limited|ltd|plc)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
  // Small batches keep long answers from flooding the quote upstream.
  for (let start = 0; start < lookups.length; start += 4) {
    const batch = await Promise.all(lookups.slice(start, start + 4).map(async lookup => {
      let symbol;
      try {
        const searchTerm = lookup.symbol?.replace(/\.([A-Z])$/, "-$1") || lookup.query;
        const search = await request(`/api/stock-search?q=${encodeURIComponent(searchTerm)}`);
        if (!search.ok) return null;
        const results = (await search.json()).results || [];
        symbol = lookup.symbol
          ? results.find(result => result.symbol?.toUpperCase().replace(/\./g, "-") === lookup.symbol.replace(/\./g, "-"))?.symbol
          : (results.find(result => companyName(result.name) === companyName(lookup.query)) || results[0])?.symbol;
        if (!symbol) return null;
        const [profile, chart] = await Promise.all([
          request(`/api/stock-profile?symbol=${encodeURIComponent(symbol)}`),
          request(`/api/stock-chart?symbol=${encodeURIComponent(symbol)}&range=1d`),
        ]);
        const card = profile.ok && chart.ok ? buildStockCard(await profile.json(), await chart.json()) : null;
        return card || { symbol, unavailable: true };
      } catch {
        return symbol ? { symbol, unavailable: true } : null;
      }
    }));
    for (const card of batch) {
      if (card && !cards.some(existing => existing.symbol === card.symbol)) cards.push(card);
    }
  }
  return cards;
}

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
