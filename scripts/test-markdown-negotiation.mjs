// Accept: text/markdown must return markdown at the same URL, and a browser
// must still get HTML. The browser case is the one that breaks quietly: a
// naive substring check on Accept sends Chrome a .md file, because browsers
// list */* and some list markdown outright.
//
// Run against a running server:  node scripts/test-markdown-negotiation.mjs [base-url]
import assert from "node:assert/strict";

const base = process.argv[2] ?? "https://lunaterminal.com";
const get = (accept) => fetch(base + "/", accept ? { headers: { Accept: accept } } : undefined);
const ctype = (res) => res.headers.get("content-type")?.split(";")[0].trim();

const md = await get("text/markdown");
assert.equal(md.status, 200);
assert.equal(ctype(md), "text/markdown");
assert.ok(md.headers.get("x-markdown-tokens"), "x-markdown-tokens should be present");
assert.match(md.headers.get("vary") ?? "", /accept/i, "must Vary on Accept or caches will cross the wires");

const body = await md.text();
assert.match(body, /^# /m, "markdown needs a heading");
assert.ok(!/<div|<span|<script/i.test(body), "markdown must not carry HTML markup");

// HTML stays the default.
assert.equal(ctype(await get(null)), "text/html", "no Accept header should serve HTML");
assert.equal(
  ctype(await get("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")),
  "text/html",
  "a browser Accept must serve HTML"
);
// A browser that lists markdown after HTML still wants the page.
assert.equal(ctype(await get("text/html,text/markdown;q=0.1")), "text/html");

console.log(`markdown negotiation: ok (${base})`);
