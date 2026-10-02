"use client";

import { useCallback, useEffect, useState } from "react";
import { usePanelDrag } from "@/lib/usePanelDrag";

// The repeating unit of the terminal: a bordered panel with a title bar and a
// body. Koyfin's whole dashboard is this one shape tiled - which is what makes
// it read as a workspace rather than a page, because every panel announces its
// own edges and can be expanded to fill the screen without the layout around it
// changing.
//
// Deliberately not a card: no shadow, no radius to speak of, no floating. A
// terminal packs panels edge to edge; the hairline border is the whole
// separation between one and the next.
//
// Colours all come from the theme's custom properties, so a panel wears
// whichever of the fourteen palettes the reader picked.

// Expanding is per-panel and remembered, so a reader who works mostly in one
// panel keeps it that way across navigations.
const KEY = (id) => `panel:${id}`;

const stroke = {
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export default function DataPanel({
  id,
  title,
  // Right-hand side of the title bar: range buttons, a ticker input, whatever
  // the panel's own controls are.
  actions = null,
  // Panels holding a chart or a long table scroll inside themselves rather
  // than stretching the grid row - `span` is how many grid columns to take.
  span = 1,
  // How many grid rows tall. Dragging the bottom edge changes it.
  rows = 1,
  // Suppresses the expand control for panels where filling the screen makes no
  // sense (a single number, a short list).
  expandable = true,
  // Removes the body padding, for a table that should meet the panel's edges.
  flush = false,
  // Dashboard panels can be resized and closed. Both are absent elsewhere, so
  // a panel that is simply part of a page shows neither control.
  onResize = null,
  onClose = null,
  children,
}) {
  const [expanded, setExpanded] = useState(false);

  // Dragging previews a width while the pointer is down and commits it on
  // release. An expanded panel already fills the row, so there is nothing to
  // drag it to.
  const drag = usePanelDrag({
    span,
    rows,
    onCommit: (next) => onResize?.(next),
    disabled: !onResize || expanded,
  });

  useEffect(() => {
    if (!id) return;
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExpanded(localStorage.getItem(KEY(id)) === "1");
    } catch {}
  }, [id]);

  const toggle = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      try {
        if (id) localStorage.setItem(KEY(id), next ? "1" : "0");
      } catch {}
      return next;
    });
  }, [id]);

  return (
    <section
      className="dpanel"
      data-expanded={expanded ? "true" : "false"}
      data-dragging={drag.dragging ? "true" : "false"}
      style={{
        "--panel-span": drag.span,
        "--panel-rows": drag.rows,
        // Mid-drag the panel is sized in pixels so it follows the pointer
        // between whole columns; the grid span takes over again on release.
        ...(drag.size || {}),
      }}
    >
      <header className="dpanel-head">
        <h2>{title}</h2>
        {actions && <div className="dpanel-actions">{actions}</div>}
        {/* The keyboard path to the same thing the right edge drags: a quarter
            of the grid per press. The drag is a pointer shortcut, so these
            cannot be dropped in favour of it. */}
        {onResize && (
          <span className="dpanel-resize">
            <button
              type="button"
              onClick={() => onResize({ span: span - 3, rows })}
              disabled={span <= 3}
              aria-label="Make panel narrower"
              title="Narrower"
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden="true">
                <path d="M14 8l-4 4 4 4M4 5v14" {...stroke} />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => onResize({ span: span + 3, rows })}
              disabled={span >= 12}
              aria-label="Make panel wider"
              title="Wider"
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden="true">
                <path d="M10 8l4 4-4 4M20 5v14" {...stroke} />
              </svg>
            </button>
          </span>
        )}
        {expandable && (
          <button
            type="button"
            className="dpanel-expand"
            onClick={toggle}
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse panel" : "Expand panel"}
            title={expanded ? "Collapse" : "Expand"}
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden="true">
              {/* Two corners rather than a full box: the arrow-out glyph reads
                  as "make this bigger" at 13px, where a box does not. */}
              <path
                d={expanded ? "M9 4v5H4M15 20v-5h5" : "M14 4h6v6M10 20H4v-6"}
                {...stroke}
              />
            </svg>
          </button>
        )}
        {onClose && (
          <button
            type="button"
            className="dpanel-close"
            onClick={onClose}
            aria-label={`Remove ${typeof title === "string" ? title : "panel"} from dashboard`}
            title="Remove from dashboard"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" {...stroke} />
            </svg>
          </button>
        )}
      </header>
      <div className={flush ? "dpanel-body flush" : "dpanel-body"}>{children}</div>
      {/* The drag handles: all four edges and all four corners. The corners
          sit above the edges so a drag started in one is never claimed by an
          edge.
          Hidden from assistive tech because the buttons in the title bar do the
          same job in a way a keyboard can reach - these are the pointer
          shortcut, not the only way. */}
      {onResize && !expanded && (
        <>
          {["n", "s", "e", "w", "ne", "nw", "se", "sw"].map((axis) => (
            <span
              key={axis}
              className={`dpanel-grip ${axis}`}
              aria-hidden="true"
              {...drag.handleProps(axis)}
            />
          ))}
        </>
      )}
    </section>
  );
}
