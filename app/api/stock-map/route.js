import { STOCK_UNIVERSE } from "@/lib/stockMapData";
import { simulatedPopularStocks } from "@/lib/popularStocksDemo";
import { hashCode, mulberry32, gauss } from "@/lib/demoData";
import { FUND_MAPS, fetchFundMap } from "@/lib/fundHoldings";
import { parseSymbolList } from "@/lib/watchlist";
import { describeSymbols } from "@/lib/symbolProfile";
import { memo } from "@/lib/memo";
import { pool } from "@/lib/pool";
import { YAHOO_USER_AGENT } from "@/lib/userAgent";

const INDEXES = [
  "sp500",
  "ndx100",
  "dow30",
  "soxx",
  "popular",
  "watchlist",
  ...Object.keys(FUND_MAPS),
];
const UNIVERSE_BY_SYMBOL = new Map(STOCK_UNIVERSE.map((s) => [s.symbol, s]));

// Yahoo Finance's unofficial spark endpoint needs no API key, but blocks
// non-browser User-Agents - same caveat as the ticker-tape route.
// Spark rejects requests with more than 20 symbols (HTTP 400).
const CHUNK_SIZE = 20;
const CONCURRENCY = 6;
// A whole index is 45-150 chunks rather than the presets' 2-25, and the
// bottleneck is per-request round-trip, not Yahoo's patience: widening this
// from 6 cut a full emerging-markets map from 90s to 25s. Held short of what
// the endpoint will take, since a block here would take every map with it.
const FUND_CONCURRENCY = 24;
// Assembling a fund map is expensive enough to be worth holding in the
// server's memory for as long as its quotes are fresh, so switching maps and
// back doesn't rebuild it. The CDN caches the same response for the same
// window; this covers the origin behind it.
const FUND_TTL = 900_000;
// Unbounded on purpose: the keys are the fixed INDEXES list, not user input.
const fundMap = memo(FUND_TTL);

// Trading-day lookbacks from the most recent close. "3y" is the longest the
// series runs, so it uses the oldest close rather than a fixed count - which
// also means a short history (a recent IPO) still gets a sensible full-range
// number instead of nothing.
const LOOKBACKS = { "1d": 1, "1m": 21, "3m": 63, "6m": 126, "1y": 252, "2y": 504 };

function computePerf(closes) {
  const clean = closes.filter((c) => typeof c === "number" && c > 0);
  if (clean.length < 2) return null;
  const last = clean[clean.length - 1];
  // Rounded because a full-index map ships thousands of these: raw floats
  // roughly double the size of the response for digits nothing renders.
  const round = (v) => Math.round(v * 100) / 100;
  const perf = {};
  for (const [key, days] of Object.entries(LOOKBACKS)) {
    const ref = clean[Math.max(clean.length - 1 - days, 0)];
    perf[key] = round(((last - ref) / ref) * 100);
  }
  perf["3y"] = round(((last - clean[0]) / clean[0]) * 100);
  return { price: round(last), perf };
}

// `store` is off for the fund maps: a full index is 130+ chunks, and putting
// every one through the data cache costs more than re-fetching them (those
// responses are cached whole, at the CDN, instead).
async function fetchChunk(symbols, store = true) {
  const url = `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${symbols.join(",")}&range=3y&interval=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": YAHOO_USER_AGENT },
    ...(store ? { next: { revalidate: 900 } } : { cache: "no-store" }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const out = {};
  for (const symbol of symbols) {
    const series = json?.[symbol]?.close;
    if (Array.isArray(series)) {
      const computed = computePerf(series);
      if (computed) out[symbol] = computed;
    }
  }
  return out;
}

// Deterministic per-day fallback so the map still renders (flagged as demo)
// when the live feed is unreachable. Longer horizons drift proportionally.
function simulatedEntry(symbol) {
  const day = new Date().toISOString().slice(0, 10);
  const rng = mulberry32(hashCode(`map:${symbol}:${day}`));
  const d1 = gauss(rng) * 1.2;
  return {
    price: 100 * (1 + d1 / 100),
    perf: {
      "1d": d1,
      "1m": gauss(rng) * 5,
      "3m": gauss(rng) * 9,
      "6m": gauss(rng) * 14,
      "1y": gauss(rng) * 22,
      "2y": gauss(rng) * 35,
      "3y": gauss(rng) * 45,
    },
  };
}

// Fetches live spark performance for the given symbols in Yahoo-safe chunks
// with limited concurrency, returning { quotes, liveCount }.
async function fetchQuotes(symbols, store = true, concurrency = CONCURRENCY) {
  const chunks = [];
  for (let i = 0; i < symbols.length; i += CHUNK_SIZE) {
    chunks.push(symbols.slice(i, i + CHUNK_SIZE));
  }
  const results = await pool(chunks, concurrency, (chunk) =>
    fetchChunk(chunk, store).catch(() => null)
  );
  const quotes = {};
  let liveCount = 0;
  for (const result of results) {
    if (result) {
      Object.assign(quotes, result);
      liveCount += Object.keys(result).length;
    }
  }
  return { quotes, liveCount };
}

const HTML_ENTITIES = { "&amp;": "&", "&quot;": '"', "&#39;": "'", "&lt;": "<", "&gt;": ">" };
const decodeEntities = (s) => s.replace(/&amp;|&quot;|&#39;|&lt;|&gt;/g, (m) => HTML_ENTITIES[m]);

// Secondary share classes collapse into their primary so a company never
// occupies two tiles (matches the preset maps' dedupe).
const SHARE_CLASS_ALIASES = { GOOG: "GOOGL", FOX: "FOXA", NWS: "NWSA", BRKB: "BRK-B" };

// Top tickers from our own popular-stocks feed (ApeWisdom, the same source
// the homepage card uses), deduped by company and cut to the top 20 by
// weekly mentions, which also drive tile size.
async function fetchPopularList() {
  const res = await fetch("https://apewisdom.io/api/v1.0/filter/all-stocks/page/1", {
    headers: { "User-Agent": YAHOO_USER_AGENT },
    next: { revalidate: 900 },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const results = json?.results;
  if (!Array.isArray(results) || !results.length) throw new Error("Missing results");

  const merged = new Map();
  for (const r of results) {
    const raw = String(r.ticker).toUpperCase();
    const symbol = SHARE_CLASS_ALIASES[raw] ?? raw;
    const mentions = Math.max(1, Number(r.mentions) || 1);
    if (merged.has(symbol)) {
      merged.get(symbol).mentions += mentions;
    } else {
      merged.set(symbol, { symbol, name: decodeEntities(String(r.name ?? symbol)), mentions });
    }
  }

  return [...merged.values()]
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 20)
    .map((s, i) => ({ ...s, rank: i + 1 }));
}

// Builds the fully-described popular list: mention counts for tile size,
// plus sector/industry/cap so it groups like the preset index maps.
async function buildPopular() {
  const list = await fetchPopularList();
  const described = await describeSymbols(list);
  return described.map((stock, i) => ({
    ...stock,
    mentions: list[i].mentions,
    rank: list[i].rank,
  }));
}

// Every constituent of a fund's index, priced. Kept behind an in-memory TTL
// with in-flight sharing, so a burst of clicks builds it once.
async function buildFundMap(index) {
  const holdings = await fetchFundMap(index);
  const { quotes, liveCount } = await fetchQuotes(
    holdings.map((s) => s.symbol),
    false,
    FUND_CONCURRENCY
  );
  const isDemo = liveCount === 0;
  if (isDemo) {
    for (const s of holdings) quotes[s.symbol] = simulatedEntry(s.symbol);
  }
  // A holding Yahoo won't price is a tile that could only render blank, so it
  // comes off the map and the rest of the fund fills the space.
  const stocks = isDemo ? holdings : holdings.filter((s) => quotes[s.symbol]);
  return { stocks, quotes, isDemo, held: holdings.length, asOf: new Date().toISOString() };
}

export async function GET(request) {
  const index = request.nextUrl.searchParams.get("index") ?? "sp500";
  if (!INDEXES.includes(index)) {
    return Response.json({ error: "Unknown index" }, { status: 400 });
  }

  if (FUND_MAPS[index]) {
    try {
      const payload = await fundMap(index, () => buildFundMap(index));
      return Response.json(payload, {
        headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800" },
      });
    } catch {
      // No static list to fall back on the way the preset maps have, so this
      // is a real failure rather than a simulated map.
      return Response.json({ error: "Holdings unavailable" }, { status: 503 });
    }
  }

  // The user's own watchlist. The symbols come up in the query string rather
  // than from the session, so this serves the signed-out (localStorage)
  // watchlist and the saved one through exactly the same path.
  if (index === "watchlist") {
    const symbols = parseSymbolList(request.nextUrl.searchParams.get("symbols"));
    if (!symbols.length) {
      return Response.json({ stocks: [], quotes: {}, isDemo: false, asOf: new Date().toISOString() });
    }

    const described = await describeSymbols(symbols.map((symbol) => ({ symbol })));
    const { quotes, liveCount } = await fetchQuotes(symbols);
    // A ticker Yahoo won't price can only render as a blank tile, so it drops
    // off the map rather than sitting there empty.
    const stocks = liveCount ? described.filter((s) => quotes[s.symbol]) : described;
    if (!liveCount) {
      for (const symbol of symbols) quotes[symbol] = simulatedEntry(symbol);
    }

    return Response.json(
      { stocks, quotes, isDemo: liveCount === 0, asOf: new Date().toISOString() },
      { headers: { "Cache-Control": "private, max-age=60" } }
    );
  }

  if (index === "popular") {
    let stocks;
    let listIsDemo = false;
    try {
      stocks = await buildPopular();
    } catch {
      // Reuse the homepage card's simulated ranking, described via our
      // static universe where possible.
      listIsDemo = true;
      stocks = simulatedPopularStocks().map((s) => {
        const known = UNIVERSE_BY_SYMBOL.get(s.ticker);
        return {
          symbol: s.ticker,
          name: known?.name ?? s.name,
          sector: known?.sector ?? "Other",
          industry: known?.industry ?? known?.sector ?? "Other",
          cap: known?.cap ?? null,
          mentions: s.mentions,
          rank: s.rank,
        };
      });
    }

    const symbols = stocks.map((s) => s.symbol);
    const { quotes, liveCount } = await fetchQuotes(symbols);
    const isDemo = liveCount === 0;
    if (isDemo) {
      for (const symbol of symbols) quotes[symbol] = simulatedEntry(symbol);
    }
    return Response.json({
      stocks,
      quotes,
      isDemo: isDemo || listIsDemo,
      asOf: new Date().toISOString(),
    });
  }

  const symbols = STOCK_UNIVERSE.filter((s) => s.indexes.includes(index)).map((s) => s.symbol);
  const { quotes, liveCount } = await fetchQuotes(symbols);
  const isDemo = liveCount === 0;
  if (isDemo) {
    for (const symbol of symbols) quotes[symbol] = simulatedEntry(symbol);
  }

  return Response.json({ quotes, isDemo, asOf: new Date().toISOString() });
}
