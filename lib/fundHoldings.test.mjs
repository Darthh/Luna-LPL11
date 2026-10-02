// node lib/fundHoldings.test.mjs
// weighted() merges a fund's duplicate lines: Vanguard files 15 of the
// Russell's names twice, and unmerged they collide on the map's React key.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// weighted() is module-private, so exercise it through the source.
const src = readFileSync(new URL("./fundHoldings.js", import.meta.url), "utf8");
const body = src.slice(src.indexOf("function weighted"), src.indexOf("async function fetchBlackRockFund"));
const weighted = new Function(`${body}; return weighted;`)();

const out = weighted([
  { symbol: "SF", name: "Stifel", value: 30 },
  { symbol: "SF", name: "Stifel", value: 10 },
  { symbol: "AAPL", name: "Apple", value: 60 },
]);

assert.equal(out.length, 2, "duplicate tickers collapse into one holding");
assert.equal(out.filter((h) => h.symbol === "SF").length, 1);
assert.equal(out.find((h) => h.symbol === "SF").weight, 40, "split lots sum into one weight");
assert.equal(Math.round(out.reduce((a, h) => a + h.weight, 0)), 100);
assert.throws(() => weighted([{ symbol: "X", value: 0 }]), /No market value/);

console.log("ok");
