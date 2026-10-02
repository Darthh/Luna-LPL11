// Smallest thing that fails if country labelling breaks.
import assert from "node:assert/strict";
import { countryLabel } from "./market.js";

// The cases the column exists for: a US company and a foreign one that lists
// in New York, which the exchange code alone would have both called USA.
assert.deepEqual(countryLabel("United States"), { country: "USA", flag: "us" });
assert.deepEqual(countryLabel("Taiwan"), { country: "Taiwan", flag: "tw" });
assert.deepEqual(countryLabel("Japan"), { country: "Japan", flag: "jp" });
assert.deepEqual(countryLabel("United Kingdom"), { country: "UK", flag: "gb" });
assert.deepEqual(countryLabel("South Korea"), { country: "South Korea", flag: "kr" });
assert.deepEqual(countryLabel("Germany"), { country: "Germany", flag: "de" });
assert.deepEqual(countryLabel("China"), { country: "China", flag: "cn" });
assert.deepEqual(countryLabel(null), { country: null, flag: null });
// An unknown name still labels the cell, just without a flag.
assert.deepEqual(countryLabel("Atlantis"), { country: "Atlantis", flag: null });

// Every country Yahoo reports for a large listed company must resolve a flag.
for (const n of [
  "Canada", "France", "Netherlands", "Switzerland", "Italy", "Spain", "Sweden",
  "Australia", "India", "Brazil", "Mexico", "Singapore", "Hong Kong", "Ireland",
  "Denmark", "Norway", "Finland", "Belgium", "Israel", "South Africa", "Russia",
])
  assert.ok(countryLabel(n).flag, `no flag for ${n}`);

console.log("country labels OK");
