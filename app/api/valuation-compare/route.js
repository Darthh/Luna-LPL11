import { valuationSeries } from "../valuation-history/route";

// Up to three tickers side by side, for the comparison graph. Each one is the
// valuation-history route's own series builder - same fundamentals, same TTM
// windows, same filing lag - so a multiple means the same thing on both pages
// and this route is a fan-out rather than a second implementation.
//
// One failing ticker must not take the other two down with it: a symbol with
// no filings comes back with an error against its name and the chart draws the
// rest.

export const maxDuration = 60;

const MAX = 3;

export async function GET(request) {
  const symbols = [
    ...new Set(
      (request.nextUrl.searchParams.get("symbols") ?? "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    ),
  ].slice(0, MAX);
  const range = request.nextUrl.searchParams.get("range") ?? "3y";

  if (!symbols.length) return Response.json({ error: "No symbols" }, { status: 400 });

  const results = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const series = await valuationSeries(symbol, range);
        if (!series.length) return { symbol, error: "No fundamentals for that symbol" };
        return { symbol, series };
      } catch (err) {
        return { symbol, error: String(err.message ?? err) };
      }
    })
  );

  return Response.json(
    { range, results },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } }
  );
}
