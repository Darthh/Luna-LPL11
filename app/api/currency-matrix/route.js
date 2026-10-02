// Cross-rate performance matrix: how each currency moved against each of the
// others over a window. Every cell is derived from the two currencies' moves
// against the USD rather than from its own pair feed - 10 currencies is 45
// crosses, and quoting them directly would be 45 upstream requests for a table
// that 9 requests already determine exactly.
import { YAHOO_USER_AGENT } from "@/lib/userAgent";
import { MATRIX_CURRENCIES } from "@/lib/compareBoards";

const RANGES = { "1m": "1mo", "3m": "3mo", "6m": "6mo", "1y": "1y", "3y": "3y", "5y": "5y" };

// Yahoo has no USDUSD feed and quotes some pairs the other way round, so each
// non-USD currency carries the pair that exists plus which side of it it is
// on. `usdPerUnit` is what the rate means once fetched: how many dollars one
// unit of the currency buys.
const PAIRS = {
  EUR: { symbol: "EURUSD=X", usdPerUnit: true },
  GBP: { symbol: "GBPUSD=X", usdPerUnit: true },
  AUD: { symbol: "AUDUSD=X", usdPerUnit: true },
  NZD: { symbol: "NZDUSD=X", usdPerUnit: true },
  JPY: { symbol: "USDJPY=X", usdPerUnit: false },
  CHF: { symbol: "USDCHF=X", usdPerUnit: false },
  CAD: { symbol: "USDCAD=X", usdPerUnit: false },
  SEK: { symbol: "USDSEK=X", usdPerUnit: false },
  NOK: { symbol: "USDNOK=X", usdPerUnit: false },
};

async function fetchCloses(symbol, range) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": YAHOO_USER_AGENT },
    next: { revalidate: 900 },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const closes = (await res.json())?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
  const clean = closes.filter((c) => typeof c === "number");
  if (clean.length < 2) throw new Error("No history");
  return { first: clean[0], last: clean[clean.length - 1] };
}

export async function GET(request) {
  const rangeKey = request.nextUrl.searchParams.get("range") ?? "1y";
  const range = RANGES[rangeKey];
  if (!range) return Response.json({ error: "Bad range" }, { status: 400 });

  const codes = Object.keys(PAIRS);
  let growth;
  try {
    const results = await Promise.all(codes.map((c) => fetchCloses(PAIRS[c].symbol, range)));
    // Each currency's gain measured in dollars over the window. The USD is the
    // numeraire, so it is flat against itself by construction.
    growth = { USD: 1 };
    codes.forEach((code, i) => {
      const { first, last } = results[i];
      const ratio = last / first;
      // A pair quoted the other way (USDJPY) rises when the currency falls, so
      // its growth in USD terms is the reciprocal.
      growth[code] = PAIRS[code].usdPerUnit ? ratio : 1 / ratio;
    });
  } catch {
    return Response.json({ error: "Currency data unavailable" }, { status: 502 });
  }

  // Row currency measured in the column currency: the row's dollar move
  // divided by the column's. The diagonal is null rather than zero, so the
  // table can leave it blank instead of printing a meaningless 0.0%.
  const order = MATRIX_CURRENCIES.map((c) => c.code).filter((c) => growth[c] != null);
  const rows = order.map((row) => ({
    code: row,
    cells: order.map((col) => (row === col ? null : (growth[row] / growth[col] - 1) * 100)),
  }));

  return Response.json(
    { range: rangeKey, codes: order, rows },
    { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" } }
  );
}
