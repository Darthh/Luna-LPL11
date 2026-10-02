import assert from "node:assert/strict";
import { test } from "node:test";
import { deleteChat, searchChats } from "./chatHistory.js";

const chats = [
  {
    id: "mu",
    title: "Tell me about MU stock",
    messages: [
      { role: "user", content: "What is Micron's forward P/E?" },
      { role: "assistant", content: "Micron makes memory chips." },
    ],
  },
  {
    id: "oil",
    title: "Energy markets",
    messages: [{ role: "user", content: "Why did crude oil rise?" }],
  },
];

test("finds chats by title or message keywords without case sensitivity", () => {
  assert.deepEqual(searchChats(chats, "micron").map((chat) => chat.id), ["mu"]);
  assert.deepEqual(searchChats(chats, "CRUDE OIL").map((chat) => chat.id), ["oil"]);
});

test("returns every chat for an empty or whitespace-only query", () => {
  assert.deepEqual(searchChats(chats, "  "), chats);
});

test("deletes only the selected chat and announces the history change", () => {
  let stored = JSON.stringify(chats);
  let eventType = null;
  globalThis.localStorage = {
    getItem: () => stored,
    setItem: (_key, value) => { stored = value; },
  };
  globalThis.window = { dispatchEvent: (event) => { eventType = event.type; } };

  assert.equal(deleteChat("mu"), true);
  assert.deepEqual(JSON.parse(stored).map((chat) => chat.id), ["oil"]);
  assert.equal(eventType, "luna-chat-history");
});
