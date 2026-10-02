import assert from "node:assert/strict";
import { test } from "node:test";
import { extractSymbols, renderAnswer } from "./liloText.js";

test("finds tickers people actually type", () => {
  assert.deepEqual(extractSymbols("how is NVDA doing"), ["NVDA"]);
  assert.deepEqual(extractSymbols("$aapl vs $msft"), ["AAPL", "MSFT"]);
  // Words shaped like tickers that never mean one here.
  assert.deepEqual(extractSymbols("what does the CEO think about AI"), []);
  assert.deepEqual(extractSymbols("where is the API page"), []);
  assert.deepEqual(extractSymbols("how do I use the screener"), []);
  // Single letters are word fragments far more often than tickers: this
  // quoted Everpure (P) and Eni (E) at a question about valuation.
  assert.deepEqual(extractSymbols("what is a P/E ratio"), []);
  // A cashtag is explicit enough to reach a one-letter ticker anyway.
  assert.deepEqual(extractSymbols("how is $F doing"), ["F"]);
});

test("renders links the widget can display, dropping templates", () => {
  assert.equal(
    renderAnswer({ text: "Here.", pages: [{ path: "/maps", title: "Stock maps" }] }),
    "Here.\n\n[Stock maps](/maps)"
  );
  // An unfilled template must never reach the page as a link.
  assert.equal(
    renderAnswer({ text: "Here.", pages: [{ path: "/stock/{SYMBOL}", title: "Stock" }] }),
    "Here."
  );
  assert.equal(renderAnswer(null), "");
});
