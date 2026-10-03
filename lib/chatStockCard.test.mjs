import assert from "node:assert/strict";
import { test } from "node:test";
import { STOCK_RANGES, buildStockCard, chartGeometry, stockLookupForMessage, stockLookupsForMessages, stockLookupsForAnswer, loadStockCards } from "./chatStockCard.mjs";

test("collects lowercase, multiple, dotted, single-letter and answer-only tickers once", () => {
  assert.deepEqual(stockLookupsForMessages("compare amd and nvda with $F", "NVDA versus AMD, BRK.B and /stock/TSM"),
    ["AMD", "NVDA", "F", "BRK.B", "TSM"].map(symbol => ({ symbol })));
  assert.deepEqual(stockLookupsForMessages("Tell me about PLTR and crwd"), [{ symbol: "PLTR" }, { symbol: "CRWD" }]);
  assert.deepEqual(stockLookupsForMessages("What is a P/E ratio? CEO and ETF are terms."), []);
  assert.deepEqual(stockLookupsForMessages("NOW, LOW, F and T"), ["NOW", "LOW", "F", "T"].map(symbol => ({ symbol })));
  assert.deepEqual(stockLookupsForMessages("NVDA makes GPUs and chip designs as of Oct. 3; AMD sells CPUs."), [{ symbol: "NVDA" }, { symbol: "AMD" }]);
  assert.ok(stockLookupsForMessages("Tell me about Apple stock").some(lookup => lookup.query === "Apple"));
  assert.deepEqual(stockLookupsForAnswer("AMD and NVDA make chips; TSM adds foundry exposure. See /stock/tsm or $amd."), ["AMD", "NVDA", "TSM"].map(symbol => ({ symbol })));
});

test("loads every confirmed ticker and isolates missing chart data", async () => {
  const request = async url => {
    const symbol = new URL(url, "http://localhost").searchParams.get("symbol");
    if (url.includes("stock-search")) {
      const q = new URL(url, "http://localhost").searchParams.get("q");
      return Response.json({ results: ["AMD", "NVDA"].includes(q) ? [{ symbol: q }] : [] });
    }
    if (url.includes("stock-profile")) return Response.json({ symbol, quote: { price: 100 } });
    return Response.json({ points: symbol === "AMD" ? [{ t: 1, c: 99 }, { t: 2, c: 100 }] : [] });
  };
  const cards = await loadStockCards(stockLookupsForMessages("amd nvda zzzzz"), request);
  assert.equal(cards.length, 2);
  assert.equal(cards[0].symbol, "AMD");
  assert.equal(cards[0].points.length, 2);
  assert.deepEqual(cards[1], { symbol: "NVDA", unavailable: true });
});

test("resolves company names and dotted share classes to the correct listing", async () => {
  const request = async url => {
    const params = new URL(url, "http://localhost").searchParams;
    if (url.includes("stock-search")) {
      return Response.json({ results: params.get("q") === "BRK-B"
        ? [{ symbol: "BRK-B", name: "Berkshire Hathaway" }]
        : [{ symbol: "APLE", name: "Apple Hospitality REIT, Inc." }, { symbol: "AAPL", name: "Apple Inc." }] });
    }
    if (url.includes("stock-profile")) return Response.json({ symbol: params.get("symbol"), quote: { price: 100 } });
    return Response.json({ points: [{ t: 1, c: 99 }, { t: 2, c: 100 }] });
  };
  const cards = await loadStockCards([{ query: "Apple" }, { symbol: "BRK.B" }], request);
  assert.deepEqual(cards.map(card => card.symbol), ["AAPL", "BRK-B"]);
});

test("uses an explicit ticker in a stock question", () => {
  assert.deepEqual(stockLookupForMessage("Tell me about MU stock"), { symbol: "MU" });
});

test("turns a company-name stock question into a focused search", () => {
  assert.deepEqual(stockLookupForMessage("Tell me about Micron Technology stock"), {
    query: "Micron Technology",
  });
});

test("does not attach a chart to a general investing question", () => {
  assert.equal(stockLookupForMessage("What is a P/E ratio?"), null);
  assert.equal(stockLookupForMessage("Where can I find the stock screener?"), null);
});

test("plots a price series into a bounded SVG line and area", () => {
  assert.deepEqual(chartGeometry([{ c: 10 }, { c: 20 }, { c: 15 }], 100, 50), {
    line: "4,46 50,4 96,25",
    area: "4,46 50,4 96,25 96,46 4,46",
    rising: true,
  });
});

test("does not plot an unusable price series", () => {
  assert.equal(chartGeometry([], 100, 50), null);
  assert.equal(chartGeometry([{ c: null }], 100, 50), null);
});

test("keeps only the quote fields and candles needed by the chat card", () => {
  assert.deepEqual(
    buildStockCard(
      {
        symbol: "MU",
        name: "Micron Technology, Inc.",
        currency: "USD",
        quote: { price: 101.5, change: 2.5, changePct: 0.0253, open: 99, dayLow: 98, dayHigh: 103, volume: 1234, marketCap: 4567 },
        valuation: { trailingPE: 18.4, forwardPE: 14.2 },
        highlights: { profitMargin: 0.284 },
      },
      { range: "1d", points: [{ t: 1, c: 99 }, { t: 2, c: 101.5 }] }
    ),
    {
      symbol: "MU",
      name: "Micron Technology, Inc.",
      currency: "USD",
      price: 101.5,
      change: 2.5,
      changePct: 2.53,
      open: 99,
      dayLow: 98,
      dayHigh: 103,
      volume: 1234,
      marketCap: 4567,
      trailingPE: 18.4,
      forwardPE: 14.2,
      profitMargin: 0.284,
      range: "1d",
      points: [{ t: 1, c: 99 }, { t: 2, c: 101.5 }],
    }
  );
});

test("offers the same bounded chart ranges requested for chat", () => {
  assert.deepEqual(STOCK_RANGES, [
    { key: "1d", label: "1D" },
    { key: "1m", label: "1M" },
    { key: "6m", label: "6M" },
    { key: "1y", label: "1Y" },
    { key: "2y", label: "2Y" },
  ]);
});
