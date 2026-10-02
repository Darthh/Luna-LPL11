// Self-check for the quote helper: `node scripts/test-yahoo-quote.mjs`.
// Hits Yahoo for real, because the bug this guards against is invisible
// offline: chartPreviousClose is the close *before* the requested range, so
// widening the range silently turns changePct into a multi-day move that
// still looks like a plausible daily number.
import assert from "node:assert/strict";
import { fetchYahooQuote } from "../lib/yahooQuote.js";

const symbol = "AAPL";
const quote = await fetchYahooQuote(symbol, 0);
assert.ok(quote, `no quote for ${symbol} - upstream down or blocked?`);

// The same window the helper claims to report, computed independently from
// the daily bars: last close vs the close before it.
const res = await fetch(
  `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1mo`,
  { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } }
);
const closes = (await res.json()).chart.result[0].indicators.quote[0].close.filter(
  (c) => typeof c === "number"
);
const [prevClose] = closes.slice(-2);
const dayPct = ((quote.price - prevClose) / prevClose) * 100;

// Same session, so the two must agree; a 5d range misses by whole percent.
assert.ok(
  Math.abs(quote.changePct - dayPct) < 0.05,
  `changePct ${quote.changePct.toFixed(2)}% is not the daily move ${dayPct.toFixed(2)}%`
);

console.log(`yahooQuote: ${symbol} ${quote.changePct.toFixed(2)}% daily - all checks passed`);
