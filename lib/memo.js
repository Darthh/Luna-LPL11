// A keyed in-memory memo: a TTL, dedupe for concurrent callers on a cold key,
// and an optional ceiling on how many entries it holds.
//
// Everything held behind one of these is expensive to build and cheap to keep
// - twenty EDGAR round trips for the manager list, 130 chunks of Yahoo quotes
// for a full index map, a screener POST that Next's data cache refuses to
// store because it isn't a GET. The inflight half matters as much as the TTL:
// without it the first burst of callers on a cold key each start their own
// build, which is how one cold start turns into twenty.
//
// Entries live in this server instance's memory, so they go on redeploy and
// aren't shared across instances - the CDN cache headers in front of these
// routes are what covers that. A rejected build is never cached; the inflight
// entry clears and the next caller retries.
export function memo(ttlMs, { max = Infinity } = {}) {
  const cache = new Map();
  const inflight = new Map();

  return function cached(key, build) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return Promise.resolve(hit.value);

    const pending = inflight.get(key);
    if (pending) return pending;

    const run = build()
      .then((value) => {
        // Deleted before being set so insertion order stays age order: Map.set
        // on a key that already exists keeps its original position, which
        // would make a just-refreshed entry the first one evicted below.
        cache.delete(key);
        cache.set(key, { at: Date.now(), value });
        for (const oldest of cache.keys()) {
          if (cache.size <= max) break;
          cache.delete(oldest);
        }
        return value;
      })
      .finally(() => inflight.delete(key));

    inflight.set(key, run);
    return run;
  };
}
