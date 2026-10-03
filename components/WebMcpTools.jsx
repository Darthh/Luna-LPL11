"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// WebMCP (https://webmachinelearning.github.io/webmcp/): hands a browser-based
// agent the site's actual capabilities as callable tools, so it can look up a
// reading or a quote directly instead of scraping the chart canvas for it.
//
// Every tool is backed by an endpoint that already exists and is already
// public - this exposes them, it does not open anything new. Nothing here
// touches the authenticated routes (watchlist, alerts, API keys): those act on
// a signed-in user's account, and an agent acting on them unprompted is not
// something a page script should be able to arrange.

// The spec passes execute() a second argument carrying an AbortSignal, so a
// tool call can be cancelled with the agent's request rather than running on.
async function getJson(path, options) {
  const res = await fetch(path, { signal: options?.signal });
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res.json();
}

export default function WebMcpTools() {
  const router = useRouter();

  useEffect(() => {
    const mc = typeof navigator !== "undefined" ? navigator.modelContext : null;
    if (!mc?.registerTool) return;

    // Unregisters every tool below when this component unmounts, which is what
    // the spec's signal option is for.
    const controller = new AbortController();
    const { signal } = controller;

    const tools = [
      {
        name: "get_market_sentiment_index",
        title: "Get the market sentiment index",
        description:
          "Get the current market sentiment reading (0-100), the sentiment " +
          "zone it falls in, and the indicators behind it. Use for questions about " +
          "overall market sentiment right now.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        async execute(_input, options) {
          const data = await getJson("/api/fear-greed", options);
          const values = data?.values ?? [];
          const dates = data?.dates ?? [];
          if (!values.length) return { error: "The upstream sentiment feed is unavailable." };
          return {
            as_of: dates[dates.length - 1],
            current: Math.round(values[values.length - 1]),
            scale: "0 = very bearish, 100 = very bullish",
            indicators: data.indicators ?? null,
          };
        },
      },
      {
        name: "search_stocks",
        title: "Search stocks and ETFs",
        description:
          "Search listed stocks and ETFs by ticker or company name. Returns matching " +
          "symbols with their names and exchanges. Use to resolve a company name to a " +
          "ticker before asking for a quote.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "A ticker or company name, e.g. 'NVDA' or 'Nvidia'." },
          },
          required: ["query"],
          additionalProperties: false,
        },
        async execute({ query }, options) {
          const data = await getJson(`/api/stock-search?q=${encodeURIComponent(query)}`, options);
          return { results: data.results ?? [] };
        },
      },
      {
        name: "get_stock_quote",
        title: "Get stock quotes",
        description:
          "Get the latest price and day change for one or more stock or ETF tickers.",
        inputSchema: {
          type: "object",
          properties: {
            symbols: {
              type: "array",
              items: { type: "string" },
              description: "Ticker symbols, e.g. ['NVDA', 'SPY'].",
              minItems: 1,
              maxItems: 20,
            },
          },
          required: ["symbols"],
          additionalProperties: false,
        },
        async execute({ symbols }, options) {
          const list = symbols.join(",");
          const data = await getJson(
            `/api/watchlist-quotes?symbols=${encodeURIComponent(list)}`,
            options
          );
          return { quotes: data.quotes ?? [] };
        },
      },
      {
        name: "compare_stock_to_sentiment",
        title: "Open a stock research chart",
        description:
          "Open this site's research page for a given stock or ETF, including its price, " +
          "fundamentals, technicals, news, and market context. " +
          "Navigates the page the user is looking at.",
        inputSchema: {
          type: "object",
          properties: {
            symbol: { type: "string", description: "The ticker to chart, e.g. 'TSLA'." },
          },
          required: ["symbol"],
          additionalProperties: false,
        },
        async execute({ symbol }) {
          const ticker = String(symbol).trim().toUpperCase();
          router.push(`/stock/${encodeURIComponent(ticker)}`);
          return { navigated_to: `/stock/${ticker}` };
        },
      },
      {
        name: "list_site_pages",
        title: "List the site's pages",
        description:
          "List the main pages of this site and what each one shows, to decide where to " +
          "navigate for a given question.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        async execute() {
          return {
            pages: [
              { path: "/", title: "Market overview - US equities, sectors and yields" },
              { path: "/screener", title: "Stock screener" },
              { path: "/maps", title: "Stock map - the market by sector and size" },
              { path: "/supply-chain", title: "Supply chain relationships" },
              { path: "/13Filings", title: "13F Filings" },
              { path: "/market-cap", title: "Market cap ranking" },
              { path: "/earnings-calendar", title: "Earnings calendar" },
              { path: "/watchlist", title: "Your watchlist and portfolio" },
            ],
          };
        },
      },
    ];

    for (const tool of tools) {
      // Older drafts named this provideContext/registerTools; register one at a
      // time so a rejection on one tool cannot take the rest down with it.
      Promise.resolve(mc.registerTool(tool, { signal })).catch(() => {
        /* the agent simply does not see this tool */
      });
    }

    return () => controller.abort();
  }, [router]);

  return null;
}
