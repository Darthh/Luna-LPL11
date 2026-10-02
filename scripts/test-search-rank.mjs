// Ordering of the ticker autocomplete. The cases here are the ones that were
// actually wrong on the page: typing a megacap's own ticker used to hand the
// top rows to the levered/income ETFs written on it.
import assert from "node:assert/strict";
import { rankQuotes } from "../lib/searchRank.js";

const syms = (rows, q) => rankQuotes(rows, q).map((r) => r.symbol);

// The company, not the shelf of wrappers on it.
const nvda = syms(
  [
    { symbol: "DIPS", name: "YieldMax Short NVDA Option Income Strategy ETF", exchange: "NYSEArca", type: "ETF" },
    { symbol: "NVDL", name: "GraniteShares 2x Long NVDA Daily ETF", exchange: "NasdaqGM", type: "ETF" },
    { symbol: "NVDA", name: "NVIDIA Corporation", exchange: "NasdaqGS", type: "EQUITY" },
    { symbol: "YNVD.NE", name: "Harvest NVIDIA Enhanced", exchange: "NEO", type: "ETF" },
  ],
  "NVDA",
);
assert.equal(nvda[0], "NVDA", "exact symbol match leads");
assert.ok(nvda.indexOf("NVDL") > 0, "levered wrapper sits below the company");
assert.equal(nvda.at(-1), "YNVD.NE", "suffixed foreign line goes last");

// Both Alphabet lines before a themed basket that merely mentions Google.
const goog = syms(
  [
    { symbol: "GOOG", name: "Alphabet Inc.", exchange: "NASDAQ", type: "EQUITY" },
    { symbol: "DEPW", name: "Google DeepMind AI Lab Ecosystem ETF", exchange: "NYSEArca", type: "ETF" },
    { symbol: "GOOGL", name: "Alphabet Inc.", exchange: "NASDAQ", type: "EQUITY" },
  ],
  "GOOG",
);
assert.deepEqual(goog.slice(0, 2), ["GOOG", "GOOGL"], "operating company outranks the ETF");

// An ETF that IS what was typed still leads: the demotion is for wrappers
// caught alongside a company, not for funds as a class.
assert.equal(
  syms(
    [
      { symbol: "VOO", name: "Vanguard S&P 500 ETF", exchange: "NYSEArca", type: "ETF" },
      { symbol: "VOOG", name: "Vanguard S&P 500 Growth ETF", exchange: "NYSEArca", type: "ETF" },
    ],
    "VOO",
  )[0],
  "VOO",
);

// "Long"/"short"/"income" appear in real company names; only the
// wrapper-specific wording demotes.
assert.equal(
  syms([{ symbol: "LNGV", name: "Longview Industries", exchange: "NYSE", type: "EQUITY" }], "LONG")[0],
  "LNGV",
);

console.log("search rank ok");
