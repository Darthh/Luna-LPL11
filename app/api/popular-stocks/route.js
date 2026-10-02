import { simulatedPopularStocks } from "@/lib/popularStocksDemo";
import { YAHOO_USER_AGENT } from "@/lib/userAgent";

export const revalidate = 300;

const HTML_ENTITIES = { "&amp;": "&", "&quot;": '"', "&#39;": "'", "&lt;": "<", "&gt;": ">" };
function decodeEntities(s) {
  return s.replace(/&amp;|&quot;|&#39;|&lt;|&gt;/g, (m) => HTML_ENTITIES[m]);
}

async function fetchLive() {
  const res = await fetch("https://apewisdom.io/api/v1.0/filter/all-stocks/page/1", {
    headers: { "User-Agent": YAHOO_USER_AGENT },
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const results = json?.results;
  if (!Array.isArray(results) || !results.length) throw new Error("Missing results");

  return results.slice(0, 20).map((r) => ({
    rank: r.rank,
    ticker: r.ticker,
    name: decodeEntities(String(r.name ?? r.ticker)),
    mentions: r.mentions,
    upvotes: r.upvotes,
    mentionChange: r.mentions - (r.mentions_24h_ago ?? r.mentions),
  }));
}

export async function GET() {
  try {
    const stocks = await fetchLive();
    return Response.json(
      { stocks, isDemo: false },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } }
    );
  } catch {
    return Response.json({ stocks: simulatedPopularStocks(), isDemo: true });
  }
}
