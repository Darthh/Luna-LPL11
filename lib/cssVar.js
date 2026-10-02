export function cssVar(name) {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function hexToRgba(hex, alpha) {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const channels = (hex) => {
  const n = parseInt((hex || "").replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export function mixHex(from, to, t) {
  const a = channels(from);
  const b = channels(to);
  return `#${a
    .map((c, i) => Math.round(c + (b[i] - c) * t).toString(16).padStart(2, "0"))
    .join("")}`;
}

// Whether a color is dark enough to need the light-on-dark version of a
// palette. Nineteen themes set their own surfaces, so charts that carry fixed
// hues ask the surface itself rather than keeping a list of which themes are
// dark. Rec. 601 luma is plenty for a light/dark decision.
export function isDarkColor(hex) {
  const n = parseInt((hex || "").replace("#", ""), 16);
  if (!Number.isFinite(n)) return true;
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}
