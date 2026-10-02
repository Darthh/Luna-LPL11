// Self-check for the screener's query builder: `node scripts/test-screener-query.mjs`.
// The bits worth guarding are the ones a wrong answer hides behind plausible
// results - market cap scaled out of billions, a 0 bound mistaken for a blank
// box, and forward P/E being held back for local filtering instead of being
// sent to Yahoo as a field that doesn't exist.
import assert from "node:assert/strict";
import { buildQuery, CRITERIA } from "../lib/screenerFields.js";

const q = (s) => buildQuery(new URLSearchParams(s));

// Nothing filled in screens on nothing.
assert.deepEqual(q(""), { operands: [], applied: [], local: null });

// Min only, max only, both.
assert.deepEqual(q("peMin=10").operands, [{ operator: "gte", operands: ["peratio.lasttwelvemonths", 10] }]);
assert.deepEqual(q("peMax=25").operands, [{ operator: "lte", operands: ["peratio.lasttwelvemonths", 25] }]);
assert.equal(q("peMin=10&peMax=25").operands.length, 2);

// Market cap is typed in billions and sent in dollars.
assert.deepEqual(q("capMin=2").operands, [{ operator: "gte", operands: ["intradaymarketcap", 2e9] }]);

// Growth is already a percentage upstream, so it goes over untouched - and
// negatives are legitimate (shrinking revenue).
assert.deepEqual(q("revGrowthMin=15").operands, [
  { operator: "gte", operands: ["totalrevenues1yrgrowth.lasttwelvemonths", 15] },
]);
assert.equal(q("epsGrowthMax=-10").operands[0].operands[1], -10);

// 0 is a bound, not an empty box.
assert.deepEqual(q("pegMin=0").operands, [{ operator: "gte", operands: ["pegratio_5y", 0] }]);
assert.deepEqual(q("pegMin=").operands, []);

// Forward P/E has no upstream field: it must never reach the operands, and
// must come back as a local bound instead.
assert.deepEqual(q("forwardPeMax=20").operands, []);
assert.deepEqual(q("forwardPeMax=20").local, { min: null, max: 20 });
assert.deepEqual(q("forwardPeMax=20").applied, [{ key: "forwardPe", min: null, max: 20 }]);

// Junk is dropped rather than sent upstream as NaN.
assert.deepEqual(q("peMin=abc").operands, []);

// Every criterion the UI renders is either screenable or handled locally.
assert.ok(CRITERIA.every((c) => c.field || c.key === "forwardPe"));
assert.equal(new Set(CRITERIA.map((c) => c.key)).size, CRITERIA.length);

// --- presets ---
for (const c of CRITERIA) {
  // Index 0 is what the form starts on, so it has to mean "screen on nothing".
  assert.deepEqual(c.options[0], { label: "Any" }, `${c.key} must open on Any`);
  assert.ok(c.options.length >= 10, `${c.key} has too few presets`);
  assert.equal(
    new Set(c.options.map((o) => o.label)).size,
    c.options.length,
    `${c.key} has duplicate preset labels`
  );
  for (const o of c.options) {
    for (const bound of ["min", "max"]) {
      assert.ok(
        o[bound] === undefined || Number.isFinite(o[bound]),
        `${c.key} "${o.label}" has a non-numeric ${bound}`
      );
    }
    // A range preset that reads backwards would match nothing at all.
    if (o.min != null && o.max != null) {
      assert.ok(o.min < o.max, `${c.key} "${o.label}" has min above max`);
    }
  }
}

// The market cap tiers are written in billions against a 1e9 scale, so
// "Mega ($200B and more)" has to reach Yahoo as 2e11 - a preset written in
// dollars by mistake would screen for a $200bn-billion company and find none.
const cap = CRITERIA.find((c) => c.key === "cap");
const mega = cap.options.find((o) => o.label.startsWith("Mega"));
assert.deepEqual(buildQuery(new URLSearchParams(`capMin=${mega.min}`)).operands, [
  { operator: "gte", operands: ["intradaymarketcap", 2e11] },
]);
const micro = cap.options.find((o) => o.label.startsWith("Micro"));
assert.deepEqual(buildQuery(new URLSearchParams(`capMin=${micro.min}&capMax=${micro.max}`)).operands, [
  { operator: "gte", operands: ["intradaymarketcap", 5e7] },
  { operator: "lte", operands: ["intradaymarketcap", 3e8] },
]);

// Debt/Equity is the other scaled criterion: Yahoo carries it as a percentage
// of equity, so the "Under 0.5" preset has to leave here as 50.
const de = CRITERIA.find((c) => c.key === "debtEquity");
assert.equal(de.scale, 100);
assert.deepEqual(buildQuery(new URLSearchParams("debtEquityMax=0.5")).operands, [
  { operator: "lte", operands: ["totaldebtequity.lasttwelvemonths", 50] },
]);

// "Profitable (>0)" and "Negative (<0%)" are the presets whose only bound is
// zero - the case a truthiness check silently drops.
const profitable = CRITERIA.find((c) => c.key === "pe").options.find((o) =>
  o.label.startsWith("Profitable")
);
assert.equal(profitable.min, 0);
assert.equal(buildQuery(new URLSearchParams(`peMin=${profitable.min}`)).operands.length, 1);
const negative = CRITERIA.find((c) => c.key === "revGrowth").options.find((o) =>
  o.label.startsWith("Negative")
);
assert.equal(negative.max, 0);
assert.equal(buildQuery(new URLSearchParams(`revGrowthMax=${negative.max}`)).operands.length, 1);

console.log("screener query builder: all checks passed");
