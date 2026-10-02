import assert from "node:assert/strict";
import { INDEXABLE_PAGES } from "../lib/seoPages.js";

assert.equal(new Set(INDEXABLE_PAGES.map((entry) => entry.path)).size, INDEXABLE_PAGES.length);
for (const entry of INDEXABLE_PAGES) {
  assert.match(entry.path, /^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/);
  assert.ok(["daily", "weekly", "monthly", "yearly"].includes(entry.changeFrequency));
  assert.ok(entry.priority >= 0 && entry.priority <= 1);
}
console.log(`SEO checks passed for ${INDEXABLE_PAGES.length} canonical URLs.`);
