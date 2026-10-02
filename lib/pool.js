// Runs `fn` over `items` with at most `concurrency` in flight, returning the
// results in input order. Every upstream here (Yahoo quotes, Yahoo profiles,
// the chunked map feed) starts refusing requests when a few hundred go out at
// once, so nothing fans out unbounded.
//
// `fn` is expected to handle its own failures - a rejection here rejects the
// whole batch, which is what the callers that don't catch actually want.
// Pacing's other half: a backoff between retries, and the gap the SEC's rate
// limiter wants between requests. Zero and below resolve without yielding to
// the event loop at all, because the EDGAR gate asks for a wait far more often
// than it asks for a real one.
export const sleep = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

export async function pool(items, concurrency, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    })
  );
  return out;
}
