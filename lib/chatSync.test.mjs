// `node --test lib/chatSync.test.mjs` - the browser's chat history syncing with
// /api/chats. The "server" is a fake fetch over the real repository and
// validation, so the client is checked against the API's actual rules.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createMemoryChatRepository, ChatGapError } from "./chatRepository.mjs";
import { parseAppend, parseImport } from "./chats.mjs";
import { readChats, saveChat, deleteChat, syncChats, resetChatSyncForTests } from "./chatHistory.js";

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function fakeServer(repo, userId = "u1") {
  const calls = [];
  const handler = async (path, init = {}) => {
    const method = init.method || "GET";
    calls.push(`${method} ${path}`);
    if (!userId) return json({ error: "Sign in required" }, 401);
    const url = new URL(path, "http://x");
    const body = init.body ? JSON.parse(init.body) : null;
    let m;
    if (url.pathname === "/api/chats" && method === "GET") return json(await repo.list(userId, { limit: url.searchParams.get("limit") }));
    if (url.pathname === "/api/chats/import") {
      const { chats } = parseImport(body);
      for (const c of chats) await repo.append(userId, c.id, { from: 0, title: c.title, messages: c.messages });
      return json({ ok: true });
    }
    if ((m = url.pathname.match(/^\/api\/chats\/([^/]+)\/messages$/))) {
      try {
        return json(await repo.append(userId, decodeURIComponent(m[1]), parseAppend(body)));
      } catch (e) {
        return json({ error: e.message }, e instanceof ChatGapError ? 409 : 400);
      }
    }
    if ((m = url.pathname.match(/^\/api\/chats\/([^/]+)$/))) {
      const id = decodeURIComponent(m[1]);
      if (method === "DELETE") return new Response(null, { status: (await repo.remove(userId, id)) ? 204 : 404 });
      const chat = await repo.get(userId, id);
      return chat ? json(chat) : json({ error: "Not found" }, 404);
    }
    return json({ error: "no route" }, 404);
  };
  return { handler, calls };
}

let store;
const settle = () => new Promise((r) => setTimeout(r, 10));

beforeEach(() => {
  store = "[]";
  globalThis.localStorage = { getItem: () => store, setItem: (_k, v) => { store = v; } };
  globalThis.window = { dispatchEvent: () => {} };
  resetChatSyncForTests();
});

const convo = [
  { role: "user", content: "How is NVDA doing?" },
  { role: "assistant", content: "Up 2% today.", stockCards: [{ symbol: "NVDA" }], error: undefined },
];

test("a save on one device appears on another after sync", async () => {
  const repo = createMemoryChatRepository();
  const server = fakeServer(repo);
  globalThis.fetch = server.handler;

  saveChat({ id: "1700000000001", title: "NVDA", messages: convo });
  await settle();
  assert.equal((await repo.get("u1", "1700000000001")).messages.length, 2, "pushed in the background");

  store = "[]"; // a second browser: nothing local
  resetChatSyncForTests();
  assert.equal(await syncChats(), true);
  const [chat] = readChats();
  assert.equal(chat.id, "1700000000001");
  assert.deepEqual(chat.messages[1].stockCards, [{ symbol: "NVDA" }]);
});

test("chats saved before sign-in are uploaded once by sync", async () => {
  const repo = createMemoryChatRepository();
  const offline = fakeServer(repo, null); // signed out
  globalThis.fetch = offline.handler;
  saveChat({ id: "1700000000002", title: "Bonds", messages: [{ role: "user", content: "What are bonds?" }] });
  await settle();
  assert.equal(await syncChats(), false, "401 switches sync off");
  const before = offline.calls.length;
  saveChat({ id: "1700000000003", title: "More", messages: [{ role: "user", content: "and yields?" }] });
  await settle();
  assert.equal(offline.calls.length, before, "no requests after a 401");

  resetChatSyncForTests(); // signs in: next page load
  const online = fakeServer(repo);
  globalThis.fetch = online.handler;
  await syncChats();
  assert.deepEqual((await repo.list("u1")).chats.map((c) => c.id).sort(), ["1700000000002", "1700000000003"]);
  const calls = online.calls.length;
  await syncChats();
  assert.ok(!online.calls.slice(calls).some((c) => c.includes("import")), "nothing left to upload");
});

test("delete removes the server copy so sync doesn't resurrect it", async () => {
  const repo = createMemoryChatRepository();
  globalThis.fetch = fakeServer(repo).handler;
  saveChat({ id: "1700000000004", title: "Gone", messages: [{ role: "user", content: "bye" }] });
  await settle();
  assert.equal(deleteChat("1700000000004"), true);
  await settle();
  await syncChats();
  assert.equal(readChats().length, 0);
  assert.equal(await repo.get("u1", "1700000000004"), null);
});
