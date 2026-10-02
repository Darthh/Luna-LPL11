// Self-check for the fund's total-value-by-quarter chart:
//   node scripts/test-fund-value-chart.mjs
//
// The chart itself is Chart.js, which is not what is worth pinning. What is:
// the two plugins behind the hover rule and the drag measurement, because the
// chart opts into them by config and a silent typo in that config is a chart
// that simply stops responding without erroring.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const root = new URL("../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith("@/")) return nextResolve(specifier, context);
    const path = specifier.slice(2);
    return { url: new URL(/\.[a-z]+$/.test(path) ? path : `${path}.js`, root).href, shortCircuit: true };
  },
});

const { dragMeasurePlugin } = await import("../lib/dragMeasure.js");
const { hoverLinePlugin } = await import("../lib/hoverLine.js");

// --- The plugins the chart opts into ----------------------------------------

// Both are addressed by id from an options.plugins key, so the ids are part of
// the contract rather than a label.
assert.equal(hoverLinePlugin.id, "hoverLine");
assert.equal(dragMeasurePlugin.id, "dragMeasure");

// dragMeasure has to widen options.events itself: Chart.js only delivers the
// event types listed there, and the defaults stop short of the mouseup/down a
// drag is made of. Without this the chart looks fine and measures nothing.
const chart = { options: {}, data: { labels: [], datasets: [] } };
dragMeasurePlugin.beforeInit(chart);
for (const type of ["mousedown", "mouseup", "mousemove"]) {
  assert.ok(chart.options.events.includes(type), `dragMeasure needs ${type}`);
}

// React hands Chart.js a fresh options object on every render, which drops
// those extra events again - so the plugin re-adds them on update too.
const rerendered = { options: { events: ["mousemove"] }, data: chart.data };
dragMeasurePlugin.beforeUpdate(rerendered);
assert.ok(rerendered.options.events.includes("mousedown"), "events survive a re-render");

// --- The hover rule ---------------------------------------------------------

// It draws only when switched on, and only when the tooltip has a point to
// point at - an always-on rule would sit over an unhovered chart.
const drawn = [];
const ctx = {
  save: () => drawn.push("save"),
  restore: () => {},
  beginPath: () => {},
  setLineDash: () => {},
  moveTo: () => {},
  lineTo: () => {},
  stroke: () => drawn.push("stroke"),
};
const hovered = {
  chartArea: { top: 0, bottom: 100 },
  ctx,
  tooltip: { getActiveElements: () => [{ element: { x: 42 } }] },
};

hoverLinePlugin.afterDatasetsDraw(hovered, {}, { enabled: false });
assert.deepEqual(drawn, [], "off means off");

hoverLinePlugin.afterDatasetsDraw(hovered, {}, { enabled: true });
assert.ok(drawn.includes("stroke"), "draws under the cursor when enabled");

drawn.length = 0;
hoverLinePlugin.afterDatasetsDraw(
  { ...hovered, tooltip: { getActiveElements: () => [] } },
  {},
  { enabled: true }
);
assert.deepEqual(drawn, [], "nothing hovered, nothing drawn");

// A chart with no tooltip at all must not throw - the plugin is registered
// globally, so it runs against every chart on the page, not only this one.
drawn.length = 0;
hoverLinePlugin.afterDatasetsDraw({ ...hovered, tooltip: undefined }, {}, { enabled: true });
assert.deepEqual(drawn, []);

console.log("fund value chart: ok");
