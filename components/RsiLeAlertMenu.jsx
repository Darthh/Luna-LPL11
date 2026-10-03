"use client";

import { useEffect, useRef, useState } from "react";
import {
  RSI_LE_MAX_RULES,
  describeRsiLeRule,
  readRsiLeRules,
  writeRsiLeRules,
} from "@/lib/rsiLeNotifications";

const KINDS = [
  { key: "signal", label: "+/−2 signal triggered" },
  { key: "percent", label: "Price moves by %" },
  { key: "price", label: "Price reaches $" },
];

function BellIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>;
}

export default function RsiLeAlertMenu({ enabled, onToggle }) {
  const [open, setOpen] = useState(false);
  const [rules, setRules] = useState([]);
  const [kind, setKind] = useState("signal");
  const [direction, setDirection] = useState("above");
  const [value, setValue] = useState("");
  const rootRef = useRef(null);

  // Rules live in browser storage, readable only after hydration.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setRules(readRsiLeRules()), [open]);

  // Click-away and Escape, so the menu behaves like the other toolbar popovers.
  useEffect(() => {
    if (!open) return;
    const onDown = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    const onKey = (event) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const full = rules.length >= RSI_LE_MAX_RULES;

  const persist = (next) => {
    setRules(next);
    writeRsiLeRules(next);
  };

  const addRule = () => {
    if (full) return;
    const numeric = Number(value);
    if (kind !== "signal" && (!Number.isFinite(numeric) || numeric <= 0)) return;
    // One +/−2 rule is all that can ever fire, so a second is silently the same
    // alert twice.
    if (kind === "signal" && rules.some((rule) => rule.kind === "signal")) return;
    persist([...rules, {
      id: `${kind}-${Date.now()}`,
      kind,
      direction,
      value: kind === "signal" ? null : numeric,
    }]);
    setValue("");
    // Adding the first alert is the moment the feature is wanted, so the master
    // switch follows rather than making the user find it separately.
    if (!enabled) onToggle();
  };

  return (
    <div className="rle-alertmenu" ref={rootRef}>
      <button
        type="button"
        className={`rle-notify-button${enabled && rules.length ? " active" : ""}`}
        onClick={() => setOpen((isOpen) => !isOpen)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <BellIcon />
        <span>{enabled && rules.length ? `Alerts · ${rules.length}` : "Turn on Notifications"}</span>
      </button>

      {open && (
        <div className="rle-alertmenu-panel" role="dialog" aria-label="Notification alerts">
          <header>
            <strong>Alerts</strong>
            <label className="rle-alertmenu-master">
              <input type="checkbox" checked={enabled} onChange={onToggle} />
              <span>{enabled ? "On" : "Off"}</span>
            </label>
          </header>

          <ul className="rle-alertmenu-list">
            {rules.length === 0 && <li className="rle-alertmenu-empty">No alerts yet.</li>}
            {rules.map((rule) => (
              <li key={rule.id}>
                <span>{describeRsiLeRule(rule)}</span>
                <button
                  type="button"
                  onClick={() => persist(rules.filter((item) => item.id !== rule.id))}
                  aria-label={`Remove alert: ${describeRsiLeRule(rule)}`}
                >×</button>
              </li>
            ))}
          </ul>

          <div className="rle-alertmenu-add">
            <select value={kind} onChange={(event) => setKind(event.target.value)} aria-label="Alert type">
              {KINDS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
            {kind !== "signal" && (
              <div className="rle-alertmenu-args">
                <select value={direction} onChange={(event) => setDirection(event.target.value)} aria-label="Direction">
                  <option value="above">Above</option>
                  <option value="below">Below</option>
                </select>
                <input
                  type="number"
                  min="0"
                  step={kind === "percent" ? "0.1" : "0.01"}
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder={kind === "percent" ? "2" : "650"}
                  aria-label={kind === "percent" ? "Percent" : "Price"}
                />
              </div>
            )}
            <button type="button" onClick={addRule} disabled={full}>Add alert</button>
          </div>

          <footer>{rules.length}/{RSI_LE_MAX_RULES} alerts{full ? " · limit reached" : ""}</footer>
        </div>
      )}
    </div>
  );
}
