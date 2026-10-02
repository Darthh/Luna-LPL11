import { fetchYahooQuotes } from "@/lib/yahooQuote";
import { parseSymbolList } from "@/lib/watchlist";

// Live quotes for an arbitrary list of tickers, backing both the watchlist
// page's rows and the ticker bar when it's showing the user's watchlist.
// Unlike /api/ticker-tape there's no simulated fallback: the symbols here are
// the user's own picks, and inventing a price for one is worse than showing
// it as unavailable.
export async function GET(request) {
  const symbols = parseSymbolList(request.nextUrl.searchParams.get("symbols"));
  if (!symbols.length) return Response.json({ quotes: [] });

  const results = await fetchYahooQuotes(symbols);
  const quotes = symbols.map((symbol, i) => {
    const quote = results[i];
    return {
      key: symbol,
      symbol,
      label: symbol,
      name: quote?.name ?? null,
      price: quote?.price ?? null,
      changePct: quote?.changePct ?? null,
      live: Boolean(quote),
    };
  });

  return Response.json(
    { quotes },
    // Keyed by the symbol list in the URL, so two users watching the same
    // tickers share a cached response.
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } }
  );
}
