// Closing prices on a set of quarter ends, for the replication chart on a
// manager's page.
//
// Yahoo's chart endpoint gives a whole daily series in one request, so a
// ticker is asked for once and read at every quarter end rather than once per
// quarter - five quarters of a fifty-name book is fifty requests this way and
// two hundred and fifty the other.
import { pool } from "./pool.js";
import { YAHOO_USER_AGENT } from "./userAgent.js";

// Two years covers five quarter ends with room for the oldest to land on a
// holiday and need the trading day before it.
const RANGE = "2y";
// Prices for a quarter that has already ended never change, so this is cached
// for the same six hours as everything else on these pages.
const REVALIDATE = 21_600;
const CONCURRENCY = 6;

// A quarter end is a calendar date and often not a trading day - March 31st
// falls on a weekend often enough to matter - so the close taken is the last
// one on or before it. A week is enough for any holiday run; beyond that the
// series genuinely doesn't cover the date and the answer is nothing rather
// than a price from an unrelated month.
const MAX_LOOKBACK_DAYS = 7;

// One symbol's daily closes as [epochSeconds, close], oldest first.
async function dailyCloses(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${RANGE}`;
    const res = await fetch(url, {
      headers: { "User-Agent": YAHOO_USER_AGENT },
      next: { revalidate: REVALIDATE },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    const stamps = result?.timestamp;
    const closes = result?.indicators?.quote?.[0]?.close;
    if (!Array.isArray(stamps) || !Array.isArray(closes)) return null;
    // Yahoo pads the series with nulls on halts and holidays. Those aren't
    // prices, and one picked up as a quarter end would be a hole in the chart.
    const series = [];
    for (let i = 0; i < stamps.length; i++) {
      if (typeof closes[i] === "number" && closes[i] > 0) series.push([stamps[i], closes[i]]);
    }
    return series.length ? series : null;
  } catch {
    return null;
  }
}

const dayMs = 86_400_000;

function closeOnOrBefore(series, iso) {
  const target = Date.parse(`${iso}T23:59:59Z`);
  if (Number.isNaN(target)) return null;
  const floor = target - MAX_LOOKBACK_DAYS * dayMs;
  let best = null;
  let bestAt = -Infinity;
  for (const [seconds, close] of series) {
    const at = seconds * 1000;
    if (at > target || at < floor) continue;
    if (at > bestAt) {
      bestAt = at;
      best = close;
    }
  }
  return best;
}

// A `(ticker, quarterEnd) => close | null` over the symbols given. Symbols
// Yahoo has nothing for simply answer null, which is what the replication
// treats as "leave this holding out of the average" rather than as a zero.
export async function quarterCloses(symbols, periods) {
  const unique = [...new Set(symbols.filter(Boolean))];
  const series = await pool(unique, CONCURRENCY, dailyCloses);

  const table = new Map();
  unique.forEach((symbol, i) => {
    if (!series[i]) return;
    const byPeriod = new Map();
    for (const period of periods) {
      const close = closeOnOrBefore(series[i], period);
      if (close != null) byPeriod.set(period, close);
    }
    if (byPeriod.size) table.set(symbol, byPeriod);
  });

  return (ticker, period) => table.get(ticker)?.get(period) ?? null;
}
