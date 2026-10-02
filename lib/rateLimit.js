// Fixed-window rate limiter for API routes. Counters live in this server
// instance's memory: they reset on restart/redeploy and aren't shared
// across instances, which is fine for a single-instance deployment. Swap
// for a store like Upstash/Redis if this ever runs on multiple instances.

const WINDOW_MS = 60 * 60 * 1000; // 1 hour

// Requests per window. Signing in raises the cap - this is the "accounts
// get more API calls" perk, keyed per user instead of per IP.
export const ANON_LIMIT = 60;
export const SIGNED_IN_LIMIT = 600;

const buckets = new Map();

export function checkRateLimit(key, limit, windowMs = WINDOW_MS) {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  // Opportunistic cleanup so abandoned keys don't accumulate forever.
  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) {
      if (now >= b.resetAt) buckets.delete(k);
    }
  }

  bucket.count += 1;
  return {
    ok: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
  };
}
