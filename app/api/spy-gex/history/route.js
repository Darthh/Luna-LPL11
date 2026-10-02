// Server-side history of the 0DTE maximum-Net-GEX strike, so the yellow dots
// on the RsiLE chart are the same for every visitor and survive a browser that
// has never had the chart open. Previously each browser accumulated its own
// localStorage copy, so a first-time user saw an empty chart.
//
// Reuses the generic ClipSnapshot key/value store rather than adding a table.
// payload is a TEXT column, so the series is JSON-encoded by hand.
//
// This record is shared by every visitor and is written by unauthenticated
// pollers, so the strike is NEVER taken from the request body: a POST is only
// a nudge to sample, and the server reads the option chain itself. Otherwise
// anyone could permanently poison the chart for all users with a crafted POST.
import { prisma } from "@/lib/prisma";
import { GEX_SYMBOLS } from "@/lib/gex";

export const dynamic = "force-dynamic";

// Whitelisted so a caller cannot mint unbounded ClipSnapshot rows or point the
// upstream Yahoo fetch at an arbitrary ticker.
const SYMBOLS = new Set(GEX_SYMBOLS);
const cleanSymbol = (value) => {
  const symbol = String(value || "SPY").trim().toUpperCase();
  return SYMBOLS.has(symbol) ? symbol : null;
};

const key = (symbol) => `${symbol.toLowerCase()}-0dte-gex-history`;
const RETENTION = 7 * 86400;
const MAX_POINTS = 3000;
// One sample per poll interval is plenty; anything faster is a bad actor or a
// runaway client, and is answered from the stored series instead of upstream.
const MIN_SAMPLE_GAP_MS = 15_000;

const lastSampledAt = (globalThis.__gexHistorySampledAt ??= new Map());

// payload is a TEXT column rather than jsonb, so it round-trips
// through JSON.stringify/parse rather than being handed to Prisma as an object.
function parsePoints(row) {
  if (!row?.payload) return [];
  try {
    const points = JSON.parse(row.payload)?.points;
    return Array.isArray(points) ? points : [];
  } catch {
    return [];
  }
}

async function readHistory(symbol) {
  return parsePoints(await prisma.clipSnapshot.findUnique({ where: { id: key(symbol) } }));
}

export async function GET(request) {
  const symbol = cleanSymbol(request.nextUrl.searchParams.get("symbol"));
  if (!symbol) return Response.json({ points: [] }, { status: 400 });
  try {
    return Response.json({ points: await readHistory(symbol) });
  } catch {
    // A database hiccup must not blank the chart's other layers.
    return Response.json({ points: [] });
  }
}

// A nudge to sample the live chain. The body carries nothing but the symbol.
export async function POST(request) {
  let symbol = "SPY";
  try {
    symbol = cleanSymbol(new URL(request.url).searchParams.get("symbol"));
    if (!symbol) return Response.json({ points: [] }, { status: 400 });

    const now = Date.now();
    if (now - (lastSampledAt.get(symbol) || 0) < MIN_SAMPLE_GAP_MS) {
      return Response.json({ points: await readHistory(symbol) });
    }
    lastSampledAt.set(symbol, now);

    const origin = new URL(request.url).origin;
    const response = await fetch(`${origin}/api/spy-gex?zeroDte=1&symbol=${symbol}`, { cache: "no-store" });
    const json = await response.json();
    if (!response.ok || !json.available || !json.indicator) {
      return Response.json({ points: await readHistory(symbol) });
    }

    const snapshot = {
      t: Math.floor(json.updatedAt / 1000),
      date: json.marketDate,
      strike: json.indicator.strike,
      netGex: json.indicator.netGex,
      secondStrike: Number.isFinite(json.secondaryIndicator?.strike) ? json.secondaryIndicator.strike : null,
      secondNetGex: Number.isFinite(json.secondaryIndicator?.netGex) ? json.secondaryIndicator.netGex : null,
      callWall: Number.isFinite(json.summary?.callWall) ? json.summary.callWall : null,
      putWall: Number.isFinite(json.summary?.putWall) ? json.summary.putWall : null,
    };
    if (!Number.isFinite(snapshot.t) || !Number.isFinite(snapshot.strike)) {
      return Response.json({ points: await readHistory(symbol) });
    }

    // Concurrent pollers each read-modify-write the same row. Aurora DSQL does
    // have real transactions, but it resolves write conflicts optimistically -
    // a loser gets a serialization error at commit and has to retry anyway - so
    // the compare-and-swap below is kept: the update is conditioned on
    // updatedAt still being what we read, which needs no retry-on-error
    // handling of its own. If another poller
    // committed first, updateMany matches 0 rows and we retry against its
    // result rather than silently dropping its snapshot.
    for (let attempt = 0; attempt < 3; attempt++) {
      const row = await prisma.clipSnapshot.findUnique({ where: { id: key(symbol) } });
      const current = parsePoints(row);
      if (current.some((item) => item.t === snapshot.t)) {
        return Response.json({ points: current });
      }
      const cutoff = snapshot.t - RETENTION;
      const next = [...current.filter((item) => item.t >= cutoff), snapshot]
        .sort((a, b) => a.t - b.t)
        .slice(-MAX_POINTS);
      const payload = JSON.stringify({ points: next });

      if (!row) {
        // No row yet. create() violates the unique id if another poller won the
        // race, which sends us round the loop to the update path.
        try {
          await prisma.clipSnapshot.create({ data: { id: key(symbol), payload } });
          return Response.json({ points: next });
        } catch {
          continue;
        }
      }
      const { count } = await prisma.clipSnapshot.updateMany({
        where: { id: key(symbol), updatedAt: row.updatedAt },
        data: { payload },
      });
      if (count === 1) return Response.json({ points: next });
    }
    return Response.json({ points: await readHistory(symbol) });
  } catch {
    try {
      return Response.json({ points: await readHistory(symbol) });
    } catch {
      return Response.json({ points: [] });
    }
  }
}
