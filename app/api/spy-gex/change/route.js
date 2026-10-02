import { prisma } from "@/lib/prisma";
import { GEX_SYMBOLS, netGexPercentChange } from "@/lib/gex";

export const dynamic = "force-dynamic";

const SYMBOLS = new Set(GEX_SYMBOLS);
const FIFTEEN_MINUTES_MS = 15 * 60_000;
const RETENTION_MS = 2 * 60 * 60_000;
const MAX_SNAPSHOTS = 125;
const localSnapshots = (globalThis.__gexChangeSnapshots ??= new Map());

const key = (symbol, expiration) => `gex-change-${symbol.toLowerCase()}-${expiration}`;

function parseSnapshots(row) {
  try {
    const snapshots = JSON.parse(row?.payload || "{}")?.snapshots;
    return Array.isArray(snapshots) ? snapshots : [];
  } catch {
    return [];
  }
}

function percentChanges(currentRows, baseline) {
  const prior = new Map(baseline?.rows || []);
  return Object.fromEntries(currentRows.flatMap((row) => {
    const previous = Number(prior.get(row.strike));
    if (!Number.isFinite(previous)) return [];
    const change = netGexPercentChange(row.netGex, previous);
    return change == null ? [] : [[row.strike, change]];
  }));
}

export async function POST(request) {
  const symbol = request.nextUrl.searchParams.get("symbol")?.trim().toUpperCase() || "SPY";
  if (!SYMBOLS.has(symbol)) return Response.json({ error: "Unsupported symbol" }, { status: 400 });
  const requestedExpiration = Number(request.nextUrl.searchParams.get("expiration"));

  try {
    // The client supplies only a requested expiration. All values persisted and
    // returned come from the trusted server-side chain calculation.
    const params = new URLSearchParams({ symbol });
    if (requestedExpiration) params.set("expiration", String(requestedExpiration));
    const response = await fetch(`${new URL(request.url).origin}/api/spy-gex?${params}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.available) throw new Error(data.error || "Options data unavailable");
    const now = data.updatedAt;
    const snapshot = {
      t: Math.floor(now / 60_000) * 60_000,
      rows: data.rows.map((row) => [row.strike, row.netGex]),
    };
    const snapshotKey = key(symbol, data.selectedExpiration);

    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const record = await prisma.clipSnapshot.findUnique({ where: { id: snapshotKey } });
        const current = parseSnapshots(record);
        const baseline = [...current].reverse().find((item) => item.t <= now - FIFTEEN_MINUTES_MS);
        const changes = percentChanges(data.rows, baseline);
        if (current.some((item) => item.t === snapshot.t)) {
          return Response.json({ ...data, rows: data.rows.map((row) => ({ ...row, change15mPct: changes[row.strike] ?? null })), baselineAt: baseline?.t ?? null });
        }

        const snapshots = [...current.filter((item) => item.t >= now - RETENTION_MS), snapshot]
          .sort((a, b) => a.t - b.t)
          .slice(-MAX_SNAPSHOTS);
        const payload = JSON.stringify({ snapshots });
        try {
          if (!record) await prisma.clipSnapshot.create({ data: { id: snapshotKey, payload } });
          else {
            const result = await prisma.clipSnapshot.updateMany({
              where: { id: snapshotKey, updatedAt: record.updatedAt },
              data: { payload },
            });
            if (result.count !== 1) continue;
          }
          return Response.json({ ...data, rows: data.rows.map((row) => ({ ...row, change15mPct: changes[row.strike] ?? null })), baselineAt: baseline?.t ?? null });
        } catch {
          continue;
        }
      }
    } catch {
      // Local development can run without Aurora. Keep a process-local baseline
      // so the 15-minute column still works after enough samples accumulate.
      const current = localSnapshots.get(snapshotKey) || [];
      const baseline = [...current].reverse().find((item) => item.t <= now - FIFTEEN_MINUTES_MS);
      const changes = percentChanges(data.rows, baseline);
      if (!current.some((item) => item.t === snapshot.t)) {
        localSnapshots.set(snapshotKey, [...current.filter((item) => item.t >= now - RETENTION_MS), snapshot].slice(-MAX_SNAPSHOTS));
      }
      return Response.json({ ...data, rows: data.rows.map((row) => ({ ...row, change15mPct: changes[row.strike] ?? null })), baselineAt: baseline?.t ?? null });
    }
    return Response.json(data);
  } catch (error) {
    console.error(`${symbol} GEX change fetch failed`, error);
    return Response.json({ error: `${symbol} options data is temporarily unavailable.` }, { status: 502 });
  }
}
