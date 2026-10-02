import { STOCK_UNIVERSE } from "@/lib/stockMapData";
import { INDEXES, INDEX_BY_KEY, METRICS } from "@/lib/scatterMetrics";
import { yahooSession, invalidateYahooSession } from "@/lib/symbolProfile";
import { YAHOO_USER_AGENT } from "@/lib/userAgent";
import { memo } from "@/lib/memo";
import { pool } from "@/lib/pool";

// Every fundamental the scatter can put on either axis, for one index's
// constituents at a time.
//
// quoteSummary answers for one symbol per request and there is no batch form of
// it, so a cold build is a hundred round trips. That's the whole reason for the
// memo below - the numbers move once a quarter, and nobody should wait for a
// hundred requests twice.
export const maxDuration = 60;

// Membership comes from the static universe rather than a live constituent
// feed: it's already here, it's what the maps and the supply chain draw from,
// and an index's members change a few times a year. See lib/stockMapData.js for
// how to regenerate it.
const MODULES = [...new Set(METRICS.map((m) => m.module))].join(",");
const CONCURRENCY = 6;

// A quarter of a day: these are quarterly filings dressed as live figures, so
// the only thing a shorter window buys is more load on an endpoint that starts
// refusing requests when leaned on.
const TTL = 6 * 3600 * 1000;
const indexRows = memo(TTL, { max: INDEXES.length });

const raw = (v) => (typeof v?.raw === "number" ? v.raw : typeof v === "number" ? v : null);

async function fetchOne(symbol, session) {
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${MODULES}&crumb=${encodeURIComponent(session.crumb)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": YAHOO_USER_AGENT, Cookie: session.cookie },
    next: { revalidate: 21600 },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const result = json?.quoteSummary?.result?.[0];
  if (!result) return null;

  const metrics = {};
  for (const m of METRICS) {
    const value = raw(result[m.module]?.[m.path]);
    // A missing fundamental is a hole, not a zero - a company with no P/E
    // because it loses money must not land on the axis at zero as though it
    // were the cheapest name on the chart.
    metrics[m.key] = value == null ? null : value * (m.scale ?? 1);
  }
  return metrics;
}

async function build(indexKey) {
  const members = STOCK_UNIVERSE.filter((s) => s.indexes?.includes(indexKey));

  // One session for the whole batch: the crumb is part of every URL, so a
  // stable one is also what lets these responses hit Next's data cache.
  let session = await yahooSession();
  const rows = await pool(members, CONCURRENCY, async (stock) => {
    let metrics = null;
    for (let attempt = 0; attempt < 2 && !metrics; attempt++) {
      try {
        metrics = await fetchOne(stock.symbol, session);
      } catch {
        // A rejected crumb takes every symbol after it down too, so the first
        // failure re-authenticates rather than being retried against the pair
        // that just got turned away.
        if (attempt === 0) {
          invalidateYahooSession();
          session = await yahooSession({ fresh: true });
        }
      }
    }
    if (!metrics) return null;
    return { symbol: stock.symbol, name: stock.name, sector: stock.sector ?? null, ...metrics };
  });

  return {
    rows: rows.filter(Boolean),
    members: members.length,
    asOf: new Date().toISOString(),
  };
}

export async function GET(request) {
  const index = request.nextUrl.searchParams.get("index") ?? "qqq";
  const entry = INDEX_BY_KEY[index];
  if (!entry) return Response.json({ error: "Unknown index" }, { status: 400 });

  try {
    const payload = await indexRows(index, () => build(entry.member));
    // Empty means Yahoo turned away the whole batch, which is a failure the
    // page should be able to retry rather than an index with no companies.
    if (!payload.rows.length) throw new Error("No rows");
    return Response.json(
      { index, label: entry.label, ...payload },
      { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } }
    );
  } catch {
    return Response.json(
      { error: "Fundamentals are unavailable right now. Try again in a moment.", retryable: true },
      { status: 503 }
    );
  }
}
