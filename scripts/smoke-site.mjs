// End-to-end check of a deployed site: `npm run smoke:site https://xxxx.cloudfront.net`
//
// 1. Key pages, public APIs and the MCP endpoint answer (and say how long they took).
// 2. Each AWS chat model answers one real question through /api/ai-chat:
//    it must fetch live data, stream an answer, and send no error event.
// Prints a table and exits non-zero if anything failed. Costs one short chat
// per model. Add --models=aws-gpt,aws-claude to limit which models run.
import { HOSTED_MODELS, hostedModel } from "../lib/hostedModels.mjs";

const base = process.argv.find((a) => /^https?:\/\//.test(a));
if (!base) {
  console.error("Usage: npm run smoke:site https://your-site [--models=aws-gpt,aws-claude]");
  process.exit(2);
}
const pick = process.argv.find((a) => a.startsWith("--models="))?.slice(9).split(",");

const rows = [];
const check = async (label, run) => {
  const started = Date.now();
  try {
    const detail = await run();
    rows.push({ ok: true, label, ms: Date.now() - started, detail });
  } catch (err) {
    rows.push({ ok: false, label, ms: Date.now() - started, detail: String(err.message || err).slice(0, 200) });
  }
};
const get = async (path) => {
  const res = await fetch(new URL(path, base), { redirect: "follow", signal: AbortSignal.timeout(60000) });
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  return res;
};

const PAGES = ["/", "/about", "/dashboard", "/dashboard/chat", "/stock/NVDA", "/hedge-funds", "/maps", "/supply-chain", "/screener", "/earnings-calendar"];
for (const path of PAGES) await check(`page ${path}`, async () => `${(await (await get(path)).text()).length} bytes`);

await check("api /api/fear-greed", async () => {
  const body = await (await get("/api/fear-greed")).json();
  if (!body || typeof body !== "object") throw new Error("not JSON");
  return "JSON";
});
await check("api /api/stock-search?q=nvidia", async () => {
  const text = await (await get("/api/stock-search?q=nvidia")).text();
  if (!/NVDA/i.test(text)) throw new Error("NVDA not in results");
  return "finds NVDA";
});

// The MCP endpoint (docs/MCP.md): handshake, tool list, one live tool call.
await check("mcp /api/mcp", async () => {
  const rpc = async (id, method, params) => {
    const res = await fetch(new URL("/api/mcp", base), {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      signal: AbortSignal.timeout(60000),
    });
    if (res.status !== 200) throw new Error(`${method}: HTTP ${res.status}`);
    const body = await res.json();
    if (body.error) throw new Error(`${method}: ${body.error.message}`);
    return body.result;
  };
  const init = await rpc(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "1" } });
  const { tools } = await rpc(2, "tools/list");
  const quote = await rpc(3, "tools/call", { name: "get_quote", arguments: { symbols: ["AAPL"] } });
  const price = quote.structuredContent?.quotes?.[0]?.price;
  if (quote.isError || typeof price !== "number") throw new Error(`get_quote: ${quote.content?.[0]?.text?.slice(0, 120)}`);
  return `protocol ${init.protocolVersion}, ${tools.length} tools, AAPL ${price}`;
});

const models = HOSTED_MODELS.filter(({ id }) => ["bedrock", "mantle"].includes(hostedModel(id)?.provider) && (!pick || pick.includes(id)));
for (const { id, label } of models) {
  await check(`chat ${label}`, async () => {
    const res = await fetch(new URL("/api/ai-chat", base), {
      method: "POST",
      headers: { "content-type": "application/json", origin: new URL(base).origin },
      body: JSON.stringify({ model: id, messages: [{ role: "user", content: "What is AAPL trading at? Give the date." }], conversationId: crypto.randomUUID() }),
      signal: AbortSignal.timeout(120000),
    });
    const text = await res.text();
    if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`);
    const events = text.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const error = events.find((e) => e.t === "error");
    if (error) throw new Error(error.v);
    const answer = events.filter((e) => e.t === "text").map((e) => e.v).join("");
    if (!answer.trim()) throw new Error("empty answer");
    const tools = events.filter((e) => e.t === "data").map((e) => e.v?.tool).filter(Boolean);
    if (!tools.length) throw new Error("answered without fetching data");
    const note = /was unavailable, so/.test(answer) ? " (backup model answered)" : "";
    return `tools: ${[...new Set(tools)].join(",")}${note} | "${answer.replace(/\s+/g, " ").slice(0, 70)}…"`;
  });
}

const width = Math.max(...rows.map((r) => r.label.length));
for (const r of rows) console.log(`${r.ok ? "OK  " : "FAIL"}  ${r.label.padEnd(width)}  ${String(r.ms).padStart(6)} ms  ${r.detail}`);
const failed = rows.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} of ${rows.length} checks failed` : `\nall ${rows.length} checks passed`);
process.exitCode = failed ? 1 : 0;
