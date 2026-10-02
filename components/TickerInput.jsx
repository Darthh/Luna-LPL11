"use client";

import { useEffect, useRef, useState } from "react";
import { blankBrokenLogo, logoUrl } from "@/lib/companyLogo";

// Ticker box with Yahoo's autocomplete under it - type "nv" and the biggest
// match is the first row. Same endpoint the header search uses.
// `withPrices` asks for a live quote beside each suggestion. Off by default:
// most callers are picking a ticker to chart, where a price is noise, and it
// costs a second request per keystroke-batch. The portfolio editor turns it on
// because there the price is the thing being decided against.
export default function TickerInput({
  value,
  index,
  onChange,
  onPick,
  label,
  placeholder = "Ticker",
  withPrices = false,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [prices, setPrices] = useState({});
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const ref = useRef(null);

  useEffect(() => {
    const q = value.trim();
    // A box that isn't being typed in has nothing to ask about. Whatever was
    // suggested last is simply not rendered (see below) rather than cleared
    // here, which would be a second render for nothing.
    if (!q || !open) return;
    let live = true;
    const timer = setTimeout(() => {
      fetch(`/api/stock-search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((j) => {
          if (!live) return;
          const results = j.results ?? [];
          setSuggestions(results);
          setActive(-1);
          // Quotes for what is on screen, in one request. The search response
          // is cached for an hour, which a price must not be, so the two are
          // deliberately separate calls.
          if (withPrices && results.length) {
            const symbols = results.map((r) => r.symbol).join(",");
            fetch(`/api/watchlist-quotes?symbols=${encodeURIComponent(symbols)}`)
              .then((r) => r.json())
              .then((q) => {
                if (!live) return;
                setPrices(
                  Object.fromEntries(
                    (q.quotes ?? []).map((row) => [row.symbol, row])
                  )
                );
              })
              .catch(() => {});
          }
        })
        .catch(() => live && setSuggestions([]));
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [value, open, withPrices]);

  useEffect(() => {
    if (!open) return;
    function onClickAway(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, [open]);

  function pick(symbol) {
    // A box that does something with the pick (the compare field adds a line)
    // says so; the holdings rows just take the ticker.
    if (onPick) onPick(symbol);
    else onChange(symbol);
    setOpen(false);
    setSuggestions([]);
  }

  function onKeyDown(e) {
    if (!suggestions.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      // Enter on a highlighted row picks it rather than submitting the form.
      e.preventDefault();
      pick(suggestions[active].symbol);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="whatif-ticker-wrap" ref={ref}>
      {/* The logo of whatever is currently typed, inside the box. Not every
          ticker has one on the CDN, so a miss is blanked, not left broken. */}
      {value.trim() && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="whatif-row-logo"
          src={logoUrl(value.trim().toUpperCase(), 48)}
          alt=""
          onError={blankBrokenLogo}
        />
      )}
      <input
        className={value.trim() ? "whatif-ticker has-logo" : "whatif-ticker"}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value.toUpperCase());
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        spellCheck="false"
        autoComplete="off"
        aria-label={label ?? `Ticker ${index + 1}`}
      />
      {open && value.trim() && suggestions.length > 0 && (
        <ul className="whatif-suggest">
          {suggestions.map((s, i) => (
            <li key={s.symbol}>
              <button
                type="button"
                className={i === active ? "active" : undefined}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s.symbol)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="whatif-suggest-logo"
                  src={logoUrl(s.symbol, 48)}
                  alt=""
                  onError={blankBrokenLogo}
                />
                <span className="whatif-suggest-text">
                  <b>{s.symbol}</b>
                  <span>{s.name}</span>
                </span>
                {withPrices && prices[s.symbol]?.price != null && (
                  <span className="whatif-suggest-price">
                    <b>${prices[s.symbol].price.toFixed(2)}</b>
                    {prices[s.symbol].changePct != null && (
                      <em data-sign={prices[s.symbol].changePct >= 0 ? "up" : "down"}>
                        {prices[s.symbol].changePct >= 0 ? "+" : "−"}
                        {Math.abs(prices[s.symbol].changePct).toFixed(2)}%
                      </em>
                    )}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
