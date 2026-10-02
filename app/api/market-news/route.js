// Headlines for the market-news panel on the home dashboard.
//
// Yahoo's search endpoint answers with news beside quotes and needs no key,
// which is what makes it usable here - lib/newsResearch.js is the Finnhub
// path, and that needs a key this deployment does not carry.
import { BROWSER_USER_AGENT } from "@/lib/userAgent";

// Broad-market tickers rather than a topic: Yahoo has no "market news" feed,
// but the news attached to the index ETFs is exactly the macro reporting the
// panel wants. Several, because each returns only a handful and they overlap.
const SEEDS = ["SPY", "QQQ", "DIA"];
// Three headlines. The panel is a glance at what moved the tape, not a feed -
// a dozen rows pushed the chart below the fold for no one's benefit.
const LIMIT = 3;

async function fetchNews(symbol) {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&newsCount=10&quotesCount=0`;
  const res = await fetch(url, {
    headers: { "User-Agent": BROWSER_USER_AGENT },
    next: { revalidate: 600 },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json())?.news ?? [];
}

export async function GET() {
  const settled = await Promise.allSettled(SEEDS.map(fetchNews));
  const seen = new Set();
  const items = [];
  for (const r of settled) {
    if (r.status !== "fulfilled") continue;
    for (const n of r.value) {
      // The same story comes back under more than one seed ticker, so the
      // uuid is what keeps the panel from printing it three times.
      if (!n?.uuid || seen.has(n.uuid) || !n.title || !n.link) continue;
      seen.add(n.uuid);
      items.push({
        id: n.uuid,
        title: n.title,
        link: n.link,
        publisher: n.publisher ?? null,
        published: n.providerPublishTime ?? null,
      });
    }
  }
  if (!items.length) return Response.json({ error: "News unavailable" }, { status: 502 });

  items.sort((a, b) => (b.published ?? 0) - (a.published ?? 0));
  return Response.json(
    { items: items.slice(0, LIMIT) },
    { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" } }
  );
}
