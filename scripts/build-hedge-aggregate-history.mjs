// Records the Top 20 boards for every quarter offered by the picker.
// Run once after updating the quarterly filing snapshot:
//   node scripts/build-hedge-aggregate-history.mjs
// An optional period rebuilds only one quarter:
//   node scripts/build-hedge-aggregate-history.mjs 2026-03-31
import { registerHooks } from "node:module";
import { writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith("@/")) return nextResolve(specifier, context);
    const path = specifier.slice(2);
    return { url: new URL(/\.[a-z]+$/.test(path) ? path : `${path}.js`, root).href, shortCircuit: true };
  },
});

const [
  { MANAGERS, fundTickerRows },
  { rankAggregates },
  { HEDGE_QUARTERS },
  { HEDGE_TOP20 },
  { HEDGE_AGGREGATES },
] =
  await Promise.all([
    import("../lib/thirteenF.js"),
    import("../lib/hedgeFundAggregate.js"),
    import("../lib/hedgeFundQuarters.js"),
    import("../lib/hedgeFundTop20.js"),
    import("../lib/hedgeFundAggregates.js"),
  ]);

const only = process.argv[2];
if (only && !HEDGE_QUARTERS.quarters.includes(only)) throw new Error(`Unknown quarter: ${only}`);
const periods = only ? [only] : HEDGE_QUARTERS.quarters;
const recorded = { ...HEDGE_AGGREGATES };
const { weights: _weights, ...latest } = HEDGE_TOP20;
recorded[latest.asOf] = latest;

for (const period of periods) {
  if (!only && recorded[period]) continue;
  const books = [];
  for (const [index, manager] of MANAGERS.entries()) {
    const rows = await fundTickerRows(manager.cik, period).catch((error) => {
      console.log(`  -- ${manager.name}: ${error.message}`);
      return [];
    });
    books.push(rows);
    console.log(`${period} ${index + 1}/${MANAGERS.length} ${manager.name} — ${rows.length}`);
  }
  const boards = rankAggregates(books);
  recorded[period] = {
    asOf: period,
    generated: new Date().toISOString().slice(0, 10),
    funds: books.filter((rows) => rows.length).length,
    ...boards,
  };
}

const header = `// Generated immutable Top 20 boards by reporting quarter.\n// Rebuild with scripts/build-hedge-aggregate-history.mjs after each 13F deadline.\n`;
writeFileSync(
  new URL("../lib/hedgeFundAggregates.js", import.meta.url),
  `${header}export const HEDGE_AGGREGATES = ${JSON.stringify(recorded, null, 2)};\n`
);
console.log(`Recorded ${Object.keys(recorded).length} aggregate quarter(s).`);
