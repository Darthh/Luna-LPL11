// The logo route falls back to a drawn tile when the CDN has no art. Sharp used
// to rasterize it, which is a native binary Workers cannot load - the import
// alone 500'd every logo request. The tile is SVG now; this pins that it stays
// dependency-free, well-formed, and deterministic per symbol.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../app/api/logo/route.js", import.meta.url), "utf8");
assert.ok(!/\bsharp\b/.test(source), "route must not reference sharp: it cannot run on Workers");

const { GET } = await import("../app/api/logo/route.js");
const call = (symbol) => GET(new Request(`https://x/api/logo?symbol=${symbol}`));

// A symbol the CDN has no art for falls through to the monogram.
const res = await call("ZZZZNOTAREALTICKER".slice(0, 12));
assert.equal(res.status, 200);
assert.equal(res.headers.get("Content-Type"), "image/svg+xml");
const svg = await res.text();
assert.match(svg, /^<svg /, "monogram must be an SVG document");
assert.match(svg, /<path d="M/, "letters draw as paths, not font-dependent <text>");

// Same symbol, same colour, so a company keeps its tile between visits.
assert.equal(await (await call("ZZQQ")).text(), await (await call("ZZQQ")).text());

// Bad input is rejected rather than proxied upstream.
assert.equal((await call("../etc")).status, 400);

console.log("logo monogram: ok");
