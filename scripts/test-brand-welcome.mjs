import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [welcome, styles, manifest, brandMark, appIcon, publicIcon] = await Promise.all([
  readFile(new URL("../components/WelcomeHome.jsx", import.meta.url), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  readFile(new URL("../app/manifest.js", import.meta.url), "utf8"),
  readFile(new URL("../public/brand/luna-mark-light.png", import.meta.url)),
  readFile(new URL("../app/icon1.png", import.meta.url)).catch(() => null),
  readFile(new URL("../public/brand/luna-icon-256.png", import.meta.url)).catch(() => null),
]);

assert.match(
  welcome,
  /<section className="intro-hero intro-film"[\s\S]*?<video[\s\S]*?<div className="intro-hero-content"/,
  "the About page should open with the moon film and place its welcome copy inside the film"
);
assert.match(styles, /html\[data-theme="luna"\] header\.site\s*{[^}]*background:\s*#081D4D;/i);
assert.match(styles, /\.intro-hero-content\s*>\s*\*\s*{[^}]*animation:/);
assert.match(styles, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.intro-hero-content\s*>\s*\*/);
assert.match(manifest, /theme_color:\s*"#081D4D"/);
assert.match(manifest, /src:\s*"\/brand\/luna-icon-256\.png"/);
assert.doesNotMatch(manifest, /src:\s*"\/icon\.png"/);

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
assert.ok(publicIcon, "the manifest icon should use its own non-conflicting public URL");
assert.ok(appIcon, "the browser icon should use the non-conflicting app/icon1.png convention");
for (const [name, asset] of [
  ["transparent brand mark", brandMark],
  ["Next app icon", appIcon],
  ["manifest icon", publicIcon],
]) {
  assert.ok(asset.subarray(0, 8).equals(pngSignature), `${name} should be a PNG`);
}
assert.notDeepEqual(appIcon, publicIcon, "app and manifest icons should be independently sized assets");

console.log("Brand and welcome checks passed.");
