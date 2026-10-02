"use client";

import { useEffect, useRef, useState } from "react";

export const RLE_MA_LINES = [
  { key: "sma20", kind: "sma", period: 20, label: "SMA 20", color: "#22d3ee" },
  { key: "sma50", kind: "sma", period: 50, label: "SMA 50", color: "#4d9fff" },
  { key: "sma100", kind: "sma", period: 100, label: "SMA 100", color: "#a97bff" },
  { key: "sma200", kind: "sma", period: 200, label: "SMA 200", color: "#ff9f0a" },
  { key: "ema20", kind: "ema", period: 20, label: "EMA 20", color: "#34d399", dashed: true },
  { key: "ema50", kind: "ema", period: 50, label: "EMA 50", color: "#f472b6", dashed: true },
  { key: "ema100", kind: "ema", period: 100, label: "EMA 100", color: "#facc15", dashed: true },
  { key: "ema200", kind: "ema", period: 200, label: "EMA 200", color: "#fb7185", dashed: true },
];

function TechnicalRow({ line, checked, onToggle }) {
  return (
    <label className="rle-technical-row">
      <i
        className={`rle-technical-swatch${line.dashed ? " dashed" : ""}`}
        style={{ "--technical-color": line.color }}
      />
      <span>{line.label}</span>
      <span className="switch">
        <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`${line.label} overlay`} />
        <span className="track" />
      </span>
    </label>
  );
}

export default function RsiLeTechnicals({ value, onChange, trendlineCount, onUndoTrendline, onClearTrendlines }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const closeOnClickAway = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnClickAway);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnClickAway);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const activeCount = RLE_MA_LINES.filter((line) => value[line.key]).length + (value.rsi ? 1 : 0);
  const toggle = (key) => onChange({ ...value, [key]: !value[key] });

  return (
    <div className="rle-technicals" ref={wrapRef}>
      <button
        type="button"
        className={`rle-technical-button${open ? " active" : ""}`}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span>Technicals</span>
        {activeCount > 0 && <b>{activeCount}</b>}
        <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
          <path d="M6 9.5 12 15.5 18 9.5" />
        </svg>
      </button>

      {open && (
        <div className="rle-technical-menu">
          <div className="rle-technical-group">Simple moving averages</div>
          {RLE_MA_LINES.filter((line) => line.kind === "sma").map((line) => (
            <TechnicalRow key={line.key} line={line} checked={!!value[line.key]} onToggle={() => toggle(line.key)} />
          ))}
          <div className="rle-technical-group">Exponential moving averages</div>
          {RLE_MA_LINES.filter((line) => line.kind === "ema").map((line) => (
            <TechnicalRow key={line.key} line={line} checked={!!value[line.key]} onToggle={() => toggle(line.key)} />
          ))}
          <div className="rle-technical-group">Oscillators</div>
          <label className="rle-technical-row">
            <i className="rle-technical-swatch" style={{ "--technical-color": "#7e57c2" }} />
            <span>RSI 14 + SMA 14</span>
            <span className="switch">
              <input type="checkbox" checked={!!value.rsi} onChange={() => toggle("rsi")} aria-label="RSI pane" />
              <span className="track" />
            </span>
          </label>
          <div className="rle-technical-group">Trendlines · {trendlineCount}</div>
          <div className="rle-drawing-actions">
            <button type="button" onClick={onUndoTrendline} disabled={!trendlineCount}>Undo last</button>
            <button type="button" onClick={onClearTrendlines} disabled={!trendlineCount}>Clear all</button>
          </div>
        </div>
      )}
    </div>
  );
}
