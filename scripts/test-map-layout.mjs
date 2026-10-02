// Self-check for the shared stock-map layout: `node scripts/test-map-layout.mjs`.
//
// This code was lifted out of components/StockMap.jsx so the fund pages could
// draw the same map. Both callers depend on it, so what is pinned here is the
// part that would break quietly: every tile laid out, inside its canvas, and
// the color scale meaning the same thing at both ends.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// lib/ imports itself through the "@/" alias jsconfig.json gives the app,
// which means nothing to node.
const root = new URL("../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith("@/")) return nextResolve(specifier, context);
    const path = specifier.slice(2);
    return { url: new URL(/\.[a-z]+$/.test(path) ? path : `${path}.js`, root).href, shortCircuit: true };
  },
});

const mapLayout = await import("../lib/mapLayout.js");
const {
  MAP_PERIODS,
  SCALE_MAX,
  buildMapLayout,
  buildPortfolioMapStocks,
  formatPerf,
  perfColor,
  tileText,
} = mapLayout;

const stock = (symbol, sector, industry, cap) => ({ symbol, sector, industry, cap });

const stocks = [
  stock("AAA", "Technology", "Software", 500),
  stock("BBB", "Technology", "Software", 300),
  stock("CCC", "Technology", "Semiconductors", 150),
  stock("DDD", "Healthcare", "Biotech", 50),
];

const W = 800;
const H = 400;
const { tiles, headers } = buildMapLayout(stocks, W, H);

// Every stock gets a tile - a map that silently drops the small ones is a map
// that lies about what the fund holds.
assert.equal(tiles.length, stocks.length);
assert.deepEqual(
  [...tiles.map((t) => t.stock.symbol)].sort(),
  ["AAA", "BBB", "CCC", "DDD"]
);

// Tiles stay inside the canvas, with a real area. A tile laid out past the
// edge is invisible, which looks exactly like a dropped position.
for (const t of tiles) {
  assert.ok(t.w > 0 && t.h > 0, `${t.stock.symbol} has no area`);
  assert.ok(t.x >= -0.01 && t.y >= -0.01, `${t.stock.symbol} starts off-canvas`);
  assert.ok(t.x + t.w <= W + 0.01, `${t.stock.symbol} runs past the right edge`);
  assert.ok(t.y + t.h <= H + 0.01, `${t.stock.symbol} runs past the bottom`);
}

// Bigger position, bigger tile. This is the whole claim a treemap makes.
const areaOf = (sym) => {
  const t = tiles.find((x) => x.stock.symbol === sym);
  return t.w * t.h;
};
assert.ok(areaOf("AAA") > areaOf("BBB"), "AAA is worth more than BBB");
assert.ok(areaOf("BBB") > areaOf("CCC"));
assert.ok(areaOf("CCC") > areaOf("DDD"));

// Sectors are grouped, biggest first - Technology's 950 outweighs Healthcare's 50.
assert.equal(headers[0]?.name, "Technology");

// `sizeOf` is what lets a fund map size by reported value instead of by cap.
const byValue = buildMapLayout(
  [
    { symbol: "AAA", sector: "S", industry: "I", cap: 1, value: 10 },
    { symbol: "BBB", sector: "S", industry: "I", cap: 999, value: 90 },
  ],
  W,
  H,
  (s) => s.value
);
const big = byValue.tiles.find((t) => t.stock.symbol === "BBB");
const small = byValue.tiles.find((t) => t.stock.symbol === "AAA");
assert.ok(big.w * big.h > small.w * small.h, "sized by value, not by the cap field");

// The user's priced holdings are authoritative. Profile data enriches the
// map, but a missing profile must never make a real watchlist position vanish.
assert.equal(typeof buildPortfolioMapStocks, "function", "portfolio map stock builder is exported");
const portfolioStocks = buildPortfolioMapStocks(
  [
    { symbol: "AMD", name: "Advanced Micro Devices", value: 5700 },
    { symbol: "NEW", name: "New Listing", value: 2100 },
  ],
  [{ symbol: "AMD", name: "AMD", sector: "Technology", industry: "Semiconductors" }]
);
assert.deepEqual(
  portfolioStocks,
  [
    {
      symbol: "AMD",
      name: "AMD",
      sector: "Technology",
      industry: "Semiconductors",
      value: 5700,
    },
    {
      symbol: "NEW",
      name: "New Listing",
      sector: "Other",
      industry: "Other",
      value: 2100,
    },
  ],
  "every positive-dollar holding is preserved and sorted by value"
);

// An empty map is empty rather than a crash - a fund whose positions all lack
// tickers reaches this.
assert.deepEqual(buildMapLayout([], W, H), { headers: [], labels: [], tiles: [] });

// --- The color scale --------------------------------------------------------

// Every period the toggles offer has a scale bound, or its tiles all pin to
// full saturation and the map stops distinguishing anything.
for (const p of MAP_PERIODS) {
  assert.ok(SCALE_MAX[p.key] > 0, `${p.key} has no scale bound`);
}
// The longer the horizon the wider the scale: a 50% year is remarkable, a 50%
// three years is not, and one scale for both would paint them the same green.
const keys = ["6m", "1y", "2y", "3y"];
for (let i = 1; i < keys.length; i++) {
  assert.ok(SCALE_MAX[keys[i]] > SCALE_MAX[keys[i - 1]], `${keys[i]} must widen the scale`);
}

// Missing data is grey, not a false zero - a stock nothing could be priced for
// must not read as flat.
assert.equal(perfColor(null, "1y"), perfColor(undefined, "1y"));
assert.notEqual(perfColor(null, "1y"), perfColor(0, "1y"));
// Direction: gains green, losses red, and the scale saturates rather than
// running past itself.
const green = perfColor(SCALE_MAX["1y"], "1y");
const red = perfColor(-SCALE_MAX["1y"], "1y");
assert.notEqual(green, red);
assert.equal(perfColor(SCALE_MAX["1y"] * 5, "1y"), green, "clamped at the top");
assert.equal(perfColor(-SCALE_MAX["1y"] * 5, "1y"), red, "clamped at the bottom");

assert.equal(formatPerf(null), "n/a");
assert.equal(formatPerf(0), "+0.00%");
assert.equal(formatPerf(-12.345), "-12.3%");
assert.equal(formatPerf(345.9), "+346%");

// --- Tile text --------------------------------------------------------------

// A big tile shows both lines; a tiny one shows neither rather than spilling
// text over its neighbours.
const roomy = tileText("AAPL", 200, 120, "+38.7%");
assert.ok(roomy.showSymbol && roomy.showPerf);
const cramped = tileText("AAPL", 8, 6, "+38.7%");
assert.ok(!cramped.showSymbol && !cramped.showPerf);
// The performance line never outgrows the ticker above it.
assert.ok(roomy.perfFont < roomy.fontSize);

console.log("map layout: ok");
