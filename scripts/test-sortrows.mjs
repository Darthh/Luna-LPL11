// Self-check for the shared table sorter: `node scripts/test-sortrows.mjs`.
// The screener and the hedge fund list both sort through this, and the part
// worth pinning down is what happens to a row with no value - getting that
// wrong reads as "these are the cheapest stocks" when they're the ones with no
// P/E at all, which looks exactly like a right answer.
import assert from "node:assert/strict";
import { cycleSort, sortRows } from "../lib/sortRows.js";

// Three states, in the order a user clicks through them.
assert.deepEqual(cycleSort(null, "pe"), { key: "pe", dir: "desc" });
assert.deepEqual(cycleSort({ key: "pe", dir: "desc" }, "pe"), { key: "pe", dir: "asc" });
assert.equal(cycleSort({ key: "pe", dir: "asc" }, "pe"), null);
// A different column starts its own cycle rather than inheriting the direction.
assert.deepEqual(cycleSort({ key: "pe", dir: "asc" }, "eps"), { key: "eps", dir: "desc" });

const rows = [
  { s: "A", pe: 12 },
  { s: "B", pe: null },
  { s: "C", pe: 4 },
  { s: "D", pe: 30 },
  { s: "E", pe: null },
];
const order = (sort) => sortRows(rows, sort).map((r) => r.s).join("");

// No sort is the order the data arrived in, untouched.
assert.equal(order(null), "ABCDE");
assert.equal(sortRows(rows, null), rows, "unsorted returns the same array, not a copy");

// Highest first, lowest first - and the unknowns at the bottom of both.
assert.equal(order({ key: "pe", dir: "desc" }), "DACBE");
assert.equal(order({ key: "pe", dir: "asc" }), "CADBE");

// Sorting doesn't mutate what it was given.
assert.equal(rows.map((r) => r.s).join(""), "ABCDE");

// Strings compare as text, not as numbers-that-failed-to-parse.
const names = [{ n: "Zeta" }, { n: "alpha" }, { n: "Mid" }];
assert.equal(sortRows(names, { key: "n", dir: "asc" }).map((r) => r.n).join(","), "alpha,Mid,Zeta");

console.log("ok - table sorting");
