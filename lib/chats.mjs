// Validation and shaping for saved AI chats - the part of chat history that
// doesn't care where chats are stored. Every value here arrives from a browser,
// so nothing is trusted: ids are pattern-checked, text is capped, and only the
// fields the workspace actually renders are kept.
//
// A message's position in the conversation is its identity. Chats are
// append-only, so the client can resend the whole history on every save and
// the store writes only the indexes it doesn't have yet - which also makes a
// retried request harmless. See docs/BACKEND_PLAN.md section 4.

export const MAX_CHATS_PER_IMPORT = 30; // what lib/chatHistory.js keeps locally
export const MAX_MESSAGES_PER_CHAT = 500;
export const MAX_MESSAGE_CHARS = 32_000;
export const MAX_TITLE_CHARS = 120;
export const MAX_SOURCES = 10;
export const MAX_EXTRA_JSON_CHARS = 16_000; // sources or one stock card, serialised
export const MAX_STOCK_CARDS = 8;
export const MAX_STOCK_CARDS_JSON_CHARS = 64_000; // cards carry chart points
export const SEARCH_TEXT_CHARS = 4_000;

// Today's local ids are timestamps or UUIDs; ULIDs fit too. No separators that
// could collide with the store's key prefixes.
const CHAT_ID = /^[A-Za-z0-9_-]{6,64}$/;
const ROLES = new Set(["user", "assistant"]);

export class ChatInputError extends Error {}

export function isChatId(id) {
  return typeof id === "string" && CHAT_ID.test(id);
}

export function cleanTitle(title, fallback = "Chat") {
  const text = typeof title === "string" ? title.replace(/\s+/g, " ").trim() : "";
  return (text || fallback).slice(0, MAX_TITLE_CHARS);
}

// Round-trips through JSON so only plain data survives (no prototypes,
// functions or undefined), then refuses anything that grew too large.
function plainJson(value, label, limit = MAX_EXTRA_JSON_CHARS) {
  if (value == null) return undefined;
  let text;
  try {
    text = JSON.stringify(value);
  } catch {
    throw new ChatInputError(`${label} is not serialisable`);
  }
  if (text === undefined) return undefined;
  if (text.length > limit) throw new ChatInputError(`${label} is too large`);
  return JSON.parse(text);
}

function cleanSources(sources) {
  if (sources == null) return undefined;
  if (!Array.isArray(sources)) throw new ChatInputError("sources must be an array");
  const kept = sources.slice(0, MAX_SOURCES).filter((s) => s && typeof s === "object");
  return kept.length ? plainJson(kept, "sources") : undefined;
}

export function cleanMessage(message, index) {
  if (!message || typeof message !== "object") throw new ChatInputError(`message ${index} is not an object`);
  if (!ROLES.has(message.role)) throw new ChatInputError(`message ${index} has an unknown role`);
  if (typeof message.content !== "string") throw new ChatInputError(`message ${index} has no text`);
  if (message.content.length > MAX_MESSAGE_CHARS) throw new ChatInputError(`message ${index} is too long`);

  const clean = { role: message.role, content: message.content };
  const sources = cleanSources(message.sources);
  if (sources) clean.sources = sources;
  // `stockCards` is what the workspace writes now; `stockCard` (one card) is
  // what older browser-saved chats carry, so imports keep it.
  if (Array.isArray(message.stockCards) && message.stockCards.length) {
    const cards = message.stockCards.slice(0, MAX_STOCK_CARDS).filter((c) => c && typeof c === "object");
    if (cards.length) clean.stockCards = plainJson(cards, `message ${index} stock cards`, MAX_STOCK_CARDS_JSON_CHARS);
  }
  const stockCard = plainJson(message.stockCard, `message ${index} stock card`);
  if (stockCard) clean.stockCard = stockCard;
  if (typeof message.model === "string" && message.model) clean.model = message.model.slice(0, 80);
  return clean;
}

// The body of POST /api/chats/:id/messages: `{ title?, from?, messages }`.
// `from` is the index of messages[0]; omitted means the full history.
export function parseAppend(body) {
  if (!body || typeof body !== "object") throw new ChatInputError("Expected a JSON body");
  const from = body.from ?? 0;
  if (!Number.isInteger(from) || from < 0) throw new ChatInputError("from must be a non-negative integer");
  if (!Array.isArray(body.messages) || !body.messages.length) throw new ChatInputError("messages must be a non-empty array");
  if (from + body.messages.length > MAX_MESSAGES_PER_CHAT) throw new ChatInputError("chat is too long to save");
  return {
    from,
    title: body.title === undefined ? undefined : cleanTitle(body.title),
    messages: body.messages.map((m, i) => cleanMessage(m, from + i)),
  };
}

// The body of POST /api/chats/import: the array lib/chatHistory.js stores.
// One bad chat is skipped rather than failing the import, since these were
// written by older versions of the client.
export function parseImport(body) {
  const chats = Array.isArray(body?.chats) ? body.chats.slice(0, MAX_CHATS_PER_IMPORT) : null;
  if (!chats) throw new ChatInputError("chats must be an array");
  const valid = [];
  let skipped = 0;
  for (const chat of chats) {
    try {
      if (!isChatId(chat?.id)) throw new ChatInputError("bad id");
      const parsed = parseAppend({ title: chat.title, messages: chat.messages });
      valid.push({ id: chat.id, ...parsed });
    } catch {
      skipped += 1;
    }
  }
  return { chats: valid, skipped: skipped + Math.max(0, (body.chats.length || 0) - chats.length) };
}

// What list search matches against: the user's own words, which is what
// people remember a conversation by. Kept on the chat's summary row so a
// search reads one partition instead of every message.
export function searchTextFor(messages) {
  return messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, SEARCH_TEXT_CHARS);
}

export function titleFor(messages) {
  return cleanTitle(messages.find((m) => m.role === "user")?.content.slice(0, 60));
}

export function matchesQuery(summary, query) {
  const terms = String(query || "").trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = `${summary.title} ${summary.searchText ?? ""}`.toLocaleLowerCase();
  return terms.every((term) => haystack.includes(term));
}

// Opaque pagination cursors: base64url JSON, validated on the way back in.
export function encodeCursor(value) {
  return value == null ? null : Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function decodeCursor(cursor) {
  if (!cursor) return undefined;
  try {
    const value = JSON.parse(Buffer.from(String(cursor), "base64url").toString("utf8"));
    return value && typeof value === "object" ? value : undefined;
  } catch {
    throw new ChatInputError("Bad cursor");
  }
}
