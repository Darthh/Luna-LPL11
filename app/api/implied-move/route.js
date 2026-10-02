import { impliedMovePercent, pickExpiration } from "@/lib/impliedMove";
import { pool } from "@/lib/pool";
import { invalidateYahooSession, yahooSession } from "@/lib/symbolProfile";
import { YAHOO_USER_AGENT } from "@/lib/userAgent";

// The earnings feed carries no implied move - it is an options number, not a
// calendar one - so the weekly grid asks for it separately. One request covers
// a whole week of tickers rather than one per tile, because a busy week runs
// past sixty symbols and that many round trips from the browser would arrive
// as sixty spinners.
const MAX_SYMBOLS = 90;
const CONCURRENCY = 6;

async function fetchChain(symbol, session, expiration) {
  const date = expiration ? `&date=${expiration}` : "";
  const url = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}?crumb=${encodeURIComponent(session.crumb)}${date}`;
  const response = await fetch(url, {
    headers: { "User-Agent": YAHOO_USER_AGENT, Cookie: session.cookie },
    next: { revalidate: 60 * 15 },
  });
  if (!response.ok) throw new Error(`Yahoo options HTTP ${response.status}`);
  const result = (await response.json())?.optionChain?.result?.[0];
  if (!result) throw new Error(`No chain for ${symbol}`);
  return result;
}

// Two fetches per symbol: the first lists expirations, the second pulls the
// one that actually covers the report. Yahoo returns the front expiration by
// default, which for a report later in the week prices no event at all.
async function impliedMoveFor(symbol, earningsDate, session) {
  const first = await fetchChain(symbol, session);
  const spot = Number(first.quote?.regularMarketPrice);
  if (!(spot > 0)) return null;

  const expiration = pickExpiration(first.expirationDates, earningsDate);
  if (!expiration) return null;

  const chain =
    first.options?.[0]?.expirationDate === expiration
      ? first
      : await fetchChain(symbol, session, expiration);
  const optionSet = chain.options?.[0];
  if (!optionSet) return null;

  const percent = impliedMovePercent({ calls: optionSet.calls, puts: optionSet.puts, spot });
  return percent === null ? null : { percent, expiration };
}

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  // symbol:date pairs - the report date decides which expiration is the one
  // covering the print, and it differs per symbol across a week.
  const requested = (params.get("symbols") || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, MAX_SYMBOLS)
    .map((entry) => {
      const [symbol, date] = entry.split(":");
      return { symbol: (symbol || "").toUpperCase(), date: date || "" };
    })
    .filter((entry) => /^[A-Z0-9.\-]{1,12}$/.test(entry.symbol) && /^\d{4}-\d{2}-\d{2}$/.test(entry.date));

  if (!requested.length) return Response.json({ moves: {} });

  let session;
  try {
    session = await yahooSession();
  } catch {
    return Response.json({ error: "Options data is temporarily unavailable." }, { status: 502 });
  }

  let rejectedCrumb = false;
  const results = await pool(requested, CONCURRENCY, async ({ symbol, date }) => {
    try {
      return [symbol, await impliedMoveFor(symbol, date, session)];
    } catch (error) {
      // A symbol with no listed options is the common case here, not a fault -
      // plenty of the smaller names in the grid have no chain at all. Only a
      // rejected crumb is worth reporting, since that fails every symbol.
      if (String(error?.message || "").includes("401")) rejectedCrumb = true;
      return [symbol, null];
    }
  });

  if (rejectedCrumb) invalidateYahooSession();

  const moves = {};
  for (const [symbol, value] of results) if (value) moves[symbol] = value;
  return Response.json({ moves });
}
