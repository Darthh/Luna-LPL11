"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { STOCK_UNIVERSE } from "@/lib/stockMapData";
import {
  MAP_PERIODS as PERIODS,
  MIN_PERF_FONT,
  MIN_SYMBOL_FONT,
  PERF_CHAR_W,
  SCALE_MAX,
  SYMBOL_CHAR_W,
  buildMapLayout as buildLayout,
  formatPerf,
  perfColor,
} from "@/lib/mapLayout";
import { LOGO_OVERRIDES, hideBrokenLogo, logoUrl } from "@/lib/companyLogo";
import { formatCap } from "@/lib/formatCap";
import AuthGate from "./AuthGate";
import { useWatchlist } from "./WatchlistProvider";

// `fund` marks a map built from an index fund's full published holdings: the
// tile list comes from the API rather than the static universe, and tile area
// is the position's weight in the fund.
const INDEXES = [
  { key: "sp500", label: "S&P 500" },
  { key: "ndx100", label: "Nasdaq 100" },
  { key: "dow30", label: "Dow Jones 30" },
  { key: "r1000", label: "Russell 1000", fund: "Russell 1000 Value (VONV)" },
  { key: "soxx", label: "Semiconductors" },
  { key: "em", label: "Emerging Markets", fund: "MSCI Emerging Markets IMI (IEMG)" },
  { key: "eafe", label: "Europe, Aust. & Far East", fund: "MSCI EAFE IMI (IEFA)" },
  { key: "popular", label: "Top 20 Popular This Week" },
  { key: "watchlist", label: "Your Stock Watchlist" },
];
const DEFAULT_INDEX = "sp500";

// Smallest tile a holding may shrink to, in px². An index fund's largest
// position outweighs its smallest by a factor of millions, so without a floor
// the tail lays out as sub-pixel slivers; this trades exact proportionality
// below ~0.004% for every constituent actually having a square.
const MIN_TILE_AREA = 36;
// A watchlist is a handful of tickers rather than a whole index, and a
// mega-cap next to a small cap would squeeze the small one to a few pixels.
// Its floor is a legible tile instead of a visible one.
const WATCHLIST_MIN_TILE_AREA = 2400;

// Raises every value enough that the smallest holding still gets `minArea`
// pixels: area * f / (total + n * f) = minArea, solved for f.
function flooredSizer(stocks, area, minArea, valueOf) {
  const total = stocks.reduce((a, s) => a + (valueOf(s) || 0), 0);
  const spare = area - minArea * stocks.length;
  const floor = spare > 0 ? (minArea * total) / spare : total / stocks.length;
  return (s) => Math.max(valueOf(s) || 0, floor);
}


export default function StockMap() {
  const { items, loading: watchlistLoading, signedIn, authLoading } = useWatchlist();
  // Settled on mount from the URL, so the first client render still matches
  // what the server sent for /maps.
  const [index, setIndex] = useState(null);
  const [period, setPeriod] = useState("1d");
  // Result is keyed by the map it was fetched for; a mismatch with the
  // currently selected map is what "loading" means.
  const [result, setResult] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const canvasRef = useRef(null);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // /maps?index=watchlist opens straight on a given map (the watchlist page
  // links in that way).
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("index");
    // The URL query is only readable on the client after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIndex(INDEXES.some((i) => i.key === requested) ? requested : DEFAULT_INDEX);
  }, []);

  const isPopular = index === "popular";
  const isWatchlist = index === "watchlist";
  const fund = INDEXES.find((i) => i.key === index)?.fund ?? null;
  // The watchlist map is defined by the user's own tickers rather than by a
  // fixed constituent list, so it refetches whenever that list changes.
  const watchlistSymbols = isWatchlist ? items.map((i) => i.symbol).join(",") : "";
  // A watchlist belongs to an account, so this map asks visitors to make one
  // rather than showing them an empty canvas.
  const lockedWatchlist = isWatchlist && !authLoading && !signedIn;
  const emptyWatchlist = isWatchlist && !lockedWatchlist && !watchlistLoading && !watchlistSymbols;
  const queryKey = isWatchlist ? `watchlist:${watchlistSymbols}` : index;

  useEffect(() => {
    if (!index || emptyWatchlist || lockedWatchlist) return;
    // Wait for the stored watchlist to arrive rather than fetching an
    // empty map first.
    if (isWatchlist && watchlistLoading) return;

    let cancelled = false;
    const url = isWatchlist
      ? `/api/stock-map?index=watchlist&symbols=${encodeURIComponent(watchlistSymbols)}`
      : `/api/stock-map?index=${index}`;
    fetch(url)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) throw new Error(json.error);
        setResult({
          key: queryKey,
          quotes: json.quotes,
          stocks: json.stocks ?? null,
          isDemo: json.isDemo,
          error: null,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setResult({
            key: queryKey,
            quotes: null,
            isDemo: false,
            error: "Could not load map data. Please try again later.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    index,
    isWatchlist,
    watchlistLoading,
    watchlistSymbols,
    emptyWatchlist,
    lockedWatchlist,
    queryKey,
  ]);

  const current = result?.key === queryKey ? result : null;
  const loading = !current && !emptyWatchlist && !lockedWatchlist;
  const error = current?.error ?? null;
  const quotes = current?.quotes ?? null;
  const isDemo = current?.isDemo ?? false;
  // Maps whose tiles are all the same size, so a small holding doesn't
  // visually vanish next to a mega-cap.
  const equalArea = isPopular;

  // Preset indexes are described by the static universe; the popular,
  // watchlist and fund-backed maps are dynamic, so their stock lists (and the
  // values their tiles are sized by) come from the API.
  const stocks = useMemo(() => {
    if (isPopular || isWatchlist || fund) return current?.stocks ?? null;
    return STOCK_UNIVERSE.filter((s) => s.indexes.includes(index));
  }, [index, isPopular, isWatchlist, fund, current]);

  const layout = useMemo(() => {
    if (!size.w || !size.h || !stocks) return null;
    const area = size.w * size.h;
    // The popular map gives every stock an identical tile size - mentions and
    // cap only decide sort order there, not area - so a small meme stock
    // doesn't visually vanish next to a mega-cap. A fund map is sized by
    // weight: an international fund's caps come back in local currency, and
    // weight is the fund's own composition anyway. Everything else, the
    // watchlist included, is sized by market cap (a fund on the watchlist by
    // the assets it holds, which is the comparable measure of its size).
    let sizeOf = (s) => s.cap;
    if (equalArea) sizeOf = () => 1;
    else if (fund) sizeOf = flooredSizer(stocks, area, MIN_TILE_AREA, (s) => s.weight);
    else if (isWatchlist) {
      sizeOf = flooredSizer(stocks, area, WATCHLIST_MIN_TILE_AREA, (s) => s.cap);
    }
    return buildLayout(stocks, size.w, size.h, sizeOf);
  }, [stocks, size, equalArea, fund, isWatchlist]);

  // Built once per layout/period rather than inline: hovering sets state on
  // this component, and a full index map is thousands of tiles to reconcile
  // on every mouse move if their elements are recreated each render.
  const tiles = useMemo(() => {
    if (!layout || !quotes) return null;
    return layout.tiles.map(({ stock, x, y, w, h }) => {
      const quote = quotes[stock.symbol];
      const perf = quote?.perf?.[period];
      // Ticker shrinks to fit rather than disappearing: small and medium
      // tiles get the same label at a smaller size, and it is only dropped
      // when even the floor font would overflow.
      const fontSize = Math.max(
        MIN_SYMBOL_FONT,
        Math.min(w / (stock.symbol.length * 0.8), h * 0.4, 27)
      );
      const showSymbol =
        w >= stock.symbol.length * fontSize * SYMBOL_CHAR_W + 2 && h >= fontSize * 1.2;
      // Performance always renders a step smaller than the ticker, and only
      // when both lines fit stacked.
      const perfText = formatPerf(perf);
      const perfFont = Math.max(MIN_PERF_FONT, fontSize * 0.55);
      const showPerf =
        showSymbol &&
        w >= perfText.length * perfFont * PERF_CHAR_W + 2 &&
        h >= fontSize * 1.2 + perfFont * 1.35;
      // Logo beside the ticker once a tile can spare the width; on taller
      // tiles it sits above the ticker instead, which fits more logos (META,
      // INTC, AMD) than the inline layout could.
      const canLogo = w >= 52 && h >= 36;
      const stackLogo = canLogo && h >= 66 && w >= 46;
      const inlineLogo = canLogo && !stackLogo;
      const logoSize = stackLogo
        ? Math.max(16, Math.min(w * 0.34, h * 0.32, 42))
        : Math.max(13, Math.min(fontSize * 1.05, 30));
      const override = LOGO_OVERRIDES[stock.symbol];
      const logoSrc = logoUrl(stock.symbol);
      const logoClass = override?.wide ? "maps-tile-logo maps-tile-logo-wide" : "maps-tile-logo";
      const logoStyle = override?.wide
        ? { height: logoSize, width: "auto", maxWidth: w * 0.82 }
        : { width: logoSize, height: logoSize };
      const open = () => window.open(`/stock/${encodeURIComponent(stock.symbol)}`, "_blank", "noopener");
      return (
        <div
          key={stock.symbol}
          className="maps-tile"
          style={{ left: x, top: y, width: w, height: h, background: perfColor(perf, period) }}
          onMouseMove={(e) => setTooltip({ stock, quote, x: e.clientX, y: e.clientY })}
          onMouseEnter={(e) => setTooltip({ stock, quote, x: e.clientX, y: e.clientY })}
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
                  src={logoSrc}
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
                    src={logoSrc}
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
    });
  }, [layout, quotes, period]);

  const scaleMax = SCALE_MAX[period];
  const legendStops = [-1, -2 / 3, -1 / 3, 0, 1 / 3, 2 / 3, 1].map((t) => t * scaleMax);

  return (
    <section className="maps-page">
      <aside className="maps-sidebar">
        <div className="maps-filter-title">Map filter</div>
        <div className="maps-filter-group">
          {INDEXES.map((item) => (
            <button
              key={item.key}
              className={`maps-filter-btn${index === item.key ? " active" : ""}`}
              onClick={() => setIndex(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="maps-filter-title">Performance</div>
        <div className="maps-filter-group">
          {PERIODS.map((item) => (
            <button
              key={item.key}
              className={`maps-filter-btn${period === item.key ? " active" : ""}`}
              onClick={() => setPeriod(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="maps-note">
          {isWatchlist
            ? `The stocks and ETFs on your watchlist${items.length ? ` (${items.length})` : ""}; tile size represents market cap, or the assets held for a fund.`
            : isPopular
              ? "Every stock gets an equal-size tile, regardless of market cap."
              : fund
                ? `All ${stocks ? stocks.length.toLocaleString() : ""} holdings of ${fund}; tile size represents weight in the index, with a floor so the smallest positions stay visible.`
                : "Tile size represents market cap."}{" "}
          Colors show {PERIODS.find((p) => p.key === period).label.toLowerCase()} performance.
        </p>
        {isDemo && <p className="maps-demo-note">Live feed unavailable - showing simulated data.</p>}
      </aside>

      <section className="maps-main">
        <div className="maps-canvas" ref={canvasRef} onMouseLeave={() => setTooltip(null)}>
          {lockedWatchlist && (
            <div className="maps-status maps-status-empty">
              <AuthGate
                compact
                title="Your watchlist needs an account"
                message="This map is built from your own watchlist, which is saved to your account. Create one to pick the stocks and ETFs it shows."
                reason="Create an account to create a watchlist. It's how your tickers are saved, put on the Watchlist bar, and drawn as this map."
              />
            </div>
          )}
          {emptyWatchlist && (
            <div className="maps-status maps-status-empty">
              <p>Your watchlist is empty.</p>
              <Link className="maps-empty-link" href="/watchlist">
                Add stocks and ETFs to your watchlist →
              </Link>
            </div>
          )}
          {loading && <div className="maps-status">Loading map…</div>}
          {error && !loading && <div className="maps-status">{error}</div>}
          {!loading && !error && layout && quotes && (
            <>
              {tiles}
              {layout.labels.map((label) => (
                <div
                  key={`${label.name}-${label.x}-${label.y}`}
                  className="maps-industry-label"
                  style={{ left: label.x, top: label.y, width: label.w }}
                >
                  {label.name}
                </div>
              ))}
              {layout.headers.map((header) => (
                <div
                  key={`${header.name}-${header.x}-${header.y}`}
                  className="maps-sector-header"
                  style={{ left: header.x, top: header.y, width: header.w }}
                >
                  {header.name}
                </div>
              ))}
            </>
          )}
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
        {equalArea && (
          <p className="maps-legend-disclaimer">
            Equal-weighted map - tile size does not reflect market cap.
          </p>
        )}
      </section>

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
            {tooltip.stock.sector} · {tooltip.stock.industry}
          </div>
          {isPopular && (
            <div className="maps-tooltip-row">
              #{tooltip.stock.rank} this week · {tooltip.stock.mentions.toLocaleString()} mentions
            </div>
          )}
          {fund && tooltip.stock.weight != null && (
            <div className="maps-tooltip-row">
              {tooltip.stock.weight < 0.01 ? "<0.01" : tooltip.stock.weight.toFixed(2)}% of the index
            </div>
          )}
          {tooltip.stock.cap != null && (
            <div className="maps-tooltip-row">
              {tooltip.stock.capKind === "assets" ? "Fund assets" : "Market cap"}:{" "}
              {formatCap(tooltip.stock.cap)}
            </div>
          )}
          {tooltip.quote && (
            <>
              <div className="maps-tooltip-row">Price: ${tooltip.quote.price.toFixed(2)}</div>
              <div className="maps-tooltip-perfs">
                {PERIODS.map((p) => (
                  <span
                    key={p.key}
                    className={`maps-tooltip-perf${p.key === period ? " active" : ""}`}
                    style={{ color: perfColor(tooltip.quote.perf?.[p.key], p.key) }}
                  >
                    {p.label}: {formatPerf(tooltip.quote.perf?.[p.key])}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
