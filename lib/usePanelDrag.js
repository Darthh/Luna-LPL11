"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Drag-to-resize for a dashboard panel, from any edge or corner.
//
// The panel is a grid item, so its committed size is a whole number of columns
// and rows rather than a pixel value. Mid-drag it is not: the preview is a
// fractional span written straight into the grid, so the edge tracks the
// pointer pixel for pixel instead of jumping a column at a time. The rounded
// value is only taken on pointerup, which is the one moment the grid has to
// land on a whole step.
//
// Pointer events rather than mouse events, so a trackpad, a pen and a touch
// screen all work from the same code path, and setPointerCapture keeps the drag
// alive when the cursor outruns the handle - which it does constantly, because
// the handles are a few pixels wide and people drag fast.

const MIN_SPAN = 3;
const MAX_SPAN = 12;
const MIN_ROWS = 1;

// One grid row's height. Rows are sized in CSS from this same value, so a
// panel two rows tall is exactly twice one row plus the gap between them.
export const ROW_HEIGHT = 220;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// Which way each handle pushes. -1 means the grabbed edge is the left/top one,
// so moving the pointer left or up grows the panel.
const AXES = {
  e: [1, 0],
  w: [-1, 0],
  s: [0, 1],
  n: [0, -1],
  se: [1, 1],
  sw: [-1, 1],
  ne: [1, -1],
  nw: [-1, -1],
};

const CURSORS = {
  e: "col-resize",
  w: "col-resize",
  s: "row-resize",
  n: "row-resize",
  se: "nwse-resize",
  nw: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
};

export function usePanelDrag({ span, rows, onCommit, disabled = false }) {
  const [preview, setPreview] = useState(null);
  const state = useRef(null);

  const start = useCallback(
    (axis) => (event) => {
      if (disabled || event.button !== 0) return;
      const panel = event.currentTarget.closest(".dpanel");
      const grid = panel?.parentElement;
      if (!panel || !grid) return;

      // A column's width is measured from the grid rather than assumed: the
      // grid is twelve columns sharing a gap, and the browser has already done
      // that arithmetic correctly.
      const styles = getComputedStyle(grid);
      const gap = parseFloat(styles.columnGap) || 0;
      const colWidth = (grid.clientWidth - gap * (MAX_SPAN - 1)) / MAX_SPAN + gap;
      const rowGap = parseFloat(styles.rowGap) || 0;

      state.current = {
        axis,
        startX: event.clientX,
        startY: event.clientY,
        startSpan: span,
        startRows: rows,
        measuredRows: (panel.getBoundingClientRect().height + rowGap) / (ROW_HEIGHT + rowGap),
        colWidth,
        // The bare column, without the gap that only sits between columns -
        // an n-column panel is n columns plus n-1 gaps.
        baseCol: colWidth - gap,
        rowHeight: ROW_HEIGHT + rowGap,
      };
      setPreview({ span, rows, geometry: state.current });
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
    },
    [disabled, span, rows]
  );

  const onPointerMove = useCallback((event) => {
    const s = state.current;
    if (!s) return;
    const [sx, sy] = AXES[s.axis];
    setPreview({
      geometry: s,
      span: sx
        ? clamp(s.startSpan + (sx * (event.clientX - s.startX)) / s.colWidth, MIN_SPAN, MAX_SPAN)
        : s.startSpan,
      rows: sy
        ? Math.max(MIN_ROWS, s.measuredRows + (sy * (event.clientY - s.startY)) / s.rowHeight)
        : s.startRows,
    });
  }, []);

  const end = useCallback(
    (event) => {
      const s = state.current;
      if (!s) return;
      state.current = null;
      // Read the final size off state rather than recomputing it: a pointerup
      // that lands on a different element than the last move would otherwise
      // commit a stale value. The fractional preview rounds here, and only
      // here.
      setPreview((current) => {
        if (!current) return null;
        const next = { span: Math.round(current.span), rows: Math.round(current.rows) };
        if (next.span !== s.startSpan || next.rows !== s.startRows) onCommit(next);
        return null;
      });
      if (event?.pointerId != null && event.currentTarget?.releasePointerCapture) {
        try {
          event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
          // The capture is already gone if the pointer left the document.
        }
      }
    },
    [onCommit]
  );

  // A drag in progress paints the whole document with the matching resize
  // cursor and stops text selecting, so the page does not highlight while you
  // drag across it.
  useEffect(() => {
    if (!preview) return;
    const style = document.body.style;
    const prevCursor = style.cursor;
    const prevSelect = style.userSelect;
    style.cursor = CURSORS[state.current?.axis] || "default";
    style.userSelect = "none";
    return () => {
      style.cursor = prevCursor;
      style.userSelect = prevSelect;
    };
  }, [preview]);

  const handlers = (axis) => ({
    onPointerDown: start(axis),
    onPointerMove,
    onPointerUp: end,
    onPointerCancel: end,
  });

  const s = preview?.geometry;
  return {
    // The grid still needs whole steps - `span` takes integers - so the grid
    // gets the rounded preview, and the fractional remainder is handed over as
    // a pixel size the panel wears only while the pointer is down.
    span: Math.round(preview?.span ?? span),
    rows: Math.round(preview?.rows ?? rows),
    size:
      preview && s
        ? {
            width: `${preview.span * s.colWidth - (s.colWidth - s.baseCol)}px`,
            height: `${preview.rows * s.rowHeight - (s.rowHeight - ROW_HEIGHT)}px`,
          }
        : null,
    dragging: preview !== null,
    handleProps: handlers,
  };
}
