"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { hideBrokenLogo, logoUrl } from "@/lib/companyLogo";
import { formatCap } from "@/lib/formatCap";
import { arrowPct, changeClass } from "@/lib/change";
import { holdingColors } from "@/lib/portfolioColors";
import AuthGate from "./AuthGate";
import TickerInput from "./TickerInput";
import PortfolioGrowth from "./PortfolioGrowth";
import PortfolioWheel from "./PortfolioWheel";
import PortfolioMap from "./PortfolioMap";
import { useWatchlist } from "./WatchlistProvider";
import { money } from "@/lib/num";

const REFRESH_MS = 60_000;
const SORT_KEY = "watchlistSort";

const SORTS = [
  { key: "custom", label: "My order" },
  { key: "name", label: "Name" },
  { key: "price", label: "Price $" },
  { key: "change", label: "Price %" },
  { key: "cap", label: "Market cap" },
  { key: "value", label: "My value" },
];


function formatPrice(price) {
  return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Biggest first, with rows we have no number for at the bottom rather than
// sorted as if they were zero.
function byValueDesc(valueOf) {
  return (a, b) => {
    const av = valueOf(a);
    const bv = valueOf(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return bv - av;
  };
}

function moved(order, symbol, to) {
  const from = order.indexOf(symbol);
  if (from < 0 || to < 0 || to >= order.length || to === from) return null;
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, symbol);
  return next;
}

export default function WatchlistPanel() {
  const {
    items,
    loading,
    signedIn,
    authLoading,
    tapeEnabled,
    add,
    remove,
    reorder,
    setShares,
    setTape,
  } = useWatchlist();
  const [query, setQuery] = useState("");
  const [error, setError] = useState(null);
  const [quotes, setQuotes] = useState({});
  const [meta, setMeta] = useState({});
  // What is being typed in a shares box right now. The saved number is the one
  // in `items`; this only exists so a half-typed "12." isn't parsed and
  // rewritten under the cursor.
  const [sharesDraft, setSharesDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState("custom");
  // The order being dragged right now, which the list follows until the drop
  // is saved.
  const [dragOrder, setDragOrder] = useState(null);
  const [dragging, setDragging] = useState(null);
  const listRef = useRef(null);
  const dragRef = useRef(null);

  // Sorted so that reordering the list doesn't look like a different set of
  // tickers and refetch prices and market caps.
  const symbolKey = useMemo(
    () => [...items.map((i) => i.symbol)].sort().join(","),
    [items]
  );

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SORT_KEY);
      if (SORTS.some((s) => s.key === saved)) setSort(saved);
    } catch {
      /* stay on the manual order */
    }
  }, []);

  const changeSort = useCallback((next) => {
    setSort(next);
    try {
      localStorage.setItem(SORT_KEY, next);
    } catch {
      /* the choice still holds for this session */
    }
  }, []);

  // Live prices for the rows, refreshed on the same cadence as the bar.
  useEffect(() => {
    // Nothing to price. Quotes for removed tickers are left in place: no row
    // reads them, and they're still warm if the ticker is added back.
    if (!symbolKey) return;
    let cancelled = false;
    function load() {
      fetch(`/api/watchlist-quotes?symbols=${encodeURIComponent(symbolKey)}`)
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return;
          setQuotes((prev) => ({
            ...prev,
            ...Object.fromEntries((data.quotes ?? []).map((q) => [q.symbol, q])),
          }));
        })
        .catch(() => {
          /* keep the last prices we had */
        });
    }
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbolKey]);

  // Market caps don't move on a one-minute cadence, so they're fetched once
  // per set of tickers rather than on the price interval.
  useEffect(() => {
    if (!symbolKey) return;
    let cancelled = false;
    fetch(`/api/watchlist-meta?symbols=${encodeURIComponent(symbolKey)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setMeta((prev) => ({ ...prev, ...(data.meta ?? {}) }));
      })
      .catch(() => {
        /* rows just render without a market cap */
      });
    return () => {
      cancelled = true;
    };
  }, [symbolKey]);

  // The owned half of the list: a row with shares and a price is a position,
  // and everything below this point - the wheel, the chart, the scorecard - is
  // about those. A ticker with no shares stays a watched ticker.
  const holdings = useMemo(
    () =>
      items
        .map((i) => ({
          symbol: i.symbol,
          name: i.name ?? meta[i.symbol]?.name ?? i.symbol,
          shares: i.shares,
          price: quotes[i.symbol]?.price ?? null,
          value: i.shares != null && quotes[i.symbol]?.price != null
            ? i.shares * quotes[i.symbol].price
            : null,
        }))
        .filter((h) => h.value > 0),
    [items, quotes, meta]
  );

  const totalValue = useMemo(() => holdings.reduce((a, h) => a + h.value, 0), [holdings]);

  // The same colors the wheel and the chart use, so a row can be matched to
  // its slice and its line by color as well as by ticker.
  const colors = useMemo(() => holdingColors(holdings), [holdings]);

  // The day's move on the portfolio, weighted the same way everything else
  // here is: by what each position is worth.
  const dayChangePct = useMemo(() => {
    if (!totalValue) return null;
    const known = holdings.filter((h) => quotes[h.symbol]?.changePct != null);
    const base = known.reduce((a, h) => a + h.value, 0);
    if (!base) return null;
    return known.reduce((a, h) => a + quotes[h.symbol].changePct * (h.value / base), 0);
  }, [holdings, quotes, totalValue]);

  const valueOf = useCallback(
    (item) =>
      item.shares != null && quotes[item.symbol]?.price != null
        ? item.shares * quotes[item.symbol].price
        : null,
    [quotes]
  );

  const ordered = useMemo(() => {
    const bySymbol = new Map(items.map((i) => [i.symbol, i]));
    if (dragOrder) return dragOrder.map((s) => bySymbol.get(s)).filter(Boolean);
    const copy = [...items];
    if (sort === "name") {
      return copy.sort((a, b) => (a.name ?? a.symbol).localeCompare(b.name ?? b.symbol));
    }
    if (sort === "price") return copy.sort(byValueDesc((i) => quotes[i.symbol]?.price));
    if (sort === "change") return copy.sort(byValueDesc((i) => quotes[i.symbol]?.changePct));
    if (sort === "cap") return copy.sort(byValueDesc((i) => meta[i.symbol]?.cap));
    if (sort === "value") return copy.sort(byValueDesc(valueOf));
    return copy;
  }, [items, sort, quotes, meta, dragOrder, valueOf]);

  const commitOrder = useCallback(
    async (next) => {
      // An explicit order is a manual order, so the list switches to it
      // whichever way it was sorted before.
      changeSort("custom");
      const result = await reorder(next);
      if (result.error) setError(result.error);
    },
    [changeSort, reorder]
  );

  // Dragging runs on pointer events rather than HTML5 drag-and-drop so it
  // works the same with a mouse and on a touchscreen. Rows are a uniform
  // height, so the row under the pointer is a division rather than a hit test.
  function onHandlePointerDown(e, symbol) {
    if (e.button > 0 || ordered.length < 2) return;
    const list = listRef.current;
    // Averaged across the list rather than measured off one row: every row but
    // the first carries a 1px separator, and that adds up over a long list.
    const rowHeight = list ? list.getBoundingClientRect().height / ordered.length : 0;
    if (!rowHeight) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const order = ordered.map((i) => i.symbol);
    dragRef.current = { symbol, rowHeight, order, startOrder: order };
    setDragOrder(order);
    setDragging(symbol);
  }

  function onHandlePointerMove(e) {
    const drag = dragRef.current;
    const list = listRef.current;
    if (!drag || !list) return;
    const top = list.getBoundingClientRect().top;
    const target = Math.min(
      drag.order.length - 1,
      Math.max(0, Math.floor((e.clientY - top) / drag.rowHeight))
    );
    const next = moved(drag.order, drag.symbol, target);
    if (next) {
      drag.order = next;
      setDragOrder(next);
    }
  }

  function onHandlePointerUp(e) {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    const next = drag.order;
    setDragging(null);
    setDragOrder(null);
    // A press that didn't move anything is a click, not a reorder, so it
    // mustn't quietly switch the list off whichever sort it was on.
    if (next.join(",") !== drag.startOrder.join(",")) commitOrder(next);
  }

  // Same reordering from the keyboard, for anyone not using a pointer.
  function onHandleKeyDown(e, symbol) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const order = ordered.map((i) => i.symbol);
    const next = moved(order, symbol, order.indexOf(symbol) + (e.key === "ArrowUp" ? -1 : 1));
    if (next) commitOrder(next);
  }

  // Saved when the box loses focus or Enter is pressed, not on every
  // keystroke: each save is a round trip, and a four-digit holding would
  // otherwise be four of them.
  async function commitShares(symbol) {
    const draft = sharesDraft[symbol];
    if (draft === undefined) return;
    setSharesDraft((d) => {
      const next = { ...d };
      delete next[symbol];
      return next;
    });
    const result = await setShares(symbol, draft);
    if (result.error) setError(result.error);
  }

  async function addEntry(entry) {
    setBusy(true);
    const result = await add(entry);
    setBusy(false);
    setError(result.error ?? null);
    if (!result.error) setQuery("");
  }

  // The Add button next to the box. Picking a suggestion adds it directly
  // (TickerInput's onPick), so this covers typing a ticker in full and
  // pressing Enter or Add.
  function submit(e) {
    e.preventDefault();
    const typed = query.trim().toUpperCase();
    if (typed) addEntry({ symbol: typed });
  }

  if (authLoading) {
    return (
      <div className="watchlist-wrap">
        <p className="watchlist-empty">Loading your watchlist…</p>
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="watchlist-wrap">
        <AuthGate
          autoPrompt
          title="Your watchlist needs an account"
          message="Watchlists are saved to your account, so you need one to use this feature. It takes a moment, and it also raises your API quota."
          reason="Create an account to create a watchlist. It's how your tickers are saved, put on the Watchlist bar, and drawn as your own stock map."
        />
      </div>
    );
  }

  return (
    <div className="watchlist-wrap">
      <div className="watchlist-head">
        <div>
          <h1 className="watchlist-title">Your Watchlist</h1>
          <p className="watchlist-sub">
            Track the stocks and ETFs you care about. Put them on the Watchlist bar at the top of
            every page, and view them as their own stock map.
          </p>
        </div>
        <div className="watchlist-head-actions">
          <button
            type="button"
            className={`watchlist-tape-btn${tapeEnabled ? " active" : ""}`}
            onClick={() => setTape(!tapeEnabled)}
            aria-pressed={tapeEnabled}
          >
            {tapeEnabled ? "✓ On the Watchlist bar" : "Set as Watchlist bar"}
          </button>
          <Link className="watchlist-map-link" href="/maps?index=watchlist">
            View as stock map →
          </Link>
        </div>
      </div>

      <p className="watchlist-tape-note">
        {tapeEnabled
          ? "The Watchlist bar at the top of the site is showing your tickers instead of the default instruments (S&P 500, FTSE 100, Gold, KOSPI, Crude Oil). Turn it off to bring those back."
          : "Turn this on to replace the default instruments (S&P 500, FTSE 100, Gold, KOSPI, Crude Oil) in the Watchlist bar at the top of the site with your own tickers."}
      </p>

      {/* List on the left, the pictures it feeds on the right, so a change to
          the shares column is seen in the wheel and the chart without
          scrolling between them. Collapses to one column on narrow screens. */}
      <div className="watchlist-split">
        <div className="watchlist-list-col">
      {holdings.length > 0 && (
        <div className="watchlist-total">
          <div>
            <span className="watchlist-total-label">Portfolio value</span>
            <span className="watchlist-total-amount">{money(totalValue, 2)}</span>
          </div>
          <div className="watchlist-total-meta">
            {dayChangePct != null && (
              <span className={changeClass(dayChangePct)}>{arrowPct(dayChangePct)} today</span>
            )}
            <span className="watchlist-total-count">
              {holdings.length} of {items.length} held
            </span>
          </div>
        </div>
      )}

      {/* The home page's market selector card, relabelled: same outer box,
          same TickerInput (logo in the field, logos in the suggestions) and the
          same Add button, so both searches on the site look and behave alike. */}
      <section className="whatif-card home-compare-card watchlist-add" aria-labelledby="watchlist-add-title">
        <div className="whatif-card-head">
          <h2 id="watchlist-add-title">Add to watchlist</h2>
        </div>
        <form className="whatif-custom home-compare-form" onSubmit={submit}>
          <TickerInput
            value={query}
            index={-1}
            label="Add a stock or ETF to your watchlist"
            placeholder="Add a stock or ETF."
            onChange={(v) => {
              setQuery(v);
              setError(null);
            }}
            onPick={(symbol) => addEntry({ symbol })}
          />
          <button
            type="submit"
            className="whatif-custom-add home-compare-add"
            disabled={busy || !query.trim()}
          >
            Add
          </button>
        </form>
        {error && <p className="ticker-error">{error}</p>}
      </section>

      <div className="watchlist-toolbar">
        <label className="watchlist-sort">
          Sort by
          <select value={sort} onChange={(e) => changeSort(e.target.value)}>
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        {items.length > 1 && (
          <span className="watchlist-drag-hint">Drag a row by its handle to reorder</span>
        )}
      </div>

      {loading ? (
        <p className="watchlist-empty">Loading your watchlist…</p>
      ) : items.length === 0 ? (
        <p className="watchlist-empty">
          Nothing here yet. Search above to add your first stock or ETF.
        </p>
      ) : (
        <ul className="watchlist-rows" ref={listRef}>
          {ordered.map((item) => {
            const quote = quotes[item.symbol];
            const info = meta[item.symbol];
            const value = valueOf(item);
            return (
              <li
                className={`watchlist-row${dragging === item.symbol ? " dragging" : ""}`}
                key={item.symbol}
              >
                <button
                  type="button"
                  className="watchlist-grip"
                  aria-label={`Reorder ${item.symbol}. Use the arrow keys to move it.`}
                  title="Drag to reorder"
                  onPointerDown={(e) => onHandlePointerDown(e, item.symbol)}
                  onPointerMove={onHandlePointerMove}
                  onPointerUp={onHandlePointerUp}
                  onPointerCancel={onHandlePointerUp}
                  onKeyDown={(e) => onHandleKeyDown(e, item.symbol)}
                >
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                    <g fill="currentColor">
                      <circle cx="6" cy="3.5" r="1.4" />
                      <circle cx="10" cy="3.5" r="1.4" />
                      <circle cx="6" cy="8" r="1.4" />
                      <circle cx="10" cy="8" r="1.4" />
                      <circle cx="6" cy="12.5" r="1.4" />
                      <circle cx="10" cy="12.5" r="1.4" />
                    </g>
                  </svg>
                </button>
                <Link className="watchlist-row-main" href={`/stock/${encodeURIComponent(item.symbol)}`}>
                  {/* Only a held position has a color: an unowned ticker is on
                      neither picture, so a dot for it would point at nothing. */}
                  <span
                    className="watchlist-row-dot"
                    style={{ background: colors[item.symbol] ?? "transparent" }}
                    aria-hidden="true"
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="watchlist-row-logo"
                    src={logoUrl(item.symbol)}
                    alt=""
                    width="26"
                    height="26"
                    loading="lazy"
                    onError={hideBrokenLogo}
                  />
                  <span className="watchlist-row-symbol">{item.symbol}</span>
                  <span className="watchlist-row-name">{item.name ?? info?.name ?? ""}</span>
                </Link>
                <label className="watchlist-row-shares">
                  <span className="watchlist-row-shares-label">Shares</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    placeholder="0"
                    value={sharesDraft[item.symbol] ?? item.shares ?? ""}
                    onChange={(e) =>
                      setSharesDraft((d) => ({ ...d, [item.symbol]: e.target.value }))
                    }
                    onBlur={() => commitShares(item.symbol)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.currentTarget.blur();
                      }
                    }}
                    aria-label={`Shares of ${item.symbol} you hold`}
                  />
                </label>
                <div className="watchlist-row-value">
                  {value != null ? (
                    <>
                      <span className="watchlist-row-value-amount">{money(value, 2)}</span>
                      <span className="watchlist-row-value-label">
                        {totalValue ? `${((value / totalValue) * 100).toFixed(1)}% of portfolio` : "Value"}
                      </span>
                    </>
                  ) : (
                    <span className="watchlist-row-value-label">Watching</span>
                  )}
                </div>
                <div className="watchlist-row-cap">
                  {info?.cap != null && (
                    <>
                      <span className="watchlist-row-cap-value">{formatCap(info.cap)}</span>
                      <span className="watchlist-row-cap-label">
                        {info.capKind === "assets" ? "Fund assets" : "Market cap"}
                      </span>
                    </>
                  )}
                </div>
                <div className="watchlist-row-quote">
                  {quote?.price != null ? (
                    <>
                      <span className="watchlist-row-price">{formatPrice(quote.price)}</span>
                      <span className={changeClass(quote.changePct)}>{arrowPct(quote.changePct)}</span>
                    </>
                  ) : (
                    <span className="watchlist-row-price watchlist-row-muted">
                      {quote ? "No price" : "…"}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="watchlist-remove"
                  onClick={() => remove(item.symbol)}
                  aria-label={`Remove ${item.symbol} from your watchlist`}
                  title="Remove"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
        </div>

        <div className="watchlist-portfolio-col">
          {holdings.length > 0 ? (
            <>
              <PortfolioGrowth holdings={holdings} />
              <PortfolioWheel holdings={holdings} total={totalValue} />
            </>
          ) : (
            items.length > 0 && (
              <p className="watchlist-empty watchlist-portfolio-hint">
                Enter how many shares you hold beside a ticker to see your portfolio as a weight
                wheel and a growth chart.
              </p>
            )
          )}
        </div>
      </div>

      {/* Full width under the split: the map wants the whole page, and it is
          the last thing on it. Renders nothing without priced positions. */}
      <PortfolioMap holdings={holdings} total={totalValue} />
    </div>
  );
}
