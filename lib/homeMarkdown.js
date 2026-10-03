export const estimateTokens = (text) => Math.ceil(text.length / 4);

export function homeMarkdown() {
  return [
    "# Luna Terminal",
    "",
    "A free financial research terminal for traders and financial advisors.",
    "",
    "## Market research",
    "",
    "- Live dashboards for US equities, sectors, global markets, yields, currencies, and commodities",
    "- Company profiles, price charts, valuation history, earnings, technicals, and supply-chain research",
    "- Stock screeners, market maps, metric comparison, and regression analysis",
    "- SEC 13F institutional holdings and hedge fund portfolio research",
    "",
    "## Advisor tools",
    "",
    "- Client and model portfolio workspaces",
    "- Portfolio performance and allocation comparison",
    "- Watchlists, alerts, and reports",
    "",
    "## For AI agents",
    "",
    "- MCP server at /api/mcp (Streamable HTTP, no sign-in): live quotes, price history, market sentiment, and a search over this site's pages",
    "",
    "## Access",
    "",
    "Core market research is free. Luna Terminal is read-only research software and does not execute trades or provide individualized investment advice.",
    "",
    "Visit https://lunaterminal.com",
    "",
  ].join("\n");
}
