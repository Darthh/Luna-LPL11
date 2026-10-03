const KEY = "lunaChatHistory";
const LIMIT = 30;
export const CHAT_HISTORY_EVENT = "luna-chat-history";

// The browser copy is what the UI reads, always - it works signed out, offline
// and before anything has loaded. When the visitor is signed in and the server
// has a chat store, every save and delete is also sent to /api/chats in the
// background, and syncChats() merges the account's chats into the browser copy,
// so history follows the account across devices. A 401 (signed out) or 503
// (no store configured) switches syncing off for the rest of the page load.
let serverSync = true;
let chatAccount;
let scopeVersion = 0;
const storageKey = () => chatAccount ? `${KEY}:account:${chatAccount}` : KEY;

export function setChatAccount(userId) {
  const next = userId || null;
  if (chatAccount === next) return;
  chatAccount = next; scopeVersion += 1; serverSync = Boolean(next); syncing = null;
  window.dispatchEvent(new Event(CHAT_HISTORY_EVENT));
}

export function readChats() {
  try {
    const chats = JSON.parse(localStorage.getItem(storageKey()) || "[]");
    return Array.isArray(chats) ? chats.filter((chat) => chat && typeof chat.id === "string" && Array.isArray(chat.messages)) : [];
  } catch {
    return [];
  }
}

function writeChats(chats) {
  localStorage.setItem(storageKey(), JSON.stringify(chats.slice(0, LIMIT)));
  window.dispatchEvent(new Event(CHAT_HISTORY_EVENT));
}

export function saveChat(chat) {
  const stamped = { ...chat, updatedAt: Date.now() };
  try {
    writeChats([stamped, ...readChats().filter((entry) => entry.id !== chat.id)]);
  } catch {
    // Chat still works when browser storage is disabled or full.
  }
  pushChat(stamped);
}

export function searchChats(chats, query) {
  const terms = String(query || "").trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return chats;
  return chats.filter((chat) => {
    const searchable = [chat.title, ...(chat.messages || []).map((message) => message?.content)]
      .filter((value) => typeof value === "string")
      .join(" ")
      .toLocaleLowerCase();
    return terms.every((term) => searchable.includes(term));
  });
}

export function deleteChat(id) {
  try {
    writeChats(readChats().filter((chat) => chat.id !== id));
  } catch {
    return false;
  }
  // Without this the next sync would bring the chat straight back.
  if (serverSync) request(`/api/chats/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
  return true;
}

// ---------------------------------------------------------------- server sync

async function request(path, init) {
  const version = scopeVersion;
  const res = await fetch(path, {
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  });
  if (version === scopeVersion && (res.status === 401 || res.status === 503)) serverSync = false;
  return res;
}

const toServer = (message) => {
  // The server keeps what the workspace renders; a failed answer isn't history.
  const { role, content, sources, stockCards, stockCard, model, documents } = message || {};
  return { role, content, sources, stockCards, stockCard, model, documents };
};

function pushChat(chat) {
  if (!serverSync || typeof fetch !== "function") return;
  // The whole conversation every time: the server writes only the messages it
  // doesn't have, so this is also how a failed earlier save catches up.
  request(`/api/chats/${encodeURIComponent(chat.id)}/messages`, {
    method: "POST",
    body: JSON.stringify({ title: chat.title, messages: chat.messages.map(toServer) }),
  }).catch(() => {});
}

let syncing = null;

// Pull the account's recent chats into the browser copy and send up any the
// server hasn't seen (chats saved here before sign-in, or while offline).
// Safe to call often; concurrent calls share one run.
export function syncChats() {
  if (!serverSync || typeof fetch !== "function") return Promise.resolve(false);
  const version = scopeVersion;
  syncing ??= runSync(version).finally(() => { if (version === scopeVersion) syncing = null; });
  return syncing;
}

async function runSync(version = scopeVersion) {
  try {
    const listed = await request(`/api/chats?limit=${LIMIT}`);
    if (!listed.ok) return false;
    const { chats: remote = [] } = await listed.json();
    if (version !== scopeVersion) return false;
    const local = readChats();
    const localById = new Map(local.map((chat) => [chat.id, chat]));

    // Server has more of a chat than this browser: fetch the full chat.
    const stale = remote.filter((r) => (localById.get(r.id)?.messages.length ?? -1) < r.messageCount);
    const fetched = await Promise.all(
      stale.map(async (r) => {
        const res = await request(`/api/chats/${encodeURIComponent(r.id)}`);
        if (!res.ok) return null;
        const chat = await res.json();
        return {
          id: chat.id,
          title: chat.title,
          updatedAt: Date.parse(chat.updatedAt) || 0,
          messages: chat.messages.map((m) => Object.fromEntries(Object.entries(m).filter(([, v]) => v != null))),
        };
      })
    );

    // Browser has chats (or messages) the server lacks: send them up. Import
    // is idempotent, so a repeat only fills gaps.
    const remoteCount = new Map(remote.map((r) => [r.id, r.messageCount]));
    if (version !== scopeVersion) return false;
    const ahead = local.filter((chat) => (remoteCount.get(chat.id) ?? -1) < chat.messages.length);
    if (ahead.length) {
      await request("/api/chats/import", {
        method: "POST",
        body: JSON.stringify({ chats: ahead.map((chat) => ({ ...chat, messages: chat.messages.map(toServer) })) }),
      });
    }

    const pulled = fetched.filter(Boolean);
    if (version !== scopeVersion) return false;
    if (pulled.length) {
      const merged = new Map(local.map((chat) => [chat.id, chat]));
      for (const chat of pulled) merged.set(chat.id, chat);
      writeChats([...merged.values()].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)));
    }
    return true;
  } catch {
    return false;
  }
}

// Tests reset module state between cases.
export function resetChatSyncForTests() {
  chatAccount = undefined; scopeVersion = 0;
  serverSync = true;
  syncing = null;
}
