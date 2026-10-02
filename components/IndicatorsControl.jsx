"use client";

import { useEffect, useRef, useState } from "react";
import { CHART_METRICS } from "@/lib/chartMetrics";

// "Indicators" dropdown for the stock chart, sitting alongside Technicals: the
// same eight market sentiment series the home page charts, plotted over whatever
// ticker is on screen. Only one at a time - they each carry their own unit
// (index points, a ratio, a yield spread), so two at once would need two extra
// axes and neither would be readable.
export const INDICATOR_COLOR = "#c084fc";

// The home page computes 70/30 RSI from the loaded ticker's own price rather
// than from an index series, so it is not in the /api/fear-greed payload this
// overlay reads. The stock chart already offers RSI 14 under Technicals, where
// it gets its own panel, so it is left out here instead of listed dead.
export const INDICATOR_METRICS = CHART_METRICS.filter((m) => !m.computeFromPrice);

export default function IndicatorsControl({ value, onChange, disabled, disabledReason }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onClickAway(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function onEscape(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickAway);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const active = INDICATOR_METRICS.find((m) => m.key === value);

  function pick(key) {
    onChange(key === value ? null : key);
    setOpen(false);
  }

  return (
    <div className="stock-cmp-control" ref={wrapRef}>
      <button
        type="button"
        className={`stock-cmp-btn${open ? " open" : ""}${active ? " filled" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        Indicators
        {active && <span className="stock-cmp-count">1</span>}
        <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
          <path d="M6 9.5 12 15.5 18 9.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="stock-cmp-menu stock-tech-menu">
          {disabled ? (
            <div className="stock-cmp-hint">{disabledReason}</div>
          ) : (
            <>
              <div className="stock-tech-group">Market sentiment series</div>
              {INDICATOR_METRICS.map((metric) => (
                <label className="stock-tech-row" key={metric.key}>
                  <i className="stock-tech-swatch" style={{ background: INDICATOR_COLOR }} />
                  <span>{metric.label}</span>
                  <span className="switch">
                    <input
                      type="checkbox"
                      checked={value === metric.key}
                      onChange={() => pick(metric.key)}
                      aria-label={`Plot ${metric.label} against this stock`}
                    />
                    <span className="track" />
                  </span>
                </label>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
