import assert from "node:assert/strict";
import { test } from "node:test";
import { drawGexOverlay, gexOverlayRuns } from "./gexOverlay.mjs";

const points = [0, 60, 120, 180].map((t) => ({ t }));
test("four adjacent samples share one run per rank", () => {
  const runs = gexOverlayRuns(points, [{ t: 0, strike: 600, secondStrike: 599 }], 60);
  assert.equal(runs.length, 2);
  assert.deepEqual(runs.map((run) => run.samples.length), [4, 4]);
});
test("strike changes and missing ranks start new runs", () => {
  const runs = gexOverlayRuns(points, [
    { t: 0, strike: 600, secondStrike: 599 },
    { t: 60, strike: 601, secondStrike: null },
    { t: 120, strike: 600, secondStrike: 599 },
  ], 60);
  assert.equal(runs.filter((run) => run.rank === 0).length, 3);
  assert.equal(runs.filter((run) => run.rank === 1).length, 2);
});
test("bands do not bridge stale data or overnight gaps", () => {
  const runs = gexOverlayRuns([{ t: 0 }, { t: 60 }, { t: 86400 }], [
    { t: 0, strike: 600 }, { t: 86400, strike: 600 },
  ], 60);
  assert.deepEqual(runs.map((run) => run.samples.length), [2, 1]);
  assert.equal(gexOverlayRuns([{ t: 600 }], [{ t: 0, strike: 600 }], 60).length, 0);
});
test("a viewport can start inside a known run without inventing earlier data", () => {
  assert.equal(gexOverlayRuns([{ t: 120 }], [{ t: 60, strike: 600 }], 60).length, 1);
  assert.equal(gexOverlayRuns([{ t: 0 }], [{ t: 120, strike: 600 }], 60).length, 0);
});

test("GEX overlays render without words or numbers above the levels", () => {
  for (const style of ["bubbles", "bands"]) {
    const labels = [];
    let circles = 0;
    const ctx = new Proxy({
      fillText: (text) => labels.push(text),
      arc: () => circles++,
      measureText: () => ({ width: 90 }),
      createLinearGradient: () => ({ addColorStop() {} }),
    }, { get: (target, key) => target[key] ?? (() => {}) });
    const runs = gexOverlayRuns(points, [{ t: 0, strike: 600, secondStrike: 599 }], 60);
    drawGexOverlay(ctx, runs, { style, xAt: (i) => 10 + i * 10, priceY: (p) => (602 - p) * 40, left: 0, right: 400, candleWidth: 5, slot: 10 });
    assert.deepEqual(labels, []);
    assert.equal(circles, style === "bubbles" ? 8 : 0);
  }
});
