// Self-check for the drag-to-resize column maths:
// `node scripts/test-panel-drag.mjs`.
//
// lib/usePanelDrag.js turns a pointer's horizontal travel into a number of grid
// columns. The hook itself needs React and a DOM, but the arithmetic that
// decides what a drag means does not - and that arithmetic is the part that can
// be quietly wrong, because a panel resized to the wrong width still looks like
// a panel. So it is duplicated here in the same form and pinned.
import assert from "node:assert/strict";

const MIN_SPAN = 3;
const MAX_SPAN = 12;
const MIN_ROWS = 1;
const MAX_ROWS = 4;
const ROW_HEIGHT = 220;

// One column's width including the gap that follows it, measured from the grid
// the way the hook measures it.
const columnWidth = (gridWidth, gap) =>
  (gridWidth - gap * (MAX_SPAN - 1)) / MAX_SPAN + gap;

// What the hook computes on every pointermove.
const spanFor = (startSpan, dx, colWidth) =>
  Math.min(MAX_SPAN, Math.max(MIN_SPAN, startSpan + Math.round(dx / colWidth)));

// A 1200px grid with an 8px gap: eleven gaps of 8 leave 1112 for twelve
// columns, so a column is 92.67 + 8 = 100.67 wide.
const col = columnWidth(1200, 8);
assert.ok(Math.abs(col - 100.67) < 0.01, `column width was ${col}`);

// No movement is no change - the panel must not twitch a column because the
// pointer wobbled a few pixels on mousedown.
assert.equal(spanFor(6, 0, col), 6);
assert.equal(spanFor(6, 10, col), 6);
assert.equal(spanFor(6, -10, col), 6);

// Half a column rounds to the nearer one, in both directions.
assert.equal(spanFor(6, col * 0.6, col), 7);
assert.equal(spanFor(6, -col * 0.6, col), 5);

// Whole columns land exactly, which is the case a reader actually aims for.
assert.equal(spanFor(6, col * 3, col), 9);
assert.equal(spanFor(6, -col * 3, col), 3);

// Both ends clamp rather than running off the grid: a panel can never be
// narrower than a quarter or wider than the row.
assert.equal(spanFor(6, col * 100, col), MAX_SPAN);
assert.equal(spanFor(6, -col * 100, col), MIN_SPAN);
assert.equal(spanFor(MAX_SPAN, col, col), MAX_SPAN);
assert.equal(spanFor(MIN_SPAN, -col, col), MIN_SPAN);

// A zero-gap grid is still divided correctly - the gap term must not be
// assumed non-zero.
const noGap = columnWidth(1200, 0);
assert.equal(noGap, 100);
assert.equal(spanFor(4, 200, noGap), 6);

// A narrow grid has narrow columns, so the same travel means more columns.
const narrow = columnWidth(600, 8);
assert.ok(narrow < col, "a narrower grid must have narrower columns");
assert.equal(spanFor(6, narrow * 2, narrow), 8);

// ── The vertical axis ─────────────────────────────────────────────────────
// Rows are a fixed height rather than measured from the grid, so the row step
// is that height plus the gap between rows.
const rowStep = ROW_HEIGHT + 8;
const rowsFor = (startRows, dy) =>
  Math.min(MAX_ROWS, Math.max(MIN_ROWS, startRows + Math.round(dy / rowStep)));

// A wobble is not a resize, in either axis.
assert.equal(rowsFor(2, 0), 2);
assert.equal(rowsFor(2, 20), 2);

// Half a row rounds to the nearer one.
assert.equal(rowsFor(2, rowStep * 0.6), 3);
assert.equal(rowsFor(2, -rowStep * 0.6), 1);

// Both ends clamp: a panel is never shorter than one row or taller than four.
assert.equal(rowsFor(2, rowStep * 100), MAX_ROWS);
assert.equal(rowsFor(2, -rowStep * 100), MIN_ROWS);
assert.equal(rowsFor(MAX_ROWS, rowStep), MAX_ROWS);
assert.equal(rowsFor(MIN_ROWS, -rowStep), MIN_ROWS);

// The corner moves both at once, and each axis is independent - a drag that is
// mostly sideways must not also change the height by the same number of steps.
const corner = (startSpan, startRows, dx, dy) => ({
  span: spanFor(startSpan, dx, col),
  rows: rowsFor(startRows, dy),
});
assert.deepEqual(corner(6, 2, col * 2, rowStep), { span: 8, rows: 3 });
assert.deepEqual(corner(6, 2, col * 2, 0), { span: 8, rows: 2 });
assert.deepEqual(corner(6, 2, 0, rowStep), { span: 6, rows: 3 });

// Dragging one edge leaves the other axis alone - this is what separates the
// edge handles from the corner.
assert.equal(spanFor(6, 0, col), 6, "a vertical drag must not change the width");
assert.equal(rowsFor(2, 0), 2, "a horizontal drag must not change the height");

console.log("panel-drag ok");
