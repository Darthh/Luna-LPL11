import { describeSymbols } from "@/lib/symbolProfile";
import { parseSymbolList } from "@/lib/watchlist";

// The slow-moving half of a watchlist row: market cap (or, for a fund, the
// assets it holds) and the company name. Split from /api/watchlist-quotes
// because prices refresh every minute and none of this does - and because it
// comes from the same describeSymbols() the stock map uses, so a row and its
// tile can never disagree about how big a company is.
export async function GET(request) {
  const symbols = parseSymbolList(request.nextUrl.searchParams.get("symbols"));
  if (!symbols.length) return Response.json({ meta: {} });

  const described = await describeSymbols(symbols.map((symbol) => ({ symbol })));
  const meta = Object.fromEntries(
    described.map((s) => [
      s.symbol,
      { name: s.name, cap: s.cap, capKind: s.capKind, sector: s.sector },
    ])
  );

  return Response.json(
    { meta },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } }
  );
}
