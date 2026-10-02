import assert from "node:assert/strict";
import { test } from "node:test";
import { STOCK_RANGES, buildStockCard, chartGeometry, stockLookupForMessage } from "./chatStockCard.mjs";

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
