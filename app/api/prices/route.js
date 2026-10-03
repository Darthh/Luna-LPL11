import { auth } from "@/auth";
import { parseTwelveDataResponse, TwelveDataError } from "@/lib/twelveDataParser";
import { checkRateLimit, ANON_LIMIT, SIGNED_IN_LIMIT } from "@/lib/rateLimit";

// Twelve Data expects crypto pairs as "BASE/QUOTE" (e.g. "BTC/USD"), not a
// bare equity-style symbol. Any "XXX-USD" ticker a user types needs
// translating, or Twelve Data silently resolves it to an unrelated
// instrument instead of erroring.
function toTwelveDataSymbol(ticker) {
  const match = ticker.match(/^([A-Z0-9]+)-USD$/);
  return match ? `${match[1]}/USD` : ticker;
}

export async function GET(request) {
  const ticker = request.nextUrl.searchParams.get("ticker")?.trim();
  if (!ticker) {
    return Response.json({ error: "Missing ticker" }, { status: 400 });
  }

  // Signed-in users get a much higher hourly quota, metered per account;
  // anonymous traffic is metered per IP.
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rate = await checkRateLimit(userId ?? `ip:${ip}`, userId ? SIGNED_IN_LIMIT : ANON_LIMIT);
  if (!rate.ok) {
    const error = userId
      ? "Hourly request limit reached. Please try again later."
      : "Hourly request limit reached. Sign in for a higher limit, or try again later.";
    return Response.json(
      { error },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  const apiKey = process.env.TWELVEDATA_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Price API is not configured" }, { status: 502 });
  }

  const url = new URL("https://api.twelvedata.com/time_series");
  url.searchParams.set("symbol", toTwelveDataSymbol(ticker.toUpperCase()));
  url.searchParams.set("interval", "1day");
  // ~252 trading days a year, so 1400 covers the chart's longest "5y" zoom
  // with room to spare. Twelve Data caps outputsize at 5000.
  url.searchParams.set("outputsize", "1400");
  url.searchParams.set("format", "JSON");
  url.searchParams.set("apikey", apiKey);

  let res;
  try {
    res = await fetch(url, { next: { revalidate: 3600 } });
  } catch {
    return Response.json({ error: "Price data upstream unreachable" }, { status: 502 });
  }

  const json = await res.json();

  try {
    const { dates, closes } = parseTwelveDataResponse(json);
    return Response.json({ dates, closes });
  } catch (e) {
    if (e instanceof TwelveDataError) {
      return Response.json({ error: e.message, planRestricted: e.planRestricted }, { status: 400 });
    }
    return Response.json({ error: "Unexpected price data format" }, { status: 502 });
  }
}
