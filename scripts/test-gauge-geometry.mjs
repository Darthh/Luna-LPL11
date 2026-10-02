// The needle must point into the band its reading falls in - on the card and
// on the page, which share this geometry.
import assert from "node:assert/strict";
import { angleForValue, pointForAngle, GAUGE } from "../lib/gaugeGeometry.js";

// 0 at the left, 50 straight up, 100 at the right.
assert.equal(angleForValue(0), -90);
assert.equal(angleForValue(50), 0);
assert.equal(angleForValue(100), 90);

// 44 is Fear (25-45), so it must sit left of vertical but right of 25.
const a44 = angleForValue(44);
assert.ok(a44 < 0, `44 should be left of centre, got ${a44}`);
assert.ok(a44 > angleForValue(25), "44 must be right of the Fear band start");
console.log("angle for 44:", a44.toFixed(1), "deg (band 25-45 spans", angleForValue(25).toFixed(1), "to", angleForValue(45).toFixed(1) + ")");

// The tip lands above the hub and left of it for a Fear reading.
const tip = pointForAngle(a44, GAUGE.radius);
assert.ok(tip.y < GAUGE.cy, "needle tip must be above the hub");
assert.ok(tip.x < GAUGE.cx, "a Fear reading points left of vertical");

console.log("gauge geometry ok");
