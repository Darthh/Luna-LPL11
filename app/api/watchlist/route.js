import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  MAX_WATCHLIST_ITEMS,
  isValidSymbol,
  normalizeName,
  normalizeShares,
  normalizeSymbol,
  parseSymbolList,
} from "@/lib/watchlist";

const UNAUTHORIZED = { error: "Sign in required" };

// The user's own order first, then oldest-first for rows saved before the
// position column existed (they all share position 0).
const ORDER = [{ position: "asc" }, { createdAt: "asc" }];

function listFor(userId) {
  return prisma.watchlistItem.findMany({
    where: { userId },
    orderBy: ORDER,
    select: { symbol: true, name: true, shares: true },
  });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json(UNAUTHORIZED, { status: 401 });

  return Response.json({ items: await listFor(session.user.id) });
}

// Accepts a single `{ symbol, name }` (adding one ticker) or an `items` array
// (merging a watchlist that was saved in the browser before this feature
// required an account). Adding a symbol that's already there is a no-op rather
// than an error, so a double click or a re-run merge doesn't fail.
export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json(UNAUTHORIZED, { status: 401 });
  const userId = session.user.id;

  const body = await request.json().catch(() => null);
  const raw = Array.isArray(body?.items) ? body.items : [body];
  const incoming = [];
  const seen = new Set();
  for (const entry of raw) {
    const symbol = normalizeSymbol(entry?.symbol);
    if (!isValidSymbol(symbol) || seen.has(symbol)) continue;
    seen.add(symbol);
    incoming.push({
      symbol,
      name: normalizeName(entry?.name),
      shares: normalizeShares(entry?.shares),
      userId,
    });
  }
  if (!incoming.length) {
    return Response.json({ error: "No valid ticker provided" }, { status: 400 });
  }

  const existing = await prisma.watchlistItem.count({ where: { userId } });
  if (existing + incoming.length > MAX_WATCHLIST_ITEMS) {
    return Response.json(
      { error: `A watchlist holds up to ${MAX_WATCHLIST_ITEMS} tickers.` },
      { status: 400 }
    );
  }

  // New rows land at the bottom of whatever order the user has arranged.
  const last = await prisma.watchlistItem.findFirst({
    where: { userId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const base = (last?.position ?? -1) + 1;

  // Kept as an upsert rather than createMany + skipDuplicates: a
  // @@unique([userId, symbol]) collision is handled per row instead, so an
  // existing ticker keeps its current position and name rather than being
  // duplicated or reset.
  // ponytail: one upsert per ticker, fine for the <=MAX_WATCHLIST_ITEMS rows
  // a single request can carry.
  for (const [i, item] of incoming.entries()) {
    await prisma.watchlistItem.upsert({
      where: { userId_symbol: { userId, symbol: item.symbol } },
      create: { ...item, position: base + i },
      update: {},
    });
  }

  return Response.json({ items: await listFor(userId) }, { status: 201 });
}

// Rewrites the order after a drag. `symbols` is the full list in its new
// order; anything missing from it keeps its old position, so a stale tab can't
// silently drop a ticker.
export async function PATCH(request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json(UNAUTHORIZED, { status: 401 });
  const userId = session.user.id;

  const body = await request.json().catch(() => null);
  const symbols = parseSymbolList(
    Array.isArray(body?.symbols) ? body.symbols.join(",") : body?.symbols
  );
  if (!symbols.length) {
    return Response.json({ error: "No order provided" }, { status: 400 });
  }

  // Not wrapped in a transaction, so this reorder is not atomic: a failure partway
  // leaves some rows renumbered. Harmless here - the next successful reorder
  // rewrites every position anyway, and a half-applied order only affects how
  // this one user's list is sorted.
  // ponytail: sequential updates, batch into one raw UPDATE...CASE if a long
  // watchlist ever makes the round-trips slow.
  for (const [i, symbol] of symbols.entries()) {
    await prisma.watchlistItem.updateMany({ where: { userId, symbol }, data: { position: i } });
  }

  return Response.json({ items: await listFor(userId) });
}

// How many shares of one ticker the user holds. Separate from POST because
// setting shares on a row that already exists isn't adding a ticker, and from
// PATCH because that rewrites the order of the whole list.
export async function PUT(request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json(UNAUTHORIZED, { status: 401 });
  const userId = session.user.id;

  const body = await request.json().catch(() => null);
  const symbol = normalizeSymbol(body?.symbol);
  if (!isValidSymbol(symbol)) {
    return Response.json({ error: "Missing ticker" }, { status: 400 });
  }

  await prisma.watchlistItem.updateMany({
    where: { userId, symbol },
    data: { shares: normalizeShares(body?.shares) },
  });

  return Response.json({ items: await listFor(userId) });
}

export async function DELETE(request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json(UNAUTHORIZED, { status: 401 });

  const symbol = normalizeSymbol(request.nextUrl.searchParams.get("symbol"));
  if (!isValidSymbol(symbol)) {
    return Response.json({ error: "Missing ticker" }, { status: 400 });
  }

  await prisma.watchlistItem.deleteMany({ where: { userId: session.user.id, symbol } });

  return Response.json({ items: await listFor(session.user.id) });
}
