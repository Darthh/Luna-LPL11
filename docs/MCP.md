# Luna Terminal as an MCP server

`/api/mcp` serves Luna's market-data tools over the
[Model Context Protocol](https://modelcontextprotocol.io), so any MCP client
(Claude Desktop, Claude Code, Cursor, an agent framework) can use the same live
data the in-site chat uses.

| Tool | What it returns |
|---|---|
| `get_quote` | Live price and % change for up to 10 symbols (stocks, ETFs, indices, crypto) |
| `get_history` | Move, high, low and a thinned close series over 1mo-max |
| `get_market_sentiment` | Today's 0-100 sentiment reading, with month-ago and year-ago values |
| `find_page` | The Luna Terminal pages that answer a question, as full links |

All four are marked read-only. The server exposes **no** user data: no
watchlists, chats, documents or research history. It also calls **no model**;
the client brings its own, so a tool call costs one upstream data fetch, not
Bedrock tokens. Tool calls are limited to 300 per hour per IP, shared across
Lambda instances when the stage has `LUNA_DATA=true`.

Code: `lib/mcpServer.mjs` (protocol, tested in `lib/mcpServer.test.mjs`) and
`app/api/mcp/route.js` (HTTP). The transport is Streamable HTTP in stateless
mode: each POST carries a JSON-RPC message and gets a JSON reply, with no session.
That fits Lambda, and the tool code is the same `lib/financialAgentTools.mjs`
the AgentCore agent runs.

## Connect a client

Use the stage's URL, e.g. `https://d2wyrxhbmhmu6j.cloudfront.net/api/mcp`.

- **Claude Desktop / claude.ai:** Settings → Connectors → *Add custom
  connector* → paste the URL. No sign-in is needed.
- **Claude Code:** `claude mcp add --transport http luna https://<site>/api/mcp`
- **Cursor:** in `~/.cursor/mcp.json`:
  ```json
  { "mcpServers": { "luna": { "url": "https://<site>/api/mcp" } } }
  ```
- **MCP Inspector** (to browse the tools by hand):
  `npx @modelcontextprotocol/inspector`. Choose *Streamable HTTP* and paste the URL.
- **Raw check:**
  ```bash
  curl -s https://<site>/api/mcp -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_quote","arguments":{"symbols":["NVDA"]}}}'
  ```

`npm run smoke:site <url>` includes an MCP check: handshake, tool list and a
live `get_quote`.

## Next: AgentCore Gateway

Bedrock AgentCore Gateway can front these same tools as a managed MCP endpoint
with OAuth (Cognito) sign-in and per-client quotas. That's the route to exposing
the per-user tools (`search_documents`, `search_research_history`) safely, since
each call would then carry a user identity. Not built: it needs IAM and Cognito
resources that the workshop account may not allow.
