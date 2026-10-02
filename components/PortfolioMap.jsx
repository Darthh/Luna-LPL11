"use client";

// Your holdings as a treemap, sized by what each position is actually worth to
// you rather than by what the company is worth to the market. Same layout,
// palette and tile-fitting as the maps under Stock Maps (lib/mapLayout), so a
// green tile means here what it means there - the only difference is the
// weighting, which is the whole point: a small position in a mega-cap is a
// small tile.
//
// The sectors, industries and performance come from /api/stock-map's watchlist
// mode, the same request the watchlist map on /maps makes. The position values
// come from the shares column beside the list.
import { useEffect, useMemo, useState } from "react";
import {
  MAP_PERIODS as PERIODS,
  SCALE_MAX,
  buildMapLayout,
  buildPortfolioMapStocks,
  formatPerf,
  perfColor,
  tileText,
} from "@/lib/mapLayout";
import { hideBrokenLogo, logoUrl } from "@/lib/companyLogo";
import { formatCap } from "@/lib/formatCap";

// A portfolio is a handful of positions rather than a whole index, so the
// smallest one still gets a tile big enough to read a ticker in.
//
// Higher than the watchlist map's 2400 on /maps because the floor is applied
// per tile but the treemap divides by sector first: a 0.4% position sharing a
// sector block with a 31% one gets that block's share of the floor, not the
// canvas's. 12000 is what keeps such a tile legible at this canvas height -
// tiles are still ranked by value, only the tail is lifted.
const MIN_TILE_AREA = 12000;

// Raises every value enough that the smallest holding still gets `minArea`
// pixels: area * f / (total + n * f) = minArea, solved for f. Same trick the
// fund maps use - without it a 0.2% position lays out as a sliver.
function flooredSizer(rows, area, minArea, valueOf) {
  const total = rows.reduce((a, s) => a + (valueOf(s) || 0), 0);
  const spare = area - minArea * rows.length;
  const floor = spare > 0 ? (minArea * total) / spare : total / rows.length;
  return (s) => Math.max(valueOf(s) || 0, floor);
}

export default function PortfolioMap({ holdings, total }) {
  const [period, setPeriod] = useState("1d");
  const [data, setData] = useState(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [tooltip, setTooltip] = useState(null);
  const [canvasNode, setCanvasNode] = useState(null);

  // Only the tickers matter to the request; the shares are applied locally, so
  // editing a shares box re-sizes the tiles without refetching.
  const symbolKey = useMemo(
    () => holdings.map((h) => h.symbol).sort().join(","),
    [holdings]
  );

  useEffect(() => {
    if (!canvasNode) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    observer.observe(canvasNode);
    return () => observer.disconnect();
  }, [canvasNode]);

  useEffect(() => {
    if (!symbolKey) return;
    let cancelled = false;
    fetch(`/api/stock-map?index=watchlist&symbols=${encodeURIComponent(symbolKey)}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) throw new Error(json.error);
        setData({ key: symbolKey, stocks: json.stocks ?? [], quotes: json.quotes ?? {}, error: null });
      })
      .catch(() => {
        if (!cancelled) setData({ key: symbolKey, stocks: [], quotes: {}, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [symbolKey]);

  const current = data?.key === symbolKey ? data : null;

  // The described tickers carry the sector and industry the treemap groups by;
  // the position value comes from the watchlist row. A ticker the feed couldn't
  // describe is dropped rather than piling into an "Other" block - the same
  // call the maps page makes.
  const stocks = useMemo(() => {
    if (!current) return null;
    return buildPortfolioMapStocks(holdings, current.stocks);
  }, [current, holdings]);

  const layout = useMemo(() => {
    if (!size.w || !size.h || !stocks?.length) return null;
    const sizeOf = flooredSizer(stocks, size.w * size.h, MIN_TILE_AREA, (s) => s.value);
    return buildMapLayout(stocks, size.w, size.h, sizeOf);
  }, [stocks, size]);

  const tiles = useMemo(() => {
    if (!layout || !current) return null;
    return layout.tiles.map(({ stock, x, y, w, h }) => {
      const perf = current.quotes[stock.symbol]?.perf?.[period];
      const perfText = formatPerf(perf);
      const { fontSize, showSymbol, perfFont, showPerf } = tileText(stock.symbol, w, h, perfText);
      const share = total ? (stock.value / total) * 100 : 0;
      const open = () =>
        window.open(`/stock/${encodeURIComponent(stock.symbol)}`, "_blank", "noopener");
      return (
        <div
          key={stock.symbol}
          className="maps-tile"
          style={{ left: x, top: y, width: w, height: h, background: perfColor(perf, period) }}
          onMouseMove={(e) => setTooltip({ stock, perf, share, x: e.clientX, y: e.clientY })}
          onMouseEnter={(e) => setTooltip({ stock, perf, share, x: e.clientX, y: e.clientY })}
          onClick={open}
          role="link"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter") open();
          }}
        >
          {showSymbol && (
            <span className="maps-tile-symbol" style={{ fontSize }}>
              {w >= 52 && h >= 36 && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  className="maps-tile-logo"
                  src={logoUrl(stock.symbol)}
                  alt=""
                  loading="lazy"
                  style={{ width: Math.max(13, Math.min(fontSize * 1.05, 30)), height: "auto" }}
                  onError={hideBrokenLogo}
                />
              )}
              {stock.symbol}
            </span>
          )}
          {showPerf && (
            <span className="maps-tile-perf" style={{ fontSize: perfFont }}>
              {perfText}
            </span>
          )}
        </div>
      );
    });
  }, [layout, current, period, total]);

  if (!holdings.length) return null;

  const scaleMax = SCALE_MAX[period];
  const legendStops = [-1, -2 / 3, -1 / 3, 0, 1 / 3, 2 / 3, 1].map((t) => t * scaleMax);

  return (
    <section className="watchlist-map" aria-labelledby="watchlist-map-title">
      <div className="watchlist-map-head">
        <div>
          <h2 className="watchlist-map-title" id="watchlist-map-title">
            Your portfolio map
          </h2>
          <p className="watchlist-map-sub">
            Every position you hold, grouped by sector and sized by what it is worth to you -
            not by the company&apos;s market cap. Colors show{" "}
            {PERIODS.find((p) => p.key === period).label.toLowerCase()} performance.
          </p>
        </div>
        <div className="maps-filter-group watchlist-map-periods">
          {PERIODS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`maps-filter-btn${period === item.key ? " active" : ""}`}
              onClick={() => setPeriod(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className="maps-canvas watchlist-map-canvas"
        ref={setCanvasNode}
        onMouseLeave={() => setTooltip(null)}
      >
        {current?.error && <div className="maps-status">Could not load map data.</div>}
        {!current && <div className="maps-status">Loading map…</div>}
        {current && !current.error && !stocks?.length && (
          <div className="maps-status">Nothing to map yet.</div>
        )}
        {tiles}
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

      <div className="maps-legend">
        {legendStops.map((stop) => (
          <span
            key={stop}
            className="maps-legend-chip"
            style={{ background: perfColor(stop, period) }}
          >
            {stop === 0 ? "0%" : formatPerf(stop)}
          </span>
        ))}
      </div>

      {tooltip && (
        <div
          className="maps-tooltip"
          style={{
            left: Math.min(tooltip.x + 14, window.innerWidth - 250),
            top: Math.min(tooltip.y + 16, window.innerHeight - 170),
          }}
        >
          <div className="maps-tooltip-title">
            {tooltip.stock.symbol} - {tooltip.stock.name}
          </div>
          <div className="maps-tooltip-row">
            {tooltip.stock.sector}
            {tooltip.stock.industry ? ` · ${tooltip.stock.industry}` : ""}
          </div>
          <div className="maps-tooltip-row">
            {formatCap(tooltip.stock.value)} · {tooltip.share.toFixed(2)}% of portfolio
          </div>
          <div className="maps-tooltip-row">
            {PERIODS.find((p) => p.key === period).label}: {formatPerf(tooltip.perf)}
          </div>
        </div>
      )}
    </section>
  );
}
