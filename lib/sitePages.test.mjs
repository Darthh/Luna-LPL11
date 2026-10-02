import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { SITE_PAGES, findPages } from "./sitePages.js";

const top = (q) => findPages(q)[0]?.path;

test("routes a real question to the page that answers it", () => {
  assert.equal(top("where can I see hedge fund 13f holdings"), "/hedge-funds");
  assert.equal(top("when does NVDA report earnings"), "/earnings-calendar");
  assert.equal(top("how do I save the tickers I follow"), "/watchlist");
  assert.equal(top("notify me when it crosses 30"), "/alerts");
  assert.equal(top("compare two portfolios side by side"), "/portfolio-comparison");
});

test("routes global index and commodity questions to global markets", () => {
  assert.equal(findPages("global index and commodity prices", 1)[0]?.path, "/global-markets");
});

test("returns nothing rather than a bad guess", () => {
  assert.deepEqual(findPages("asdfghjkl"), []);
  assert.deepEqual(findPages(""), []);
  // A question of pure stop words must not match every page at score zero.
  assert.deepEqual(findPages("what is it"), []);
});

test("every page is a usable link", () => {
  for (const p of SITE_PAGES) assert.match(p.path, /^\//);
  assert.ok(findPages("stock chart", 2).length <= 2);
});

// The whole point of this corpus is sending people somewhere real. A page that
// gets renamed or removed should fail here rather than become a 404 that only
// Lilo hands out. Skipped when there is no build to check against.
test("every path is a route that exists", async (t) => {
  let manifest;
  try {
    manifest = JSON.parse(await readFile("./.next/routes-manifest.json", "utf8"));
  } catch {
    return t.skip("no .next build to check against - run `next build` first");
  }
  const statics = new Set(manifest.staticRoutes.map((r) => r.page));
  const dynamic = manifest.dynamicRoutes.map((r) => new RegExp(r.regex));
  for (const page of SITE_PAGES) {
    // A hash link points at a section of the page before the "#".
    const path = page.path.split("#")[0].replace(/\/$/, "") || "/";
    const known = statics.has(path) || dynamic.some((re) => re.test(path));
    assert.ok(known, `${page.path} is not a route on this site`);
  }
});
