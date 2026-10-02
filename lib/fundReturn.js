// An estimated year-over-year return for a 13F book.
//
// No filing contains a manager's return. A 13F reports what was held on one
// day and never what it cost, so the honest most that can be said is: these
// were the weights, and this is what those shares have done over the last
// year. The page has to label it an estimate, because that is what it is - shorts,
// options, cash, leverage and every trade since the report date are outside a
// 13F entirely.
import { pool } from "./pool.js";
import { YAHOO_USER_AGENT } from "./userAgent.js";

// The largest positions carry the book's movement, and the tail is a long line
// of holdings worth a rounding error each. Twenty-five is where the weight
// stops mattering and the request count starts to.
export const RETURN_HOLDINGS = 25;

// Half the sampled book unpriced is a guess rather than an estimate, and a
// number with nothing behind it reads exactly like one with something behind
// it. Below this, the page says "n/a" instead.
const MIN_PRICED = 0.5;

// Yahoo's trailing one-year window on one ticker: the close a year ago
// against the most recent one.
export async function yoyChange(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": YAHOO_USER_AGENT },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    // Yahoo pads the series with nulls on halts and holidays; those aren't
    // prices and mustn't become the window's opening one.
    const closes = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter(
      (c) => typeof c === "number"
    );
    if (!closes || closes.length < 2 || !closes[0]) return null;
    return ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100;
  } catch {
    return null;
  }
}

// Value-weighted across whatever priced, not across everything sampled: a
// holding Yahoo has no answer for has to leave the average rather than enter
// it as a zero, which would quietly drag the estimate toward flat.
export async function estimatedYoy(holdings, change = yoyChange) {
  const top = holdings.filter((h) => h.ticker).slice(0, RETURN_HOLDINGS);
  if (!top.length) return null;
  const changes = await pool(top, 6, (h) => change(h.ticker));

  let priced = 0;
  let weighted = 0;
  top.forEach((h, i) => {
    if (changes[i] == null) return;
    priced += h.value;
    weighted += h.value * changes[i];
  });
  const sampled = top.reduce((a, h) => a + h.value, 0);
  return priced > 0 && priced >= sampled * MIN_PRICED ? weighted / priced : null;
}
