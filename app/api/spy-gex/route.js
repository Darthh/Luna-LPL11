import { buildGexRows, GEX_SYMBOLS } from "@/lib/gex";
import { invalidateYahooSession, yahooSession } from "@/lib/symbolProfile";
import { YAHOO_USER_AGENT } from "@/lib/userAgent";
import { tradierGexChain } from "@/lib/tradierGex";

const SUPPORTED_SYMBOLS = new Set(GEX_SYMBOLS);

async function fetchChain(session, symbol, expiration) {
  const date = expiration ? `&date=${expiration}` : "";
  const url = `https://query2.finance.yahoo.com/v7/finance/options/${symbol}?crumb=${encodeURIComponent(session.crumb)}${date}`;
  const response = await fetch(url, {
    headers: { "User-Agent": YAHOO_USER_AGENT, Cookie: session.cookie },
    next: { revalidate: 20 },
  });
  if (!response.ok) throw new Error(`Yahoo options HTTP ${response.status}`);
  const result = (await response.json())?.optionChain?.result?.[0];
  if (!result) throw new Error(`${symbol} option chain unavailable`);
  return result;
}

async function loadChain(symbol, expiration) {
  let session = await yahooSession();
  try {
    return await fetchChain(session, symbol, expiration);
  } catch {
    invalidateYahooSession();
    session = await yahooSession({ fresh: true });
    return fetchChain(session, symbol, expiration);
  }
}

// How far either side of spot the heatmap reaches. The rows are a read on where
// dealers are positioned around the current price, so a tighter window keeps the
// strikes that actually matter on screen.
//
// This is a percentage rather than a fixed dollar amount because the band has to
// mean the same thing across very different share prices: a flat $10 is ~1.3% of
// SPY but ~18% of a $56 ETF, which would show a handful of strikes on one ticker
// and pages of far-OTM noise on another. 1.3% reproduces the previous +/-$10
// window at SPY's price.
const STRIKE_WINDOW_PCT = 0.013;
// Thinly-struck ETFs ($2.50 increments) would otherwise return only a few rows,
// so the band always spans at least this many strikes either side of spot.
const MIN_STRIKES_PER_SIDE = 10;

function newYorkDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export async function GET(request) {
  const requestedSymbol = request.nextUrl.searchParams.get("symbol")?.trim().toUpperCase() || "SPY";
  if (!SUPPORTED_SYMBOLS.has(requestedSymbol)) {
    return Response.json({ error: `GEX is available for ${GEX_SYMBOLS.join(", ")}.` }, { status: 400 });
  }
  const symbol = requestedSymbol;
  const requested = Number(request.nextUrl.searchParams.get("expiration"));
  const zeroDte = request.nextUrl.searchParams.get("zeroDte") === "1";
  try {
    const marketDate = newYorkDateKey();
    let tradier = null;
    if (process.env.TRADIER_API_TOKEN) {
      try {
        tradier = await tradierGexChain(symbol, { zeroDte, requested, marketDate });
      } catch (error) {
        console.warn(`${symbol} Tradier options unavailable; falling back to Yahoo`, error);
      }
    }
    if (tradier && !tradier.available) {
      return Response.json({ symbol, available: false, marketDate, updatedAt: Date.now() });
    }
    let result = tradier ? null : await loadChain(symbol);
    const allExpirations = tradier ? tradier.expirations : result.expirationDates || [];
    const zeroDteExpiration = allExpirations.find((expiration) => new Date(expiration * 1000).toISOString().slice(0, 10) === marketDate);
    if (zeroDte && !zeroDteExpiration) return Response.json({ symbol, available: false, marketDate, updatedAt: Date.now() });
    const twoWeeksFromNow = Math.floor(Date.now() / 1000) + 14 * 86400;
    const expirations = allExpirations.filter((expiration) => expiration <= twoWeeksFromNow);
    const selectedExpiration = zeroDte ? zeroDteExpiration : expirations.includes(requested) ? requested : expirations[0];
    if (!selectedExpiration) throw new Error(`No listed ${symbol} expirations`);
    if (!tradier && result.options?.[0]?.expirationDate !== selectedExpiration) {
      result = await loadChain(symbol, selectedExpiration);
    }
    const optionSet = tradier ? tradier : result.options?.[0];
    const spot = Number(tradier ? tradier.spot : result.quote?.regularMarketPrice);
    if (!optionSet || !(spot > 0)) throw new Error(`Incomplete ${symbol} option chain`);

    const centerStrike = Math.round(spot);
    // Widen the percentage band to MIN_STRIKES_PER_SIDE using the chain's own
    // strike spacing, so a $2.50-increment ETF still fills the heatmap.
    const listedStrikes = [...new Set((optionSet.calls || []).map((option) => option.strike))].sort((a, b) => a - b);
    const spacing = listedStrikes.slice(1).reduce(
      (min, strike, index) => Math.min(min, strike - listedStrikes[index]),
      Infinity,
    );
    const window = Math.max(
      spot * STRIKE_WINDOW_PCT,
      Number.isFinite(spacing) ? spacing * MIN_STRIKES_PER_SIDE : 0,
    );
    const strikeLow = centerStrike - window;
    const strikeHigh = centerStrike + window;
    const rows = buildGexRows({
      calls: optionSet.calls,
      puts: optionSet.puts,
      spot,
      expiresAt: selectedExpiration,
    }).filter((row) => (row.totalOpenInterest || row.totalVolume) && row.strike >= strikeLow && row.strike <= strikeHigh);
    const callGex = rows.reduce((sum, row) => sum + row.callGex, 0);
    const putGex = rows.reduce((sum, row) => sum + row.putGex, 0);
    const callWall = rows.reduce((best, row) => row.callGex > (best?.callGex || 0) ? row : best, null);
    const putWall = rows.reduce((best, row) => row.putGex > (best?.putGex || 0) ? row : best, null);
    const maxNetRow = rows.reduce((best, row) => Math.abs(row.netGex) > Math.abs(best?.netGex || 0) ? row : best, null);
    const secondNetRow = rows.reduce((best, row) => row !== maxNetRow && Math.abs(row.netGex) > Math.abs(best?.netGex || 0) ? row : best, null);

    return Response.json({
      symbol,
      available: true,
      marketDate,
      spot,
      selectedExpiration,
      expirations,
      source: tradier ? "tradier" : "yahoo",
      strikeBounds: { low: strikeLow, high: strikeHigh },
      rows,
      summary: {
        callGex,
        putGex,
        netGex: callGex - putGex,
        volume: rows.reduce((sum, row) => sum + row.totalVolume, 0),
        callWall: callWall?.strike ?? null,
        putWall: putWall?.strike ?? null,
      },
      indicator: maxNetRow ? { strike: maxNetRow.strike, netGex: maxNetRow.netGex } : null,
      secondaryIndicator: secondNetRow ? { strike: secondNetRow.strike, netGex: secondNetRow.netGex } : null,
      updatedAt: Date.now(),
      methodology: `Estimated dollar gamma per 1% ${symbol} move; calls positive and puts negative.`,
    }, {
      // Matches the 20s option-chain TTL above. Short, but this handler prices
      // a whole chain - every second of it is a fan-out someone else paid for.
      headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=120" },
    });
  } catch (error) {
    console.error(`${symbol} GEX fetch failed`, error);
    return Response.json({ error: `${symbol} options data is temporarily unavailable.` }, { status: 502 });
  }
}
