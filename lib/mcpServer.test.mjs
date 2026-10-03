import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

// The data tools import "@/lib/..." (the Next.js alias); map it for plain Node.
const root = pathToFileURL(process.cwd() + "/").href;
registerHooks({
  resolve: (specifier, context, next) =>
    next(specifier.startsWith("@/") ? new URL(specifier.slice(2) + (/\.[cm]?js$/.test(specifier) ? "" : ".js"), root).href : specifier, context),
});
const { handleMcpMessage, MCP_TOOLS, PROTOCOL_VERSIONS } = await import("./mcpServer.mjs");

const rpc = (method, params, id = 1) => ({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) });

test("initialize negotiates the protocol version and advertises tools", async () => {
  const known = await handleMcpMessage(rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } }));
  assert.equal(known.result.protocolVersion, "2025-06-18");
  assert.ok(known.result.capabilities.tools);
  assert.equal(known.result.serverInfo.name, "luna-terminal");
  const unknown = await handleMcpMessage(rpc("initialize", { protocolVersion: "1999-01-01" }));
  assert.equal(unknown.result.protocolVersion, PROTOCOL_VERSIONS[0]);
});

test("notifications get no response, ping gets an empty result", async () => {
  assert.equal(await handleMcpMessage({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
  assert.deepEqual((await handleMcpMessage(rpc("ping"))).result, {});
});

test("tools/list exposes only the public, read-only data tools", async () => {
  const { tools } = (await handleMcpMessage(rpc("tools/list"))).result;
  assert.deepEqual(tools.map((t) => t.name).sort(), ["find_page", "get_history", "get_market_sentiment", "get_quote"]);
  for (const t of tools) {
    assert.equal(t.inputSchema.type, "object");
    assert.equal(t.annotations.readOnlyHint, true);
  }
  assert.equal(MCP_TOOLS.some((t) => /document|history_search|watchlist|chat/.test(t.name)), false);
});

test("tools/call returns text and structured content; tool errors are isError results", async () => {
  const tools = {
    get_quote: async ({ symbols }) => ({ quotes: symbols.map((symbol) => ({ symbol, price: 1 })) }),
    get_history: async () => ({ error: "No history for ZZZZ." }),
    get_market_sentiment: async () => { throw new Error("upstream down"); },
  };
  const quote = (await handleMcpMessage(rpc("tools/call", { name: "get_quote", arguments: { symbols: ["AAPL"] } }), { tools })).result;
  assert.equal(quote.isError, false);
  assert.deepEqual(JSON.parse(quote.content[0].text), quote.structuredContent);
  assert.equal(quote.structuredContent.quotes[0].symbol, "AAPL");

  assert.equal((await handleMcpMessage(rpc("tools/call", { name: "get_history", arguments: { symbol: "ZZZZ" } }), { tools })).result.isError, true);
  const thrown = (await handleMcpMessage(rpc("tools/call", { name: "get_market_sentiment" }), { tools })).result;
  assert.equal(thrown.isError, true);
  assert.doesNotMatch(thrown.content[0].text, /upstream down/);
});

test("find_page links are made absolute for the client", async () => {
  const res = (await handleMcpMessage(rpc("tools/call", { name: "find_page", arguments: { query: "hedge fund holdings 13F" } }), { origin: "https://luna.example" })).result;
  assert.ok(res.structuredContent.pages.length);
  for (const p of res.structuredContent.pages) assert.ok(p.url.startsWith("https://luna.example/"));
});

test("unknown tools, internal tools and bad messages are JSON-RPC errors", async () => {
  assert.equal((await handleMcpMessage(rpc("tools/call", { name: "search_documents", arguments: {} }))).error.code, -32602);
  assert.equal((await handleMcpMessage(rpc("tools/call", { name: "no_data_needed" }))).error.code, -32602);
  assert.equal((await handleMcpMessage(rpc("resources/list"))).error.code, -32601);
  assert.equal((await handleMcpMessage({ id: 1, method: "ping" })).error.code, -32600);
  assert.equal((await handleMcpMessage(null)).error.code, -32600);
});
