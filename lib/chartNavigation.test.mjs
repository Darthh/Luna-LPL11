import { test } from "node:test";
import assert from "node:assert/strict";
import { priceTickStep, zoomViewport, wheelPixels, priceBounds } from "./chartNavigation.mjs";

test("price ticks support ten cents and cents without duplicate labels", () => {
  assert.equal(priceTickStep(1.5, 600), .1);
  assert.equal(priceTickStep(.15, 600), .01);
  assert.equal(priceTickStep(.001, 600), .01);
  assert.equal(priceTickStep(.35, 600), .05);
});
test("price pan is continuous rather than snapping to ticks", () => {
  const a = priceBounds(755.8, 757.2, 1, 0);
  const b = priceBounds(755.8, 757.2, 1, .013);
  assert.ok(Math.abs(b.min - a.min - .013) < 1e-9);
  assert.ok(Math.abs(b.max - a.max - .013) < 1e-9);
  const zoomed = priceBounds(755.8, 757.2, .1, 0);
  assert.ok(Math.abs((zoomed.max - zoomed.min) / (a.max - a.min) - .1) < 1e-9);
});
test("zoom preserves right edge or selected cursor anchor and reverses cleanly", () => {
  const view = { start: 500.25, count: 200, total: 1000 };
  for (const anchor of [1, .37]) {
    const next = zoomViewport(view, -80, anchor);
    assert.ok(next.count < view.count);
    assert.ok(Math.abs(next.start + anchor * (next.count - 1) - (view.start + anchor * (view.count - 1))) < 1e-9);
    const restored = zoomViewport(next, 80, anchor);
    assert.ok(Math.abs(restored.start - view.start) < 1e-9);
    assert.ok(Math.abs(restored.count - view.count) < 1e-9);
  }
});
test("wheel deltas account for browser pixel, line and page units", () => {
  assert.equal(wheelPixels(3, 1, 800), 48);
  assert.equal(wheelPixels(48, 0, 800), 48);
  assert.equal(wheelPixels(1, 2, 800), 800);
});
