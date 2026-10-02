// Regenerates lib/hedgeFundQuarters.js - the frozen per-quarter 13F lists for
// both rosters.
//
//   node scripts/build-hedge-quarters.mjs
//
// Run it after a 13F deadline, which is 45 days past quarter end: mid-February,
// mid-May, mid-August, mid-November. Same cadence as build-hedge-aggregate.mjs,
// and for the same reason - a filed 13F never changes, so a list that was true
// once is true forever.
//
// What it writes is every quarter's list as it stood at that quarter: who
// cleared $10B then, what their book was worth, how many positions. That is
// two EDGAR reads per manager per quarter built live, which at fourteen
// quarters and ninety-two managers is minutes of waiting on a page that has no
// reason to be slow. Here it is a file.
//
// Holdings are deliberately NOT precomputed. A single manager's information
// table runs to megabytes; all of them across fourteen quarters would be a
// generated file in the hundreds of megabytes, to save a fetch that already
// caches on first click.
import { registerHooks } from "node:module";
import { writeFileSync } from "node:fs";

// Same alias teaching as build-hedge-aggregate.mjs - lib/ imports itself
// through the "@/" alias jsconfig.json gives the app, which means nothing to
// node.
const root = new URL("../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith("@/")) return nextResolve(specifier, context);
    const path = specifier.slice(2);
    return { url: new URL(/\.[a-z]+$/.test(path) ? path : `${path}.js`, root).href, shortCircuit: true };
  },
});

const { ROSTERS, fundList, minValueFor } = await import("../lib/thirteenF.js");

// The quarters to record, newest first. Taken from the hedgefund roster's own
// history rather than hardcoded, so the span moves forward on its own as new
// filings land - the floor is what was asked for, Q1 2023.
const FLOOR = "2023-03-31";

const out = {};
let quarters = [];

for (const [name, roster] of Object.entries(ROSTERS)) {
  console.log(`\n=== ${name} (${roster.length} firms) ===`);
  // The newest list first: it carries the periods every other read uses, so
  // there is no separate history pass.
  const floor = minValueFor(name);
  const latest = await fundList(undefined, roster, floor);
  const periods = latest.periods.filter((p) => p >= FLOOR);
  if (name === "hedgefunds") quarters = periods;

  const byQuarter = {};
  for (const [i, period] of periods.entries()) {
    // The newest quarter is already read.
    const list = period === latest.asOf ? latest : await fundList(period, roster, floor);
    // `period` is carried on every row rather than left implicit in the key:
    // the table's Quarter column reads it, and the live path has always had
    // it. Dropping it here made that column read n/a on every frozen row.
    byQuarter[period] = list.funds.map((f) => ({
      cik: f.cik,
      name: f.name,
      period: f.period,
      filed: f.filed,
      totalValue: f.totalValue,
      positions: f.positions,
    }));
    console.log(
      `  ${i + 1}/${periods.length} ${period} — ${byQuarter[period].length} over $${floor / 1e9}B`
    );
  }
  // Bake the same-quarter-prior-year comparison into every recorded row.
  for (const [period, rows] of Object.entries(byQuarter)) {
    const priorPeriod = `${Number(period.slice(0, 4)) - 1}${period.slice(4)}`;
    const prior = new Map((byQuarter[priorPeriod] ?? []).map((f) => [f.cik, f]));
    for (const row of rows) {
      const before = prior.get(row.cik)?.totalValue;
      row.yoy = before ? ((row.totalValue - before) / before) * 100 : null;
      row.yoyPriorPeriod = before ? priorPeriod : null;
    }
  }
  out[name] = byQuarter;
}

if (!quarters.length) throw new Error("No quarters were read - refusing to write an empty snapshot");

const payload = {
  generated: new Date().toISOString().slice(0, 10),
  // Every quarter on offer, newest first. The picker reads this rather than
  // deriving it, so both rosters agree on what the quarters are even when one
  // of them has no filer for an older one.
  quarters,
  rosters: out,
};

const header = `// Generated ${payload.generated} from SEC 13F filings by
// scripts/build-hedge-quarters.mjs. Don't edit by hand - see that file, and
// rerun it after the next filing deadline.
//
// Every quarter's list as it stood at that quarter, for both rosters. Building
// these live is two EDGAR reads per manager per quarter; a filed 13F never
// changes, so they are read once and served from here. An empty \`quarters\`
// sends the API back to building the list live.
`;

writeFileSync(
  new URL("../lib/hedgeFundQuarters.js", import.meta.url),
  `${header}export const HEDGE_QUARTERS = ${JSON.stringify(payload, null, 2)};\n`
);

const counts = Object.entries(out)
  .map(([k, v]) => `${k}: ${Object.values(v)[0]?.length ?? 0} at ${quarters[0]}`)
  .join(", ");
console.log(`\nlib/hedgeFundQuarters.js: ${quarters.length} quarters (${quarters.at(-1)} … ${quarters[0]}), ${counts}`);
