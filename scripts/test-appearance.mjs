// Self-check for the appearance preferences: `node scripts/test-appearance.mjs`.
// The failure this guards is the quiet one - a theme listed in the settings
// dropdown that has no palette in globals.css picks the page up in whatever
// theme it was already in, and a default background naming a pattern nothing
// implements just renders nothing. Neither throws, so neither shows up in a
// build.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  DEFAULTS,
  DENSITIES,
  FONTS,
  PATTERNS,
  THEMES,
  THEME_GROUPS,
  THEME_PATTERN,
} from "../lib/appearance.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// Palettes live in globals.css or in a theme's own stylesheet beside it
// (app/padres.css); the root layout imports both.
const css = readdirSync(join(root, "app"))
  .filter((f) => f.endsWith(".css"))
  .map((f) => readFileSync(join(root, "app", f), "utf8"))
  .join("\n");
const effects = readFileSync(join(root, "components/BackgroundEffects.jsx"), "utf8");

// The one light theme is the bare :root block, so it has no selector of its own.
for (const theme of THEMES) {
  if (theme !== "light") {
    assert.ok(css.includes(`html[data-theme="${theme}"]`), `no palette in globals.css for "${theme}"`);
  }
  assert.ok(THEME_PATTERN[theme], `no default background for "${theme}"`);
}

const patternNames = PATTERNS.map(([v]) => v);
for (const [theme, pattern] of Object.entries(THEME_PATTERN)) {
  assert.ok(patternNames.includes(pattern), `"${theme}" defaults to unknown background "${pattern}"`);
  assert.ok(THEMES.includes(theme), `default background set for unlisted theme "${theme}"`);
}

// Every background either animates on canvas or paints in CSS. "none" does
// neither, by definition.
for (const pattern of patternNames) {
  if (pattern === "none") continue;
  const drawn = effects.includes(`"${pattern}"(`) || effects.includes(`  ${pattern}(`);
  const painted = css.includes(`html[data-pattern="${pattern}"]`);
  assert.ok(drawn || painted, `background "${pattern}" is offered but never drawn`);
}

// The canvas effects read their colour with getComputedStyle, which hands back
// an unresolved `var(--x)` for any custom property declared that way. Assigning
// that to ctx.fillStyle is a silent no-op, so the effect keeps drawing in
// leftover black and disappears against a dark theme - it animates, invisibly.
// Both properties it reads therefore have to be literal colours everywhere.
const rules = css.replace(/\/\*[\s\S]*?\*\//g, ""); // comments discuss both properties
for (const prop of ["--bg-effect-color", "--accent"]) {
  const declared = [...rules.matchAll(new RegExp(`${prop}:\\s*([^;]+);`, "g"))].map((m) => m[1].trim());
  assert.ok(declared.length > 0, `${prop} is never declared`);
  for (const value of declared) {
    assert.ok(/^#[0-9a-f]{3,8}$/i.test(value), `${prop} must be a literal colour, got "${value}"`);
  }
}

// No duplicate values across the theme groups - a repeat means one of them
// can never be selected.
assert.equal(new Set(THEMES).size, THEMES.length, "a theme is listed in two groups");
assert.ok(THEME_GROUPS.every((g) => g.themes.length > 0));
assert.ok(!THEMES.includes("cute"), "Cute is no longer an available theme");
assert.ok(!THEMES.includes("terminal"), "Terminal is no longer an available theme");
assert.ok(!THEMES.includes("cyberpunk"), "Cyberpunk is no longer an available theme");
assert.ok(!THEMES.includes("retrowave"), "Retrowave is no longer an available theme");
assert.ok(!THEMES.includes("neon"), "Neon is no longer an available theme");
assert.ok(!THEMES.includes("organs"), "Organs is no longer an available theme");
assert.ok(!Object.hasOwn(THEME_PATTERN, "cute"), "Cute has no theme pattern");
assert.ok(!Object.hasOwn(THEME_PATTERN, "terminal"), "Terminal has no theme pattern");
assert.ok(!Object.hasOwn(THEME_PATTERN, "cyberpunk"), "Cyberpunk has no theme pattern");
assert.ok(!Object.hasOwn(THEME_PATTERN, "retrowave"), "Retrowave has no theme pattern");
assert.ok(!Object.hasOwn(THEME_PATTERN, "neon"), "Neon has no theme pattern");
assert.ok(!Object.hasOwn(THEME_PATTERN, "organs"), "Organs has no theme pattern");
assert.ok(THEME_GROUPS.find((group) => group.label === "Dark")?.themes.some(([value]) => value === "ume"), "Ume belongs in the Dark group");

// The defaults have to be selectable, or the settings menu opens on a value
// its own dropdown doesn't contain.
assert.ok(THEMES.includes(DEFAULTS.theme));
assert.ok(patternNames.includes(DEFAULTS.pattern));
assert.ok(
  DEFAULTS.pattern === "none" || DEFAULTS.pattern === THEME_PATTERN[DEFAULTS.theme],
  "the default pattern is either intentionally blank or matches the default theme"
);
assert.ok(FONTS[DEFAULTS.font]);
assert.ok(DENSITIES.some(([v]) => v === DEFAULTS.density));

// Densities other than the default have to change something.
for (const [density] of DENSITIES) {
  if (density === DEFAULTS.density) continue;
  const selector = `html[data-density="${density}"]`;
  const defaultSelector = `html[data-density="${DEFAULTS.density}"]`;
  assert.ok(
    css.includes(selector) || css.includes(defaultSelector),
    `density "${density}" does nothing`
  );
}

console.log(`ok - ${THEMES.length} themes, ${patternNames.length} backgrounds`);
