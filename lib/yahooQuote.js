// Extensions kept explicit so scripts/test-yahoo-quote.mjs can import this
// under plain node, which doesn't do bundler-style extensionless resolution.
import { pool } from "./pool.js";
import { YAHOO_USER_AGENT } from "./userAgent.js";

// Shared access to Yahoo Finance's unofficial chart endpoint, which needs no
// API key but blocks non-browser User-Agents with a 429 - a plain fetch() UA
// gets throttled. Used by the ticker tape (fixed instrument list) and by the
// watchlist quotes route (arbitrary user-chosen tickers).

// Last price plus the change since the previous close, or null if Yahoo has
// nothing usable for this symbol (delisted ticker, typo, upstream error).
export async function fetchYahooQuote(symbol, revalidate = 60) {
  try {
    // range=1d matters: chartPreviousClose is the close *before the requested
    // range*, so a wider range quietly turns changePct into a multi-day move.
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": YAHOO_USER_AGENT },
      next: { revalidate },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    const prevClose = meta?.chartPreviousClose;
    if (typeof price !== "number" || typeof prevClose !== "number" || !prevClose) {
      throw new Error("Missing price data");
    }
    return {
      price,
      changePct: ((price - prevClose) / prevClose) * 100,
      name: meta.longName || meta.shortName || null,
      currency: meta.currency || null,
    };
  } catch {
    return null;
  }
}

// A watchlist can hold dozens of tickers; firing them all at once is what
// gets this endpoint to start refusing requests, so they go out in a small
// pool instead. Results keep the input order.
export async function fetchYahooQuotes(symbols, concurrency = 6) {
  return pool(symbols, concurrency, (symbol) => fetchYahooQuote(symbol));
}
