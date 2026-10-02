"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_WIDGETS, WIDGETS } from "@/lib/dashboardWidgets";
import { useLanguage } from "./LanguageProvider";

// The menu that puts a panel back on the dashboard. Everything the navigation
// rail links to that can stand on its own is in here, so closing a panel is
// never one-way.
//
// The limit is enforced and explained in the same place: at MAX_WIDGETS the
// entries that are not already on the dashboard are disabled rather than
// hidden, and the menu says why. Hiding them would leave a reader who closed a
// panel wondering where the rest went.
export default function AddWidget({ layout, onAdd }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const full = layout.length >= MAX_WIDGETS;
  const on = new Set(layout.map((w) => w.id));

  return (
    <div className="dash-add" ref={ref}>
      <button
        type="button"
        className="dash-add-btn"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden="true">
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        {t("Add panel")}
      </button>

      {open && (
        <div className="dash-add-menu" role="menu">
          {full && (
            <p className="dash-add-note">
              {t("Dashboard is full. Close a panel to add another.")}
            </p>
          )}
          {Object.entries(WIDGETS).map(([id, { label }]) => {
            const added = on.has(id);
            return (
              <button
                key={id}
                type="button"
                role="menuitem"
                className="dash-add-item"
                // Already-added entries stay listed and disabled so the menu is
                // a picture of the whole dashboard, not just what is missing.
                disabled={added || full}
                onClick={() => {
                  onAdd(id);
                  setOpen(false);
                }}
              >
                <span>{t(label)}</span>
                {added && <span className="dash-add-on">{t("on dashboard")}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
