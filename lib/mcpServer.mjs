// Luna's market-data tools as an MCP server (Model Context Protocol), so any
// MCP client - Claude Desktop, Cursor, an agent framework - can call the same
// tools the in-site chat uses. Served at /api/mcp (app/api/mcp/route.js).
//
// Stateless Streamable HTTP: every POST carries one JSON-RPC message and gets
// one JSON response; no session, no server-to-client stream. That fits Lambda,
// where two requests rarely reach the same instance.
//
// Read-only and public on purpose: only the tools that need no account
// (quotes, history, sentiment, site pages). Nothing here reads or writes a
// user's watchlist, chats or documents, and no model is called - the client
// brings its own model, so a call costs a data fetch, not Bedrock tokens.
import { TOOLS, TOOL_SCHEMA } from "./financialAgentTools.mjs";

export const SERVER_INFO = { name: "luna-terminal", title: "Luna Terminal market data", version: "1.0.0" };
// Newest first. A client asking for one of these gets it back; anything else
// gets the newest, and the client decides whether it can work with that.
export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];

const INSTRUCTIONS =
  "Live market data from Luna Terminal. Prices and sentiment readings are dated: quote the date with the number. " +
  "Use find_page to link the Luna Terminal page where the user can explore a result. Data only, not investment advice.";

// no_data_needed exists to satisfy the in-site chat's forced first tool call;
// it means nothing to a client that chooses its own tools.
const PUBLIC = TOOL_SCHEMA.filter((t) => t.name !== "no_data_needed");
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

export const MCP_TOOLS = PUBLIC.map((t) => ({
  name: t.name,
  description: t.description,
  inputSchema: t.input_schema,
  annotations: { ...READ_ONLY, openWorldHint: t.name !== "find_page" },
}));

const ok = (id, result) => ({ jsonrpc: "2.0", id, result });
const fail = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

// Handles one JSON-RPC message. Returns the response object, or null for a
// notification (no id), which gets no response body.
// `origin` makes find_page's relative paths into links the client can open.
export async function handleMcpMessage(message, { origin = "", tools = TOOLS } = {}) {
  if (!message || typeof message !== "object" || Array.isArray(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return fail(message?.id, -32600, "Invalid Request: expected one JSON-RPC 2.0 message.");
  }
  const { id, method, params = {} } = message;
  if (id === undefined) return null; // notifications/initialized, notifications/cancelled...

  switch (method) {
    case "initialize": {
      const asked = params?.protocolVersion;
      return ok(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: MCP_TOOLS });
    case "tools/call": {
      const name = params?.name;
      if (!MCP_TOOLS.some((t) => t.name === name) || typeof tools[name] !== "function") {
        return fail(id, -32602, `Unknown tool: ${String(name).slice(0, 64)}`);
      }
      const args = params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments) ? params.arguments : {};
      let result;
      try {
        result = await tools[name](args);
      } catch {
        result = { error: "This data source is currently unavailable." };
      }
      if (name === "find_page" && origin && Array.isArray(result?.pages)) {
        result = { ...result, pages: result.pages.map((p) => (typeof p?.path === "string" && p.path.startsWith("/") ? { ...p, url: origin + p.path } : p)) };
      }
      // A tool's own "no data" answer is a tool error the model should see and
      // work around, not a protocol error.
      return ok(id, {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
        isError: Boolean(result?.error),
      });
    }
    default:
      return fail(id, -32601, `Method not found: ${method.slice(0, 64)}`);
  }
}
