import { test } from "node:test";
import assert from "node:assert/strict";
import { ollamaModels, ollamaChat, canUseOllama } from "../lib/ollamaClient.mjs";

test("browser support is restricted to local pages or the desktop bridge", () => {
  for (const hostname of ["localhost", "127.0.0.1", "[::1]"]) {
    globalThis.window = { location: { hostname } };
    assert.equal(canUseOllama(), true);
  }
  globalThis.window = { location: { hostname: "example.com" } };
  assert.equal(canUseOllama(), false);
  delete globalThis.window;
});

test("discovers installed chat models and excludes known embedding models", async t => {
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "http://127.0.0.1:11434/api/tags");
    assert.equal(options.redirect, "error");
    return Response.json({ models: [
      { name: "chat", capabilities: ["completion"] }, { name: "legacy" },
      { name: "embedding", capabilities: ["embedding"] }, { name: "chat" },
    ] });
  });
  assert.deepEqual(await ollamaModels(), ["chat", "legacy"]);
});

test("streams split UTF-8 and a final line without newline with bounded clean history", async t => {
  const bytes = new TextEncoder().encode('{"message":{"content":"Hello 🌙"}}\n{"message":{"content":"!"},"done":true}');
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "http://127.0.0.1:11434/api/chat");
    const body = JSON.parse(options.body);
    assert.equal(body.model, "test");
    assert.equal(body.stream, true);
    assert.equal(body.messages.length, 40);
    assert.match(body.messages[0].content, /no live market/);
    assert.equal(body.messages.some(m => m.content === "failed"), false);
    return new Response(new ReadableStream({ start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    } }));
  });
  const updates = [];
  const result = await ollamaChat({ model: "test", messages: [
    ...Array(45).fill({ role: "user", content: "hello" }),
    { role: "assistant", content: "failed", error: true },
  ] }, text => updates.push(text));
  assert.equal(result, "Hello 🌙!");
  assert.deepEqual(updates, ["Hello 🌙", "Hello 🌙!"]);
});

test("reports unreachable, empty, HTTP, and mid-stream failures", async t => {
  const mock = t.mock.method(globalThis, "fetch", async () => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(ollamaModels(), /Start Ollama/);
  mock.mock.mockImplementation(async () => Response.json({ error: "model missing" }, { status: 404 }));
  await assert.rejects(ollamaChat({ model: "missing", messages: [] }), /model missing/);
  mock.mock.mockImplementation(async () => new Response('{"error":"out of memory"}\n'));
  await assert.rejects(ollamaChat({ model: "test", messages: [] }), /out of memory/);
  mock.mock.mockImplementation(async () => new Response('{"done":true}\n'));
  await assert.rejects(ollamaChat({ model: "test", messages: [] }), /no answer/);
});

test("retains desktop IPC transport", async () => {
  globalThis.window = { lunaDesktop: {
    models: async () => ["desktop-model"], chat: async () => "Desktop reply",
  } };
  try {
    assert.equal(canUseOllama(), true);
    assert.deepEqual(await ollamaModels(), ["desktop-model"]);
    assert.equal(await ollamaChat({ model: "desktop-model", messages: [] }), "Desktop reply");
  } finally { delete globalThis.window; }
});
