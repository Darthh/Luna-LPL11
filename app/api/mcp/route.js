import { handleMcpMessage } from "@/lib/mcpServer.mjs";
import { checkRateLimit } from "@/lib/rateLimit";

// MCP endpoint (Streamable HTTP, stateless JSON responses). See lib/mcpServer.mjs.
// Connect a client to https://<site>/api/mcp - setup in docs/MCP.md.

// Tool calls fetch live upstream data, so they are capped per IP like the
// other public feeds; initialize and tools/list cost nothing and are not.
const TOOL_CALLS_PER_HOUR = 300;

// Public, read-only and cookie-free, so any origin may call it; that is what
// lets browser-based clients such as the MCP Inspector connect.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Authorization",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};
const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { ...CORS, ...headers } });

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }
  const messages = Array.isArray(body) ? body : [body];
  if (!messages.length || messages.length > 20) {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } }, 400);
  }

  const calls = messages.filter((m) => m?.method === "tools/call" && m.id !== undefined).length;
  if (calls) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    let rate;
    for (let i = 0; i < calls; i++) rate = await checkRateLimit(`mcp:ip:${ip}`, TOOL_CALLS_PER_HOUR);
    if (!rate.ok) {
      return json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Hourly tool-call limit reached. Try again later." } }, 429, {
        "Retry-After": String(rate.retryAfterSeconds),
      });
    }
  }

  const origin = new URL(request.url).origin;
  const responses = (await Promise.all(messages.map((m) => handleMcpMessage(m, { origin })))).filter(Boolean);
  // Only notifications: accepted, nothing to say.
  if (!responses.length) return new Response(null, { status: 202, headers: CORS });
  return json(Array.isArray(body) ? responses : responses[0]);
}

// No server-to-client stream in stateless mode; the spec's answer is 405.
export function GET() {
  return new Response("This MCP server accepts POST only.", { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
