"use client";

import { useEffect, useRef, useState } from "react";
import { RLE_MA_LINES } from "@/components/RsiLeTechnicals";

// "Technicals" dropdown for the stock chart, sitting alongside Compare. Built
// as toggles rather than a multi-select because each one is independently on
// or off and the colour swatch has to say which line on the chart it controls.
//
// The set, the keys, the colours and the dashed-EMA convention are RsiLE's, so
// the same average is the same colour on both charts and a reader moving
// between them is not relearning the legend. Re-exported from there rather
// than restated here - two lists would drift.
export { RLE_MA_LINES as MA_LINES } from "@/components/RsiLeTechnicals";

export const RSI_COLOR = "#7e57c2";

// The EMA swatch is dashed, the SMA solid - the same distinction the lines
// themselves carry on the chart.
function MaRow({ ma, checked, onToggle }) {
  return (
    <label className="stock-tech-row">
      <i
        className={`stock-tech-swatch${ma.dashed ? " dashed" : ""}`}
        style={{ "--technical-color": ma.color, background: ma.dashed ? undefined : ma.color }}
      />
      <span>{ma.label}</span>
      <span className="switch">
        <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`${ma.label} overlay`} />
        <span className="track" />
      </span>
    </label>
  );
}

export default function TechnicalsControl({ value, onChange, disabled, disabledReason }) {
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

  const activeCount = Object.values(value).filter(Boolean).length;

  function toggle(key) {
    onChange({ ...value, [key]: !value[key] });
  }

  return (
    <div className="stock-cmp-control" ref={wrapRef}>
      <button
        type="button"
        className={`stock-cmp-btn${open ? " open" : ""}${activeCount ? " filled" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        Technicals
        {activeCount > 0 && <span className="stock-cmp-count">{activeCount}</span>}
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
              <div className="stock-tech-group">Simple moving averages</div>
              {RLE_MA_LINES.filter((ma) => ma.kind === "sma").map((ma) => (
                <MaRow key={ma.key} ma={ma} checked={!!value[ma.key]} onToggle={() => toggle(ma.key)} />
              ))}
              <div className="stock-tech-group">Exponential moving averages</div>
              {RLE_MA_LINES.filter((ma) => ma.kind === "ema").map((ma) => (
                <MaRow key={ma.key} ma={ma} checked={!!value[ma.key]} onToggle={() => toggle(ma.key)} />
              ))}

              <div className="stock-tech-group">Oscillators</div>
              <label className="stock-tech-row">
                <i className="stock-tech-swatch" style={{ background: RSI_COLOR }} />
                <span>RSI 14 + SMA 14</span>
                <span className="switch">
                  <input
                    type="checkbox"
                    checked={!!value.rsi}
                    onChange={() => toggle("rsi")}
                    aria-label="RSI panel"
                  />
                  <span className="track" />
                </span>
              </label>
            </>
          )}
        </div>
      )}
    </div>
  );
}
