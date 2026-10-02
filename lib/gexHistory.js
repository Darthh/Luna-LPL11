// 0DTE max-Net-GEX snapshots, polled site-wide by RsiLeNotifier and drawn on
// the RsiLE chart. The series is stored server-side so every visitor sees the
// same yellow dots, including one whose browser has never had the chart open;
// a localStorage copy is kept purely as a cache so the chart can paint
// immediately on mount instead of waiting for the first round trip.
export const GEX_HISTORY_EVENT = "spy-gex-history";
export const GEX_POLL_MS = 20_000;

const historyKey = (symbol) => `${symbol.toLowerCase()}-0dte-gex-history-v2`;

function cache(symbol, points) {
  try {
    localStorage.setItem(historyKey(symbol), JSON.stringify(points));
  } catch {}
}

// Synchronous, so the chart has something to draw on its very first render.
// This is only a cache of the shared server series, never a source of truth:
// the key is versioned so the old per-browser v1 histories are not resurrected.
export function readGexHistory(symbol = "SPY") {
  try {
    const saved = JSON.parse(localStorage.getItem(historyKey(symbol)) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function publish(symbol, history) {
  cache(symbol, history);
  window.dispatchEvent(new CustomEvent(GEX_HISTORY_EVENT, { detail: { symbol, history } }));
  return history;
}

// One poll per symbol at a time. Two components ask for this - the chart on
// mount and the site-wide notifier on its interval - and in dev StrictMode
// double-invokes both effects, so the same GET and the same sampling POST were
// going out four times on a single page load. Callers share the in-flight
// promise instead, which is also what keeps a slow poll from overlapping the
// next interval tick.
const inFlight = new Map();

// Returns the new series when the shared history moved, otherwise null.
export function pollGexHistory(symbol = "SPY") {
  const running = inFlight.get(symbol);
  if (running) return running;
  const poll = runPoll(symbol).finally(() => inFlight.delete(symbol));
  inFlight.set(symbol, poll);
  return poll;
}

async function runPoll(symbol) {
  let shared = null;
  try {
    const stored = await fetch(`/api/spy-gex/history?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" }).then((r) => r.json());
    if (Array.isArray(stored.points)) {
      const local = readGexHistory(symbol);
      shared = stored.points;
      // Only wake the chart when the server actually knows something new.
      if (stored.points.length !== local.length || stored.points.at(-1)?.t !== local.at(-1)?.t) {
        publish(symbol, stored.points);
      }
    }
  } catch {
    // Fall through to the live poll; a stored-history outage is not fatal.
  }

  // The server samples the option chain itself; this POST only nudges it, so a
  // crafted request cannot write a bogus strike into the shared series.
  try {
    const saved = await fetch(`/api/spy-gex/history?symbol=${encodeURIComponent(symbol)}`, {
      method: "POST",
      cache: "no-store",
    }).then((r) => r.json());
    if (!Array.isArray(saved.points)) return shared;
    const local = shared ?? readGexHistory(symbol);
    if (saved.points.length === local.length && saved.points.at(-1)?.t === local.at(-1)?.t) return shared;
    return publish(symbol, saved.points);
  } catch {
    // The chart remains fully usable when the options feed is closed.
    return shared;
  }
}
