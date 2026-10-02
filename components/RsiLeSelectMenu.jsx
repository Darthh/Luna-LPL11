"use client";

import { useEffect, useRef, useState } from "react";

export default function RsiLeSelectMenu({ label, value, options, onChange, className = "" }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (event) => {
      if (event.type === "keydown" && event.key !== "Escape") return;
      if (event.type === "mousedown" && wrapRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div className={`rle-select${className ? ` ${className}` : ""}`} ref={wrapRef}>
      <button type="button" className={`rle-select-button${open ? " active" : ""}`} onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-haspopup="menu">
        <span>{label}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9.5 12 15.5 18 9.5" /></svg>
      </button>
      {open && <div className="rle-select-menu" role="menu">
        {options.map((option) => (
          <button key={option.key} type="button" className={value === option.key ? "active" : ""} onClick={() => { onChange(option.key); setOpen(false); }} role="menuitemradio" aria-checked={value === option.key}>
            <span><b>{option.label}</b>{option.detail && <small>{option.detail}</small>}</span>
            {value === option.key && <i aria-hidden="true">✓</i>}
          </button>
        ))}
      </div>}
    </div>
  );
}
