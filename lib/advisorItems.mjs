export const ITEM_PATHS = { models: "/model-portfolios", reports: "/reports", clients: "/client-portfolios" };
export class WorkspaceInputError extends Error {}
const fail = message => { throw new WorkspaceInputError(message); };
const text = (value, label, max, fallback = "") => {
  if (value == null) return fallback;
  if (typeof value !== "string" || value.length > max) fail(`${label} must be text under ${max + 1} characters.`);
  return value.trim();
};

export function validateItem(input, kind) {
  if (!Object.hasOwn(ITEM_PATHS, kind)) fail("Choose models, reports or clients.");
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("A workspace record is required.");
  const name = text(input.name, "Name", 160);
  if (!name) fail("Enter a name.");
  const holdings = input.holdings ?? [];
  if (!Array.isArray(holdings) || holdings.length > 200) fail("A portfolio can have up to 200 holdings.");
  const seen = new Set();
  const clean = holdings.map(h => {
    const symbol = text(h?.symbol, "Ticker", 24).toUpperCase();
    if (!/^[A-Z0-9^][A-Z0-9.^=-]{0,23}$/.test(symbol) || seen.has(symbol)) fail("Holdings need valid, unique tickers.");
    seen.add(symbol);
    const result = { symbol };
    for (const field of ["shares", "weight"]) {
      if (h[field] == null) continue;
      if (typeof h[field] !== "number" || !Number.isFinite(h[field]) || h[field] < 0 || h[field] > (field === "weight" ? 100 : 1e12)) fail(`Invalid ${field} for ${symbol}.`);
      result[field] = h[field];
    }
    if (result.shares != null && result.weight != null) fail("Use shares or weights, not both.");
    return result;
  });
  return {
    name, holdings: clean,
    blurb: text(input.blurb, "Description", 2000),
    content: text(input.content, "Document content", 32000),
    client: text(input.client, "Client", 160),
    preparedBy: text(input.preparedBy, "Prepared by", 160),
    opened: typeof input.opened === "string" && Number.isFinite(Date.parse(input.opened)) ? new Date(input.opened).toISOString() : new Date().toISOString(),
    ...(input.table ? { table: validateTable(input.table) } : {}),
  };
}

export function validateTable(table) {
  if (!table || !Array.isArray(table.columns) || !table.columns.length || table.columns.length > 16 || !Array.isArray(table.rows) || table.rows.length > 500) fail("A table needs 1-16 columns and at most 500 rows.");
  const columns = table.columns.map(c => text(c, "Column", 120));
  const rows = table.rows.map(row => {
    if (!Array.isArray(row) || row.length !== columns.length) fail("Each row must match the table columns.");
    return row.map(cell => {
      if (typeof cell === "number" && Number.isFinite(cell)) return cell;
      return text(cell, "Cell", 2000);
    });
  });
  if (JSON.stringify({ columns, rows }).length > 64000) fail("The table is too large.");
  return { columns, rows };
}

export const decodeItem = row => ({ ...JSON.parse(row.data), id: row.id, revision: row.revision, kind: row.kind });

export function advisorItemHandlers({ auth, prisma, rateLimit = async () => true }) {
  const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  const handle = method => async request => {
    try {
      const userId = (await auth())?.user?.id;
      if (!userId) return json({ error: "Sign in to access your advisor workspace." }, 401);
      if (!await rateLimit(userId)) return json({ error: "Too many requests. Try again shortly." }, 429);
      const kind = new URL(request.url).searchParams.get("kind");
      if (!Object.hasOwn(ITEM_PATHS, kind)) return json({ error: "Invalid workspace." }, 400);
      const db = prisma.advisorItem;
      if (method === "GET") return json({ items: (await db.findMany({ where: { userId, kind }, orderBy: { createdAt: "desc" } })).map(decodeItem) });
      const raw = await request.text();
      if (raw.length > 120000) return json({ error: "Record is too large." }, 413);
      let body;
      try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON." }, 400); }
      if (method !== "POST" && (typeof body?.id !== "string" || body.id.length > 100 || !Number.isInteger(body.revision) || body.revision < 1)) return json({ error: "Invalid record identifier or revision." }, 400);
      const where = { id: body?.id, userId, kind, revision: body?.revision };
      if (method === "DELETE") {
        const result = await db.deleteMany({ where });
        return result.count ? json({ deleted: body.id }) : json({ error: "This record changed. Refresh and try again." }, 409);
      }
      const item = validateItem(body, kind);
      if (method === "POST") {
        let id;
        if (body.draftId) {
          if (typeof body.draftId !== "string" || !/^[a-f0-9-]{36}$/i.test(body.draftId)) return json({ error: "Invalid draft identifier." }, 400);
          // A draft has a stable ID per account/destination. Retrying a save,
          // including from a second device, never inserts a duplicate.
          const { createHash } = await import("node:crypto");
          id = createHash("sha256").update(JSON.stringify([userId, kind, body.draftId])).digest("hex");
          const existing = await db.findFirst({ where: { id, userId, kind } });
          if (existing) return json({ item: decodeItem(existing) });
        }
        try { return json({ item: decodeItem(await db.create({ data: { ...(id ? { id } : {}), userId, kind, data: JSON.stringify(item) } })) }, 201); }
        catch (error) {
          if (id && error.code === "P2002") {
            const existing = await db.findFirst({ where: { id, userId, kind } });
            if (existing) return json({ item: decodeItem(existing) });
          }
          throw error;
        }
      }
      const result = await db.updateMany({ where, data: { data: JSON.stringify(item), revision: { increment: 1 } } });
      return result.count ? json({ item: { ...item, id: body.id, kind, revision: body.revision + 1 } }) : json({ error: "This record changed. Refresh and try again." }, 409);
    } catch (error) {
      return json({ error: error instanceof WorkspaceInputError ? error.message : "Account workspace storage is unavailable. Please try again." }, error instanceof WorkspaceInputError ? 400 : 503);
    }
  };
  return { GET: handle("GET"), POST: handle("POST"), PUT: handle("PUT"), DELETE: handle("DELETE") };
}
