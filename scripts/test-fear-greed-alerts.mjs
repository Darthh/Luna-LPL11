// The alert crossing rule and its input validation.
import assert from "node:assert/strict";
import { shouldFire, validateAlert } from "../lib/fearGreedAlerts.js";

const above = (previous, current) =>
  shouldFire({ direction: "above", threshold: 67, previous, current });
const below = (previous, current) =>
  shouldFire({ direction: "below", threshold: 10, previous, current });

// Crossing up through 67 fires once, on the day it crosses.
assert.equal(above(60, 68), true);
assert.equal(above(67, 68), true);
// Already past it: the level is high but nothing crossed, so no repeat email.
assert.equal(above(68, 70), false);
// Sitting exactly on the threshold is not "above" it.
assert.equal(above(60, 67), false);
// Falling back through does not fire an "above" alert.
assert.equal(above(70, 60), false);

assert.equal(below(20, 8), true);
assert.equal(below(10, 9), true);
assert.equal(below(8, 7), false);
assert.equal(below(20, 10), false);

// No baseline never fires - a new alert must not email about a market that was
// already past its threshold before the user ever subscribed.
assert.equal(above(null, 90), false);
assert.equal(below(null, 2), false);
assert.equal(above(60, null), false);

assert.equal(validateAlert({ direction: "above", threshold: 67, email: "a@b.co" }), null);
assert.ok(validateAlert({ direction: "sideways", threshold: 67, email: "a@b.co" }));
assert.ok(validateAlert({ direction: "above", threshold: 0, email: "a@b.co" }));
assert.ok(validateAlert({ direction: "above", threshold: 100, email: "a@b.co" }));
assert.ok(validateAlert({ direction: "above", threshold: 6.5, email: "a@b.co" }));
assert.ok(validateAlert({ direction: "above", threshold: 67, email: "nope" }));

console.log("fear-greed alerts ok");
