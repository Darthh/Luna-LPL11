import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const asModuleUrl = async (path) =>
  `data:text/javascript;base64,${Buffer.from(await readFile(path)).toString("base64")}`;

const stockUrl = await asModuleUrl(new URL("../lib/stockMapData.js", import.meta.url));
const dataUrl = await asModuleUrl(new URL("../lib/supplyChainData.js", import.meta.url));
const supplySource = (await readFile(new URL("../lib/supplyChain.js", import.meta.url), "utf8"))
  .replace('from "./stockMapData"', `from ${JSON.stringify(stockUrl)}`)
  .replace('from "./supplyChainData"', `from ${JSON.stringify(dataUrl)}`);
const supplyUrl = `data:text/javascript;base64,${Buffer.from(supplySource).toString("base64")}`;

const [{ STOCK_UNIVERSE }, { buildGraph }] = await Promise.all([
  import(stockUrl),
  import(supplyUrl),
]);

const constituents = STOCK_UNIVERSE.filter((stock) => stock.indexes?.includes("sp500"));
const rows = constituents.map((stock) => {
  const graph = buildGraph(stock.symbol, 1, {
    competitors: 2,
    partners: 2,
    multiCategory: true,
  });
  const count = (side) => graph.nodes.filter((node) => node.side === side).length;
  return {
    symbol: stock.symbol,
    suppliers: count("up"),
    customers: count("down"),
    competitors: count("peer"),
    partners: count("partner"),
  };
});

assert.equal(rows.length, 500, "The stock universe should contain 500 S&P constituents");
for (const key of ["suppliers", "customers", "competitors", "partners"]) {
  const sparse = rows.filter((row) => row[key] < 2);
  assert.ok(
    sparse.length <= 25,
    `At least 95% of S&P companies need two ${key}; sparse: ${sparse.map((row) => row.symbol).join(", ")}`
  );
}

const micron = buildGraph("MU", 1, { competitors: 6, partners: 6, multiCategory: true });
assert.ok(
  micron.nodes.some((node) => node.id === "NVDA" && node.side === "down"),
  "Nvidia should be a Micron customer"
);
assert.ok(
  micron.nodes.some((node) => node.id === "NVDA" && node.side === "partner"),
  "Nvidia should also be a Micron ecosystem partner"
);

const nvidia = buildGraph("NVDA", 1, { competitors: 6, partners: 6, multiCategory: true });
assert.ok(
  nvidia.nodes.some((node) => node.id === "AMD" && node.side === "peer"),
  "AMD should be an Nvidia competitor"
);
assert.ok(
  nvidia.nodes.some((node) => node.id === "AMD" && node.side === "partner"),
  "AMD should also be an Nvidia ecosystem partner"
);

const minimums = Object.fromEntries(
  ["suppliers", "customers", "competitors", "partners"].map((key) => [
    key,
    Math.min(...rows.map((row) => row[key])),
  ])
);
console.log(`supply-chain coverage: ${rows.length} S&P companies checked`, minimums);
