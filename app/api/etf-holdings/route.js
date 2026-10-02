// Full ETF constituent list for the holdings wheel on the stock page. The
// scrape itself lives in lib/etfHoldings so the fund-backed stock maps can
// share it.
import { fetchEtfHoldings } from "@/lib/etfHoldings";

export async function GET(request) {
  const symbol = request.nextUrl.searchParams.get("symbol")?.trim().toUpperCase();
  if (!symbol || !/^[A-Z0-9.^=-]{1,16}$/.test(symbol)) {
    return Response.json({ error: "Bad symbol" }, { status: 400 });
  }

  try {
    const data = await fetchEtfHoldings(symbol);
    return Response.json(
      { symbol, ...data },
      { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } }
    );
  } catch {
    return Response.json({ error: "No holdings data" }, { status: 404 });
  }
}
