"use client";

import { useWatchlist } from "./WatchlistProvider";

// The one control that puts a ticker on the watchlist: the header search
// suggestions and the stock page both use it, so "is it saved" and the
// add/remove call live here rather than in each caller. Errors go back to the
// caller because each has its own spot to show one.
export default function WatchlistButton({ symbol, name, label = false, onError, className = "" }) {
  const { items, add, remove } = useWatchlist();
  const saved = items.some((i) => i.symbol === symbol);

  async function toggle() {
    const result = saved ? await remove(symbol) : await add({ symbol, name });
    onError?.(result.error ?? null);
  }

  const text = saved ? "On watchlist" : "Add to watchlist";

  return (
    <button
      type="button"
      className={`watchlist-btn${saved ? " saved" : ""}${label ? " labelled" : ""} ${className}`.trim()}
      onClick={toggle}
      aria-pressed={saved}
      title={saved ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`}
      aria-label={saved ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`}
    >
      <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
        <path
          d="M6 3h12v18l-6-4.5L6 21z"
          fill={saved ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
      {label && <span>{text}</span>}
    </button>
  );
}
