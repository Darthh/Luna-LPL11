// Fixed-window rate limiter for API routes.
//
// On AWS, Lambda runs many instances at once, so a per-instance counter lets
// a visitor through N times the cap - and the paid routes (AI chat, Exa
// research) are what this guards. With RATE_LIMIT_TABLE set, the count is one
// atomic DynamoDB counter per key and window, shared by every instance, and
// DynamoDB deletes it when the window has passed (TTL on `expiresAt`).
//
// Without the table - local dev, tests, a deploy without LUNA_DATA - counters
// live in this process's memory, as before. If DynamoDB errors, the request is
// judged by the memory counter instead: an outage of the limiter should not
// turn into an outage of the site.

const WINDOW_MS = 60 * 60 * 1000; // 1 hour

// Requests per window. Signing in raises the cap - this is the "accounts
// get more API calls" perk, keyed per user instead of per IP.
export const ANON_LIMIT = 60;
export const SIGNED_IN_LIMIT = 600;

const buckets = new Map();

function verdict(count, limit, resetAt, now) {
  return {
    ok: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: Math.ceil((resetAt - now) / 1000),
  };
}

export function checkRateLimitInMemory(key, limit, windowMs = WINDOW_MS, now = Date.now()) {
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
  return verdict(bucket.count, limit, bucket.resetAt, now);
}

let shared; // { doc, UpdateCommand, table } once loaded, null when not configured

async function sharedStore() {
  if (shared !== undefined) return shared;
  const table = process.env.RATE_LIMIT_TABLE;
  if (!table) return (shared = null);
  const [{ DynamoDBClient }, { DynamoDBDocumentClient, UpdateCommand }] = await Promise.all([
    import("@aws-sdk/client-dynamodb"),
    import("@aws-sdk/lib-dynamodb"),
  ]);
  return (shared = { doc: DynamoDBDocumentClient.from(new DynamoDBClient({})), UpdateCommand, table });
}

// Exposed for tests: point the limiter at a given table/client.
export function useSharedStore(store) {
  shared = store;
}

export async function checkRateLimit(key, limit, windowMs = WINDOW_MS) {
  const now = Date.now();
  const store = await sharedStore().catch(() => null);
  if (!store) return checkRateLimitInMemory(key, limit, windowMs, now);

  // Windows are aligned to the clock, so every instance agrees on which one
  // a request falls in without coordinating.
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetAt = windowStart + windowMs;
  try {
    const out = await store.doc.send(
      new store.UpdateCommand({
        TableName: store.table,
        Key: { PK: `RL#${key}`, SK: `W#${windowStart}` },
        UpdateExpression: "ADD #count :one SET expiresAt = if_not_exists(expiresAt, :expires)",
        ExpressionAttributeNames: { "#count": "count" },
        ExpressionAttributeValues: { ":one": 1, ":expires": Math.ceil(resetAt / 1000) + 60 },
        ReturnValues: "UPDATED_NEW",
      })
    );
    return verdict(out.Attributes.count, limit, resetAt, now);
  } catch (error) {
    console.error("rate limit store failed; using this instance's counter", error?.name || error);
    return checkRateLimitInMemory(key, limit, windowMs, now);
  }
}
