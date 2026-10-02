// Self-check for the shared route memo: `node scripts/test-memo.mjs`.
//
// Four route caches collapsed into lib/memo.js, so the failures worth pinning
// down are the ones that still look like a working cache from the outside: a
// burst of cold callers each starting their own build (which is what turns one
// cold start into twenty EDGAR round trips), a rejected build cached as though
// it were an answer, and an eviction order that discards the entry it has just
// refreshed instead of the stale one beside it.
import assert from "node:assert/strict";
import { memo } from "../lib/memo.js";

// A build that counts how many times it actually ran.
function counted(value) {
  const fn = async () => {
    fn.runs += 1;
    return typeof value === "function" ? value() : value;
  };
  fn.runs = 0;
  return fn;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Inside the TTL, the second caller is served without rebuilding.
{
  const cached = memo(10_000);
  const build = counted("a");
  assert.equal(await cached("k", build), "a");
  assert.equal(await cached("k", build), "a");
  assert.equal(build.runs, 1, "a hit inside the TTL must not rebuild");
}

// Past it, it rebuilds.
{
  const cached = memo(0);
  const build = counted("a");
  await cached("k", build);
  await cached("k", build);
  assert.equal(build.runs, 2, "an expired entry must rebuild");
}

// Keys don't collide.
{
  const cached = memo(10_000);
  assert.equal(await cached("a", counted(1)), 1);
  assert.equal(await cached("b", counted(2)), 2);
}

// The one that matters most: callers arriving on a cold key while a build is
// already in flight join it rather than starting their own.
{
  const cached = memo(10_000);
  let release;
  const build = counted(() => new Promise((r) => (release = () => r("slow"))));
  const all = [cached("k", build), cached("k", build), cached("k", build)];
  await Promise.resolve();
  release();
  assert.deepEqual(await Promise.all(all), ["slow", "slow", "slow"]);
  assert.equal(build.runs, 1, "concurrent cold callers must share one build");
}

// A rejection is not an answer: nothing is cached and the next caller retries.
{
  const cached = memo(10_000);
  let attempts = 0;
  const build = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("upstream down");
    return "recovered";
  };
  await assert.rejects(() => cached("k", build), /upstream down/);
  assert.equal(await cached("k", build), "recovered", "retry after a failed build");
  assert.equal(attempts, 2);
}

// `max` evicts oldest-first.
{
  const cached = memo(10_000, { max: 2 });
  await cached("a", counted(1));
  await cached("b", counted(2));
  await cached("c", counted(3));

  const a = counted(99);
  assert.equal(await cached("a", a), 99);
  assert.equal(a.runs, 1, "the oldest key should have been evicted");

  const c = counted(99);
  assert.equal(await cached("c", c), 3);
  assert.equal(c.runs, 0, "the newest key should still be held");
}

// Map.set on a key that already exists keeps its original position, so without
// the delete-before-set in memo() the entry just refreshed is the first one
// evicted while the stale neighbour it was meant to outlive stays.
{
  const cached = memo(30, { max: 2 });
  await cached("a", counted(1));
  await cached("b", counted(2));
  await sleep(40);

  // Both are stale; refreshing "a" makes it the youngest of the two.
  await cached("a", counted(1));
  // Over the ceiling, so this evicts the oldest - which is now "b", not "a".
  await cached("c", counted(3));

  const a = counted(99);
  assert.equal(await cached("a", a), 1);
  assert.equal(a.runs, 0, "a just-refreshed entry must survive eviction");

  const b = counted(99);
  assert.equal(await cached("b", b), 99);
  assert.equal(b.runs, 1, "the stale entry is the one that should have gone");
}

console.log("memo ok");
