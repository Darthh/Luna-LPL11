// Self-check for the two 13F rosters: `node scripts/test-rosters.mjs`.
//
// What is worth pinning down is that the split holds. The two lists are read
// by the same code off the same filings, so the only things keeping them
// apart are the roster membership and the value floor - and both are easy to
// break without anything failing loudly.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// lib/ imports itself through the "@/" alias, which means nothing to node.
const root = new URL("../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith("@/")) return nextResolve(specifier, context);
    const path = specifier.slice(2);
    return { url: new URL(/\.[a-z]+$/.test(path) ? path : `${path}.js`, root).href, shortCircuit: true };
  },
});

const { MANAGERS, ROSTERS, isKnownManager, managerByCik, minValueFor, isRoster } =
  await import("../lib/thirteenF.js");
const { INSTITUTIONS } = await import("../lib/institutions.js");
const { HEDGE_QUARTERS } = await import("../lib/hedgeFundQuarters.js");
const { HEDGE_AGGREGATES } = await import("../lib/hedgeFundAggregates.js");

// No firm on both lists. The institutions page this was drawn from carries
// several trading firms that are already under Hedgefunds, and letting one
// through would show it twice with the toggle meaning nothing.
const managerCiks = new Set(MANAGERS.map((m) => m.cik));
const both = INSTITUTIONS.filter((i) => managerCiks.has(i.cik)).map((i) => i.name);
assert.deepEqual(both, [], `on both rosters: ${both.join(", ")}`);

// A CIK identifies one firm, within a list and across the two.
for (const [name, roster] of Object.entries(ROSTERS)) {
  const seen = new Set();
  for (const m of roster) {
    assert.match(m.cik, /^\d{10}$/, `${name}: bad CIK ${m.cik} for ${m.name}`);
    assert.ok(!seen.has(m.cik), `${name}: duplicate CIK ${m.cik}`);
    seen.add(m.cik);
  }
}

// Lookups span both rosters. The detail page resolves a manager by CIK alone -
// it has no idea which tab the reader clicked from - so an institution that
// only `isKnownManager` on the hedgefund list 404s on click, which is exactly
// what it used to do.
for (const inst of INSTITUTIONS) {
  assert.ok(isKnownManager(inst.cik), `${inst.name} is not a known manager`);
  assert.equal(managerByCik(inst.cik)?.name, inst.name);
}
assert.ok(isKnownManager(MANAGERS[0].cik));
assert.equal(managerByCik("9999999999"), null);

// The floors, which are what each list means by "big enough".
assert.equal(minValueFor("institutions"), 100e9);
assert.equal(minValueFor("hedgefunds"), 2e9);
// An unknown roster falls back to the hedgefund floor rather than to no floor,
// so a typo can never publish a list with everything in it.
assert.equal(minValueFor("nonsense"), 2e9);
assert.ok(isRoster("institutions") && isRoster("hedgefunds"));
assert.ok(!isRoster("nonsense") && !isRoster("toString"));

// The frozen lists have to obey the same floors, or the precomputed answer and
// the live one disagree about who belongs on the page.
for (const [name, byQuarter] of Object.entries(HEDGE_QUARTERS.rosters)) {
  const floor = minValueFor(name);
  for (const [period, rows] of Object.entries(byQuarter)) {
    for (const row of rows) {
      assert.ok(
        row.totalValue >= floor,
        `${name} ${period}: ${row.name} is $${(row.totalValue / 1e9).toFixed(1)}B, under the floor`
      );
      // The table's Quarter column reads `period` off the row; leaving it off
      // made that column read n/a wherever the snapshot answered.
      assert.equal(row.period, period, `${name} ${period}: ${row.name} has period ${row.period}`);
    }
    // Biggest book first, the order the page renders in.
    const values = rows.map((r) => r.totalValue);
    assert.deepEqual(values, [...values].sort((a, b) => b - a), `${name} ${period}: out of order`);
  }
}

// The span the page offers: 14 quarters reaching Q1 2023.
assert.equal(HEDGE_QUARTERS.quarters.length, 14);
assert.equal(HEDGE_QUARTERS.quarters.at(-1), "2023-03-31");
assert.deepEqual(HEDGE_QUARTERS.quarters, [...HEDGE_QUARTERS.quarters].sort().reverse());

// Every picker quarter has immutable aggregate boards. A request must never
// fall through to the incremental EDGAR builder merely because it is old.
assert.deepEqual(Object.keys(HEDGE_AGGREGATES).sort(), [...HEDGE_QUARTERS.quarters].sort());
for (const period of HEDGE_QUARTERS.quarters) {
  const aggregate = HEDGE_AGGREGATES[period];
  assert.equal(aggregate.asOf, period);
  assert.equal(aggregate.increased.length, 20, `${period}: incomplete increased board`);
  assert.equal(aggregate.mostOwned.length, 20, `${period}: incomplete most-owned board`);
}

// The reported Q1 2026 total is compared with Q1 2025 by CIK. This guards the
// exact regression that made every historical YoY cell render n/a.
const q126 = HEDGE_QUARTERS.rosters.hedgefunds["2026-03-31"];
const q125 = new Map(
  HEDGE_QUARTERS.rosters.hedgefunds["2025-03-31"].map((fund) => [fund.cik, fund])
);
const susquehanna = q126.find((fund) => fund.cik === "0001446194");
const susquehannaPrior = q125.get(susquehanna.cik);
const susquehannaYoy =
  ((susquehanna.totalValue - susquehannaPrior.totalValue) / susquehannaPrior.totalValue) * 100;
assert.ok(Number.isFinite(susquehannaYoy));
assert.ok(Math.abs(susquehannaYoy - 52.481114) < 0.000001);

console.log("rosters: ok");
