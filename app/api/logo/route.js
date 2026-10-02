// Logos are served through here rather than straight from the CDN, but the art
// itself is passed along byte for byte - whatever background the brand ships
// with is the background that renders. This route exists for the two things
// the CDN gets wrong for us, not to retouch anything:
//
//   1. Share classes. The CDN spells them with a dash while the earnings feed
//      (and the rest of this app) uses a dot, so BF.B has to be asked for as
//      BF-B or it 404s - as every dual-class line did: BRK, BF, HEI, PBR.
//   2. Symbols with no art at all. A few recent listings and small foreign
//      lines resolve nowhere, and a grid with holes in it looks broken, so
//      those get a drawn tile instead of an error.
const UPSTREAM = "https://assets.parqet.com/logos/symbol";
const MAX_SIZE = 256;

function upstreamCandidates(symbol) {
  const names = [symbol];
  if (symbol.includes(".")) names.push(symbol.replace(/\./g, "-"));
  return names;
}

// Letters as vector strokes on a 6x10 grid, so the fallback tile does not
// depend on a font being installed. It previously asked for Segoe UI/Arial in
// an SVG <text>; the deploy box has neither, so the label rendered as tofu -
// MMED and VSXY came back as blank coloured squares. Paths always draw.
const GLYPHS = {
  A: "M0 10 L3 0 L6 10 M1 6 L5 6",
  B: "M0 0 L0 10 M0 0 L4 0 Q6 0 6 2.5 Q6 5 4 5 L0 5 M0 5 L4 5 Q6 5 6 7.5 Q6 10 4 10 L0 10",
  C: "M6 1 Q3 -1 1 2 Q0 5 1 8 Q3 11 6 9",
  D: "M0 0 L0 10 M0 0 L3 0 Q6 0 6 5 Q6 10 3 10 L0 10",
  E: "M6 0 L0 0 L0 10 L6 10 M0 5 L4 5",
  F: "M6 0 L0 0 L0 10 M0 5 L4 5",
  G: "M6 1 Q3 -1 1 2 Q0 5 1 8 Q3 11 6 9 L6 5.5 L3.5 5.5",
  H: "M0 0 L0 10 M6 0 L6 10 M0 5 L6 5",
  I: "M1 0 L5 0 M3 0 L3 10 M1 10 L5 10",
  J: "M5 0 L5 7.5 Q5 10 2.5 10 Q0 10 0 8",
  K: "M0 0 L0 10 M6 0 L0 5.5 M2 4 L6 10",
  L: "M0 0 L0 10 L6 10",
  M: "M0 10 L0 0 L3 5 L6 0 L6 10",
  N: "M0 10 L0 0 L6 10 L6 0",
  O: "M3 0 Q0 0 0 5 Q0 10 3 10 Q6 10 6 5 Q6 0 3 0",
  P: "M0 10 L0 0 L4 0 Q6 0 6 3 Q6 6 4 6 L0 6",
  Q: "M3 0 Q0 0 0 5 Q0 10 3 10 Q6 10 6 5 Q6 0 3 0 M4 7 L6.5 10.5",
  R: "M0 10 L0 0 L4 0 Q6 0 6 3 Q6 6 4 6 L0 6 M3.5 6 L6 10",
  S: "M6 1 Q3 -1 1 1.5 Q0 4 3 5 Q6 6 5 8.5 Q3 11 0 9",
  T: "M0 0 L6 0 M3 0 L3 10",
  U: "M0 0 L0 7 Q0 10 3 10 Q6 10 6 7 L6 0",
  V: "M0 0 L3 10 L6 0",
  W: "M0 0 L1.5 10 L3 4 L4.5 10 L6 0",
  X: "M0 0 L6 10 M6 0 L0 10",
  Y: "M0 0 L3 5 L6 0 M3 5 L3 10",
  Z: "M0 0 L6 0 L0 10 L6 10",
  0: "M3 0 Q0 0 0 5 Q0 10 3 10 Q6 10 6 5 Q6 0 3 0 M1 9 L5 1",
  1: "M1 2 L3 0 L3 10 M1 10 L5 10",
  2: "M0 2 Q1 -1 4 0.5 Q7 2 4 5 L0 10 L6 10",
  3: "M0 1 Q3 -1 5 1.5 Q6 4 3 5 Q6 6 5 8.5 Q3 11 0 9",
  4: "M4.5 10 L4.5 0 L0 7 L6 7",
  5: "M6 0 L1 0 L0.5 4.5 Q3 3 5 5 Q6 7.5 4 9.5 Q2 11 0 9",
  6: "M5 0 Q1 1 0.5 6 Q0.5 10 3 10 Q6 10 6 7 Q6 4 3 4 Q1 4 0.6 6",
  7: "M0 0 L6 0 L2 10",
  8: "M3 0 Q0.5 0 0.5 2.5 Q0.5 5 3 5 Q5.5 5 5.5 2.5 Q5.5 0 3 0 M3 5 Q0 5 0 7.5 Q0 10 3 10 Q6 10 6 7.5 Q6 5 3 5",
  9: "M1 10 Q5 9 5.5 4 Q5.5 0 3 0 Q0 0 0 3 Q0 6 3 6 Q5 6 5.4 4",
  ".": "M2.5 9 L3.5 9 L3.5 10 L2.5 10 Z",
  "-": "M1 5 L5 5",
};

// Last resort: draw the ticker. The colour is picked from the symbol so a
// given company keeps the same tile between visits. Served as SVG: Workers have
// no native image encoder, and the tile is vector art that needs no rasterizing.
function monogramSvg(symbol, size) {
  let hash = 0;
  for (const char of symbol) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const hue = hash % 360;

  const text = [...symbol.slice(0, 4)].filter((char) => GLYPHS[char]);
  const count = text.length || 1;
  // Fit the word to ~72% of the tile: each glyph is 6 wide plus a 2 gap.
  const unit = (size * 0.72) / (count * 8 - 2);
  const wordWidth = (count * 8 - 2) * unit;
  const left = (size - wordWidth) / 2;
  const top = (size - 10 * unit) / 2;

  const letters = text
    .map((char, index) => {
      const x = left + index * 8 * unit;
      return `<path d="${GLYPHS[char]}" transform="translate(${x.toFixed(2)} ${top.toFixed(2)}) scale(${unit.toFixed(4)})"/>`;
    })
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="hsl(${hue} 42% 32%)"/>
    <g fill="none" stroke="#ffffff" stroke-width="1.35"
       stroke-linecap="round" stroke-linejoin="round">${letters}</g>
  </svg>`;
  return svg;
}

// Content-Type is pinned rather than echoed from upstream. The CDN is a third
// party, and reflecting a header it controls would let it decide how browsers
// interpret a response served from our own origin; it always answers image/png
// anyway, and anything that is not a PNG is not something we want to render.
// X-Content-Type-Options stops a browser sniffing past the declared type.
const imageResponse = (body, type = "image/png") =>
  new Response(body, {
    headers: {
      "Content-Type": type,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=2592000, immutable",
    },
  });

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const symbol = (params.get("symbol") || "").trim().toUpperCase();
  if (!/^[A-Z0-9.\-^]{1,12}$/.test(symbol)) {
    return Response.json({ error: "Bad symbol." }, { status: 400 });
  }
  const size = Math.min(Number(params.get("size")) || 128, MAX_SIZE);

  for (const name of upstreamCandidates(symbol)) {
    try {
      const response = await fetch(`${UPSTREAM}/${encodeURIComponent(name)}?format=png&size=${size}`, {
        next: { revalidate: 60 * 60 * 24 * 30 },
      });
      if (response.ok) return imageResponse(await response.arrayBuffer());
    } catch {
      // Try the next spelling; the monogram below covers exhausting them all.
    }
  }

  return imageResponse(monogramSvg(symbol, size), "image/svg+xml");
}
