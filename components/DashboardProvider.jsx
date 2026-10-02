"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_LAYOUT, MAX_WIDGETS, readLayout, WIDGETS, writeLayout } from "@/lib/dashboardWidgets";

// The dashboard arrangement, shared between the page that renders it and the
// navigation rail that toggles panels on and off. It lived in Home until the
// rail needed to change it too - two copies of this state would mean a rail
// that highlights what the dashboard is not showing.
//
// Mounted around the whole app rather than around the home page, because the
// rail is part of the shell and is on screen on every route.
const DashboardContext = createContext(null);

export const useDashboard = () => useContext(DashboardContext);

export default function DashboardProvider({ children }) {
  // The server renders the default so the first paint matches; the saved
  // arrangement is read after hydration, which is the only time localStorage
  // exists.
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLayout(readLayout());
  }, []);

  const update = useCallback((next) => {
    setLayout(next);
    writeLayout(next);
  }, []);

  const value = useMemo(() => {
    const has = (id) => layout.some((w) => w.id === id);

    return {
      layout,
      has,
      full: layout.length >= MAX_WIDGETS,

      add(id) {
        if (!WIDGETS[id] || has(id) || layout.length >= MAX_WIDGETS) return false;
        update([...layout, { id, span: WIDGETS[id].span, rows: WIDGETS[id].rows ?? 1 }]);
        return true;
      },

      remove(id) {
        update(layout.filter((w) => w.id !== id));
      },

      // What the rail calls: on if it is off, off if it is on. Returns false
      // when the dashboard is full and the widget is not already on it, so the
      // caller can say why nothing happened.
      toggle(id) {
        if (!WIDGETS[id]) return false;
        if (has(id)) {
          update(layout.filter((w) => w.id !== id));
          return true;
        }
        if (layout.length >= MAX_WIDGETS) return false;
        update([...layout, { id, span: WIDGETS[id].span, rows: WIDGETS[id].rows ?? 1 }]);
        return true;
      },

      resize(id, { span, rows }) {
        update(
          layout.map((w) =>
            w.id === id
              ? {
                  ...w,
                  // Clamped to the grid: a quarter-width is the narrowest that
                  // still fits a table's columns, twelve is the whole row, and
                  // a panel can grow vertically without an upper row limit.
                  span: span === undefined ? w.span : Math.min(12, Math.max(3, span)),
                  rows: Number.isFinite(rows) ? Math.max(1, Math.round(rows)) : w.rows,
                }
              : w
          )
        );
      },
    };
  }, [layout, update]);

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}
