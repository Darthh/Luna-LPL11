import { fetchEtfHoldings } from "@/lib/etfHoldings";
import { fetchYahooQuotes } from "@/lib/yahooQuote";

// Biggest movers inside one of the index ETFs on the rail. The constituents
// come from the same holdings scrape the wheel uses (top 25 by weight), then
// get quoted in one batch and sorted - a full index membership list would be
// hundreds of quotes per refresh for a panel that only ever shows twelve rows.
const INDEXES = new Set(["SPY", "QQQ", "SOXX"]);

export async function GET(request) {
  const symbol = request.nextUrl.searchParams.get("index")?.trim().toUpperCase();
  if (!INDEXES.has(symbol)) return Response.json({ error: "Bad index" }, { status: 400 });

  let symbols;
  try {
    const { holdings } = await fetchEtfHoldings(symbol);
    symbols = [...new Set((holdings ?? []).map((h) => h.symbol).filter(Boolean))];
  } catch {
    return Response.json({ error: "No holdings data" }, { status: 502 });
  }
  if (!symbols.length) return Response.json({ error: "No holdings data" }, { status: 502 });

  const quotes = await fetchYahooQuotes(symbols);
  const rows = symbols
    .map((s, i) => ({
      symbol: s,
      name: quotes[i]?.name ?? null,
      price: quotes[i]?.price ?? null,
      changePct: quotes[i]?.changePct ?? null,
    }))
    .filter((r) => Number.isFinite(r.changePct))
    .sort((a, b) => b.changePct - a.changePct);

  return Response.json(
    { index: symbol, gainers: rows.slice(0, 6), losers: rows.slice(-6).reverse() },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } }
  );
}
