// The shared parts of a treemap-style stock map: the period scale, the
// red-to-green performance color, and the sector → industry → tile layout.
//
// Extracted from components/StockMap.jsx when the fund pages grew a map of
// their own. Both maps draw the same picture off different books - the index
// maps size tiles by market cap, a fund's by what it reported owning - so the
// layout and the color belong here rather than in either component.
import { squarify } from "@/lib/treemap";

export const MAP_PERIODS = [
  { key: "1d", label: "1-Day" },
  { key: "1m", label: "1-Month" },
  { key: "3m", label: "3-Month" },
  { key: "6m", label: "6-Month" },
  { key: "1y", label: "1-Year" },
  { key: "2y", label: "2-Year" },
  { key: "3y", label: "3-Year" },
];

// Color scale bounds: the move that saturates the scale for each period. A
// longer horizon needs a wider scale or every tile pins to full green.
export const SCALE_MAX = { "1d": 3, "1m": 10, "3m": 20, "6m": 30, "1y": 50, "2y": 75, "3y": 100 };

// Finviz-style palette: red → neutral slate → green.
const NEG = [246, 53, 56];
const MID = [65, 69, 84];
const POS = [48, 204, 90];
export const NO_DATA = "#33363f";

export function perfColor(perf, period) {
  if (perf == null || !Number.isFinite(perf)) return NO_DATA;
  const t = Math.max(-1, Math.min(1, perf / SCALE_MAX[period]));
  const to = t >= 0 ? POS : NEG;
  const k = Math.abs(t);
  const rgb = MID.map((c, i) => Math.round(c + (to[i] - c) * k));
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

export function formatPerf(perf) {
  if (perf == null || !Number.isFinite(perf)) return "n/a";
  const abs = Math.abs(perf);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return `${perf >= 0 ? "+" : ""}${perf.toFixed(digits)}%`;
}

export const SECTOR_HEADER = 19;
export const INDUSTRY_LABEL = 13;
// Gutters carved around sector and industry blocks so group boundaries read at
// a glance.
const SECTOR_GAP = 4;
const INDUSTRY_GAP = 3;

// Builds the flat lists of sector headers, industry labels and stock tiles at
// the given pixel size. `sizeOf` returns the value a tile's area is
// proportional to - market cap on an index map, reported value on a fund's.
export function buildMapLayout(stocks, width, height, sizeOf = (s) => s.cap) {
  const sectors = new Map();
  for (const stock of stocks) {
    if (!sectors.has(stock.sector)) sectors.set(stock.sector, new Map());
    const industries = sectors.get(stock.sector);
    // The issuers' holdings files classify to sector only, so those maps have
    // one industry group per sector.
    const industry = stock.industry || stock.sector;
    if (!industries.has(industry)) industries.set(industry, []);
    industries.get(industry).push(stock);
  }

  const sectorItems = [...sectors.entries()]
    .map(([name, industries]) => ({
      name,
      industries,
      value: [...industries.values()].flat().reduce((a, s) => a + (sizeOf(s) || 0), 0),
    }))
    .sort((a, b) => b.value - a.value);

  const headers = [];
  const labels = [];
  const tiles = [];

  for (const rect of squarify(sectorItems, 0, 0, width, height)) {
    const sector = rect.item;
    // Inset the sector block to carve the outer gutter.
    const x = rect.x + SECTOR_GAP / 2;
    const y = rect.y + SECTOR_GAP / 2;
    const w = Math.max(rect.w - SECTOR_GAP, 1);
    const h = Math.max(rect.h - SECTOR_GAP, 1);
    let innerY = y;
    let innerH = h;
    if (w >= 70 && h >= 55) {
      headers.push({ name: sector.name, x, y, w });
      innerY += SECTOR_HEADER;
      innerH -= SECTOR_HEADER;
    }

    const industryItems = [...sector.industries.entries()]
      .map(([name, group]) => ({
        name,
        group,
        value: group.reduce((a, s) => a + (sizeOf(s) || 0), 0),
      }))
      .sort((a, b) => b.value - a.value);

    for (const iRect of squarify(industryItems, x, innerY, w, innerH)) {
      const industry = iRect.item;
      const ix = iRect.x + INDUSTRY_GAP / 2;
      const iy = iRect.y + INDUSTRY_GAP / 2;
      const iw = Math.max(iRect.w - INDUSTRY_GAP, 1);
      const ih = Math.max(iRect.h - INDUSTRY_GAP, 1);
      let tilesY = iy;
      let tilesH = ih;
      // A lone industry named after its own sector would just repeat the
      // header underneath it.
      const echoesSector = sector.industries.size === 1 && industry.name === sector.name;
      if (iw >= 80 && ih >= 60 && !echoesSector) {
        labels.push({ name: industry.name, x: ix, y: iy, w: iw });
        tilesY += INDUSTRY_LABEL;
        tilesH -= INDUSTRY_LABEL;
      }
      const stockItems = industry.group.map((s) => ({ ...s, value: sizeOf(s) || 0 }));
      for (const tRect of squarify(stockItems, ix, tilesY, iw, tilesH)) {
        tiles.push({ stock: tRect.item, x: tRect.x, y: tRect.y, w: tRect.w, h: tRect.h });
      }
    }
  }

  return { headers, labels, tiles };
}

// A personal map starts with the positions the user can already see priced in
// the watchlist. Profile data adds grouping and display detail, but is not an
// admission list: recent listings, funds, and symbols Yahoo cannot describe
// must still keep their dollar-weighted tile.
export function buildPortfolioMapStocks(holdings, described = []) {
  const profiles = new Map(described.map((stock) => [stock.symbol, stock]));

  return holdings
    .filter((holding) => Number.isFinite(holding.value) && holding.value > 0)
    .map((holding) => {
      const profile = profiles.get(holding.symbol);
      const sector = profile?.sector || "Other";
      return {
        ...profile,
        symbol: holding.symbol,
        name: profile?.name || holding.name || holding.symbol,
        sector,
        industry: profile?.industry || sector,
        value: holding.value,
      };
    })
    .sort((a, b) => b.value - a.value);
}

// A tile is only worth labelling if the text fits inside it. These are the
// floor font sizes and the approximate glyph width of each line as a fraction
// of its font size, which is what decides whether it does.
export const MIN_SYMBOL_FONT = 6.5;
export const MIN_PERF_FONT = 5.5;
export const SYMBOL_CHAR_W = 0.66;
export const PERF_CHAR_W = 0.58;

// What a tile can show at its size: the ticker shrinks to fit rather than
// disappearing, and the performance line only joins it when both fit stacked.
export function tileText(symbol, w, h, perfText) {
  const fontSize = Math.max(MIN_SYMBOL_FONT, Math.min(w / (symbol.length * 0.8), h * 0.4, 27));
  const showSymbol = w >= symbol.length * fontSize * SYMBOL_CHAR_W + 2 && h >= fontSize * 1.2;
  const perfFont = Math.max(MIN_PERF_FONT, fontSize * 0.55);
  const showPerf =
    showSymbol &&
    w >= perfText.length * perfFont * PERF_CHAR_W + 2 &&
    h >= fontSize * 1.2 + perfFont * 1.35;
  return { fontSize, showSymbol, perfFont, showPerf };
}
