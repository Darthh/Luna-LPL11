"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  MAX_WATCHLIST_ITEMS,
  isValidSymbol,
  normalizeName,
  normalizeShares,
  normalizeSymbol,
} from "@/lib/watchlist";

// One shared copy of the watchlist for the whole app: the ticker bar, the
// watchlist page and the watchlist stock map all read it, and a change in one
// has to show up in the others without a reload.
//
// A watchlist belongs to an account - the page and the map both ask visitors
// to create one. The only thing still read out of localStorage is a watchlist
// saved in the browser back when the feature didn't need an account; that gets
// merged into the account on the next sign-in and then cleared.
const STORAGE_KEY = "watchlist";
// Whether the bar at the top of the site shows the watchlist instead of the
// default instruments. A display preference, so it stays local like `theme`.
const TAPE_KEY = "watchlistTape";

const WatchlistContext = createContext(null);

function sanitize(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const items = [];
  for (const entry of list) {
    const symbol = normalizeSymbol(entry?.symbol);
    if (!isValidSymbol(symbol) || seen.has(symbol)) continue;
    seen.add(symbol);
    items.push({
      symbol,
      name: normalizeName(entry?.name),
      shares: normalizeShares(entry?.shares),
    });
    if (items.length >= MAX_WATCHLIST_ITEMS) break;
  }
  return items;
}

function readLegacyLocal() {
  try {
    return sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

export function WatchlistProvider({ children }) {
  const { status } = useSession();
  const signedIn = status === "authenticated";
  const authLoading = status === "loading";
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tapeEnabled, setTapeEnabled] = useState(false);

  useEffect(() => {
    try {
      // Browser storage is only available after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTapeEnabled(localStorage.getItem(TAPE_KEY) === "1");
    } catch {
      /* leave it off */
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    if (!signedIn) {
      // Signed-out users have no server watchlist; clear without a fetch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setItems([]);
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const legacy = readLegacyLocal();
        let res = await fetch("/api/watchlist");
        // A watchlist saved before this feature required an account moves into
        // the account, then the local copy is dropped so it can't resurrect.
        if (res.ok && legacy.length) {
          const merge = await fetch("/api/watchlist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: legacy }),
          });
          if (merge.ok) {
            try {
              localStorage.removeItem(STORAGE_KEY);
            } catch {
              /* it'll just merge again next time, which is a no-op */
            }
            res = merge;
          }
        }
        const data = await res.json().catch(() => null);
        if (!cancelled && res.ok && data?.items) setItems(sanitize(data.items));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, signedIn]);

  // Every mutation applies locally first so the UI responds immediately, and
  // rolls back if the server rejects the change.
  const persist = useCallback(
    async (next, request) => {
      if (!signedIn) return { error: "Create an account to save a watchlist." };
      const previous = items;
      setItems(next);
      const res = await request().catch(() => null);
      const data = await res?.json().catch(() => null);
      if (!res?.ok) {
        setItems(previous);
        return { error: data?.error ?? "Couldn't reach the server. Please try again." };
      }
      if (data?.items) setItems(sanitize(data.items));
      return {};
    },
    [items, signedIn]
  );

  const add = useCallback(
    (entry) => {
      const symbol = normalizeSymbol(entry?.symbol);
      if (!isValidSymbol(symbol)) {
        return Promise.resolve({ error: "That doesn't look like a ticker." });
      }
      if (items.some((i) => i.symbol === symbol)) {
        return Promise.resolve({ error: `${symbol} is already on your watchlist.` });
      }
      if (items.length >= MAX_WATCHLIST_ITEMS) {
        return Promise.resolve({
          error: `A watchlist holds up to ${MAX_WATCHLIST_ITEMS} tickers.`,
        });
      }
      const item = { symbol, name: normalizeName(entry?.name) };
      return persist([...items, item], () =>
        fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item),
        })
      );
    },
    [items, persist]
  );

  const remove = useCallback(
    (raw) => {
      const symbol = normalizeSymbol(raw);
      return persist(
        items.filter((i) => i.symbol !== symbol),
        () => fetch(`/api/watchlist?symbol=${encodeURIComponent(symbol)}`, { method: "DELETE" })
      );
    },
    [items, persist]
  );

  // `symbols` is the whole list in its new order, as dragged.
  const reorder = useCallback(
    (symbols) => {
      const bySymbol = new Map(items.map((i) => [i.symbol, i]));
      const next = symbols.map((s) => bySymbol.get(s)).filter(Boolean);
      if (next.length !== items.length) return Promise.resolve({});
      return persist(next, () =>
        fetch("/api/watchlist", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbols }),
        })
      );
    },
    [items, persist]
  );

  // How many shares of one holding. Cleared back to "watched, not owned" by
  // passing nothing, which is what an emptied box sends.
  const setShares = useCallback(
    (raw, value) => {
      const symbol = normalizeSymbol(raw);
      const shares = normalizeShares(value);
      if (!items.some((i) => i.symbol === symbol)) return Promise.resolve({});
      return persist(
        items.map((i) => (i.symbol === symbol ? { ...i, shares } : i)),
        () =>
          fetch("/api/watchlist", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ symbol, shares }),
          })
      );
    },
    [items, persist]
  );

  const setTape = useCallback((next) => {
    setTapeEnabled(next);
    try {
      localStorage.setItem(TAPE_KEY, next ? "1" : "0");
    } catch {
      /* the bar still switches for this session */
    }
  }, []);

  const value = useMemo(
    () => ({
      items,
      loading: loading || authLoading,
      signedIn,
      authLoading,
      tapeEnabled,
      add,
      remove,
      reorder,
      setShares,
      setTape,
    }),
    [
      items,
      loading,
      authLoading,
      signedIn,
      tapeEnabled,
      add,
      remove,
      reorder,
      setShares,
      setTape,
    ]
  );

  return <WatchlistContext.Provider value={value}>{children}</WatchlistContext.Provider>;
}

export function useWatchlist() {
  const ctx = useContext(WatchlistContext);
  if (!ctx) throw new Error("useWatchlist must be used inside <WatchlistProvider>");
  return ctx;
}
