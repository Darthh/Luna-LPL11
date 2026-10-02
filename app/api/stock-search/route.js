// Ticker autocomplete for the header search bar, proxying Yahoo's
// search endpoint (no API key needed) so the browser avoids CORS.
import { YAHOO_USER_AGENT } from "@/lib/userAgent";
import { rankQuotes } from "@/lib/searchRank";

// Easter egg: typing the creator's handle surfaces a ticker Yahoo has never
// heard of, which /stock/PATRICKV renders as a picture instead of a chart.
const EASTER_EGG = {
  symbol: "PATRICKV",
  name: "Creator of Luna Terminal",
  exchange: "San Diego",
  type: "EQUITY",
};

function isEasterEgg(q) {
  return q.toLowerCase().replace(/[^a-z]/g, "") === "patrickv";
}

export async function GET(request) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q) return Response.json({ results: [] });
  if (isEasterEgg(q)) return Response.json({ results: [EASTER_EGG] });

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&listsCount=0`;
    const json = await (
      await fetch(url, { headers: { "User-Agent": YAHOO_USER_AGENT }, next: { revalidate: 3600 } })
    ).json();
    const results = rankQuotes(
      (json?.quotes ?? [])
        .filter((r) => r?.symbol && (r.quoteType === "EQUITY" || r.quoteType === "ETF"))
        .map((r) => ({
          symbol: r.symbol,
          name: r.shortname ?? r.longname ?? r.symbol,
          exchange: r.exchDisp ?? null,
          type: r.quoteType,
        })),
      q
    ).slice(0, 8);
    // Autocomplete fires per keystroke; an hour at the edge means the common
    // prefixes stop reaching Yahoo at all.
    return Response.json(
      { results },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } }
    );
  } catch {
    return Response.json({ results: [] });
  }
}
