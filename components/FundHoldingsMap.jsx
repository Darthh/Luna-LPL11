"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MAP_PERIODS,
  SCALE_MAX,
  buildMapLayout,
  formatPerf,
  perfColor,
  tileText,
} from "@/lib/mapLayout";
import { LOGO_OVERRIDES, hideBrokenLogo, logoUrl } from "@/lib/companyLogo";
import { money, pct } from "@/lib/hedgeFundFormat";

// A fund's reported book drawn the way the index maps draw theirs: tiles sized
// by position value, grouped into sectors, colored by how the stock has since
// performed. It answers a different question from the donut above it - the
// donut is what the fund owns, this is what has happened to it.
//
// The periods offered are long ones. A 13F is a quarterly snapshot up to 45
// days stale by the time it is public, so a 1-day move against it says nothing
// about the fund; over six months and longer the position is the story.
const PERIODS = MAP_PERIODS.filter((p) => ["6m", "1y", "2y", "3y"].includes(p.key));
const DEFAULT_PERIOD = "1y";

const MAP_H = 480;

export default function FundHoldingsMap({ map }) {
  const [period, setPeriod] = useState(DEFAULT_PERIOD);
  // `null` while the quotes are in flight, `{}` once they failed - which is
  // also what a successful empty answer looks like, and both mean the same
  // thing to the map: draw it grey. One piece of state rather than two, so
  // there is no reset to run on the way into the effect.
  const [quotes, setQuotes] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const [width, setWidth] = useState(0);
  const canvasRef = useRef(null);

  const rows = useMemo(() => map?.rows ?? [], [map]);
  // One request for the whole map, on the symbols it draws. The same endpoint
  // and the same shape the index maps read, so the colors mean the same thing
  // on both - a tile is not green here and green there by coincidence.
  const symbols = useMemo(() => rows.map((r) => r.symbol).join(","), [rows]);

  useEffect(() => {
    if (!symbols) return undefined;
    let live = true;
    fetch(`/api/stock-map?index=watchlist&symbols=${encodeURIComponent(symbols)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (j.error) throw new Error(j.error);
        setQuotes(j.quotes ?? {});
      })
      // The map still draws without quotes - every tile grey, sized and
      // grouped exactly as it would be. Losing the color is worth more than
      // losing the shape.
      .catch(() => live && setQuotes({}));
    return () => {
      live = false;
    };
  }, [symbols]);

  // The canvas is fluid, so the layout is rebuilt at whatever width it has -
  // a treemap laid out for one width and scaled to another has tiles whose
  // aspect ratios are wrong, which is the one thing a treemap must get right.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const layout = useMemo(
    () => (width && rows.length ? buildMapLayout(rows, width, MAP_H, (s) => s.value) : null),
    [rows, width]
  );

  if (!rows.length) return null;

  const scaleMax = SCALE_MAX[period];
  const legendStops = [-1, -2 / 3, -1 / 3, 0, 1 / 3, 2 / 3, 1].map((t) => t * scaleMax);

  return (
    <div className="hf-map">
      <div className="hf-map-controls" role="group" aria-label="Performance period">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={period === p.key}
            onClick={() => setPeriod(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div
        className="maps-canvas hf-map-canvas"
        ref={canvasRef}
        style={{ height: MAP_H }}
        onMouseLeave={() => setTooltip(null)}
      >
        {layout?.tiles.map(({ stock, x, y, w, h }) => {
          const perf = quotes?.[stock.symbol]?.perf?.[period];
          const perfText = formatPerf(perf);
          const { fontSize, showSymbol, perfFont, showPerf } = tileText(
            stock.symbol,
            w,
            h,
            perfText
          );
          // Logo beside the ticker once a tile can spare the width; on taller
          // tiles it sits above instead, which fits more logos than inline.
          const canLogo = w >= 52 && h >= 36;
          const stackLogo = canLogo && h >= 66 && w >= 46;
          const inlineLogo = canLogo && !stackLogo;
          const logoSize = stackLogo
            ? Math.max(16, Math.min(w * 0.34, h * 0.32, 42))
            : Math.max(13, Math.min(fontSize * 1.05, 30));
          const override = LOGO_OVERRIDES[stock.symbol];
          const logoClass = override?.wide ? "maps-tile-logo maps-tile-logo-wide" : "maps-tile-logo";
          const logoStyle = override?.wide
            ? { height: logoSize, width: "auto", maxWidth: w * 0.82 }
            : { width: logoSize, height: logoSize };
          const open = () =>
            window.open(`/stock/${encodeURIComponent(stock.symbol)}`, "_blank", "noopener");
          return (
            <div
              key={stock.symbol}
              className="maps-tile"
              style={{ left: x, top: y, width: w, height: h, background: perfColor(perf, period) }}
              onMouseMove={(e) => setTooltip({ stock, perf, x: e.clientX, y: e.clientY })}
              onMouseEnter={(e) => setTooltip({ stock, perf, x: e.clientX, y: e.clientY })}
              onClick={open}
              role="link"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter") open();
              }}
            >
              {showSymbol && (
                <>
                  {stackLogo && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      className={`${logoClass} maps-tile-logo-stacked`}
                      src={logoUrl(stock.symbol)}
                      alt=""
                      loading="lazy"
                      style={logoStyle}
                      onError={hideBrokenLogo}
                    />
                  )}
                  <span className="maps-tile-symbol" style={{ fontSize }}>
                    {inlineLogo && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        className={logoClass}
                        src={logoUrl(stock.symbol)}
                        alt=""
                        loading="lazy"
                        style={logoStyle}
                        onError={hideBrokenLogo}
                      />
                    )}
                    {stock.symbol}
                  </span>
                </>
              )}
              {showPerf && (
                <span className="maps-tile-perf" style={{ fontSize: perfFont }}>
                  {perfText}
                </span>
              )}
            </div>
          );
        })}

        {layout?.labels.map((label) => (
          <div
            key={`${label.name}-${label.x}-${label.y}`}
            className="maps-industry-label"
            style={{ left: label.x, top: label.y, width: label.w }}
          >
            {label.name}
          </div>
        ))}
        {layout?.headers.map((header) => (
          <div
            key={`${header.name}-${header.x}-${header.y}`}
            className="maps-sector-header"
            style={{ left: header.x, top: header.y, width: header.w }}
          >
            {header.name}
          </div>
        ))}
      </div>

      <div className="maps-legend hf-map-legend">
        {legendStops.map((stop) => (
          <span
            key={stop}
            className="maps-legend-chip"
            style={{ background: perfColor(stop, period) }}
          >
            {stop > 0 ? "+" : ""}
            {Math.round(stop)}%
          </span>
        ))}
      </div>

      {tooltip && (
        <div
          className="maps-tooltip"
          style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}
          aria-hidden="true"
        >
          <div className="maps-tooltip-title">{tooltip.stock.symbol}</div>
          <div className="maps-tooltip-row">{tooltip.stock.name}</div>
          <div className="maps-tooltip-row">
            {money(tooltip.stock.value)} &middot; {pct(tooltip.stock.pct)} of the book
          </div>
          <div className="maps-tooltip-row">
            {PERIODS.find((p) => p.key === period).label}: {formatPerf(tooltip.perf)}
          </div>
        </div>
      )}

      {quotes && !Object.keys(quotes).length && (
        <p className="hf-chart-note">
          Live prices are unavailable, so the tiles are sized and grouped but not colored.
        </p>
      )}
    </div>
  );
}
