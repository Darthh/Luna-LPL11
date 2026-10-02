// The donut every 13F page draws - one manager's book on the detail page, the
// quarter's buying on the list page. Shared so the two can't drift into two
// palettes and two tooltips for the same mark.
import { logoUrl } from "@/lib/companyLogo";
import { cssVar, isDarkColor, mixHex } from "@/lib/cssVar";
import { formatCap } from "@/lib/formatCap";
import { pct } from "@/lib/hedgeFundFormat";

// Eight categorical hues in a fixed order, stepped once for a light surface and
// once for a dark one. The order is the colorblind-safety mechanism rather than
// a preference: adjacent slices are the pairs a reader has to tell apart, and
// this ordering is the one that clears the separation gates in both modes.
const SERIES_LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const SERIES_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
// Twelve slices needs four more colors than there are safe hues. Rather than
// restep the whole palette, the first eight slices - the ones worth reading -
// keep the validated hues exactly, and only the overflow is derived, stepped
// away from the surface so it stays above 3:1 on it. Dark surfaces take the
// bigger step; light ones need a gentler one to hold their chroma.
//
// The step multiplies by which time round the eight hues a slice is, so the
// second wrap (slices 8-15) and the third (16-23) are distinct steps of the
// same hue rather than the same derived color twice. A single fixed step made
// slice 16 identical to slice 8, which only became reachable at twenty.
//
// Measured on the adjacent pairs at twelve: normal-vision separation 15.9 dark
// and 18.5 light, clear of the 15 floor, with every slice over 3:1 against a
// dark surface. Colorblind separation lands at 7.5-7.6, inside the band that is
// only legal with a second encoding - which is why every slice is named in the
// legend, the arcs carry a gap, hover names the slice and the table sits
// underneath. None of those are decoration here.
const OVERFLOW_STEP_DARK = 0.3;
const OVERFLOW_STEP_LIGHT = 0.24;

const SERIES_COUNT = 24;

// Read off the CSS variables, so a theme change rebuilds it.
export function donutPalette() {
  const surface = cssVar("--panel") || "#ffffff";
  const dark = isDarkColor(surface);
  const hues = dark ? SERIES_DARK : SERIES_LIGHT;
  const away = dark ? "#ffffff" : "#000000";
  const step = dark ? OVERFLOW_STEP_DARK : OVERFLOW_STEP_LIGHT;
  return {
    surface,
    series: Array.from({ length: SERIES_COUNT }, (_, i) =>
      i < hues.length
        ? hues[i]
        : mixHex(hues[i % hues.length], away, step * Math.floor(i / hues.length))
    ),
    other: cssVar("--text-soft") || "#808080",
    text: cssVar("--text") || "#000000",
    border: cssVar("--border") || "#cccccc",
  };
}

// The collapsed tail is grey wherever it appears, so it never reads as another
// named holding.
export const sliceColor = (palette) => (slice, i) =>
  slice.label === "Other" ? palette.other : palette.series[i % palette.series.length];

// ---------------------------------------------------------------------------
// Logos on the arcs with room for one
//
// A twenty-slice ring is mostly slivers two or three degrees wide, and a logo
// drawn on one of those spills across its neighbours and reads as belonging to
// whichever arc it covers most. So every arc is measured against the image
// first and only the ones that can hold it legibly get one; the rest are
// identified the way they already were, by the legend and on hover. That makes
// this decoration on top of a labelling scheme that works without it, which is
// the only reason it's safe to draw the small ones blank.
const LOGO_MIN_PX = 15;
const LOGO_MAX_PX = 30;
// Logos are mostly transparent PNGs drawn onto a saturated fill, so each one
// sits on a white disc. Without it half the palette swallows half the marks.
const LOGO_DISC = "#ffffff";

// One <img> per ticker for the life of the page, shared by both rings. A miss
// is cached as `null` so a symbol the CDN doesn't have isn't re-requested on
// every frame.
const logos = new Map();

function logoImage(ticker, onLoad) {
  if (logos.has(ticker)) return logos.get(ticker);
  const img = new Image();
  img.decoding = "async";
  img.onload = onLoad;
  img.onerror = () => logos.set(ticker, null);
  img.src = logoUrl(ticker);
  logos.set(ticker, img);
  return img;
}

export const arcLogos = {
  id: "arcLogos",
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    const arcs = chart.getDatasetMeta(0)?.data ?? [];
    chart.data.labels.forEach((label, i) => {
      // The collapsed tail is not a company and has no logo to draw.
      if (!label || label === "Other") return;
      const arc = arcs[i];
      if (!arc) return;
      const { startAngle, endAngle, innerRadius, outerRadius, x, y } = arc.getProps(
        ["startAngle", "endAngle", "innerRadius", "outerRadius", "x", "y"],
        true
      );
      // The box the arc actually offers: how far it runs along the ring at its
      // midline, and how thick the ring is. The image has to fit both.
      const radius = (innerRadius + outerRadius) / 2;
      const size = Math.min(
        radius * (endAngle - startAngle),
        outerRadius - innerRadius,
        LOGO_MAX_PX
      );
      if (size < LOGO_MIN_PX) return;

      const img = logoImage(label, () => chart.draw());
      // Still loading, or a symbol the CDN has nothing for.
      if (!img?.complete || !img.naturalWidth) return;

      const mid = (startAngle + endAngle) / 2;
      const cx = x + Math.cos(mid) * radius;
      const cy = y + Math.sin(mid) * radius;
      // A little under the arc's own width, so the disc doesn't touch the
      // gaps that separate one slice from the next.
      const draw = size * 0.86;

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, draw / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = LOGO_DISC;
      ctx.fill();
      ctx.clip();
      ctx.drawImage(img, cx - draw / 2, cy - draw / 2, draw, draw);
      ctx.restore();
    });
  },
};

export function buildDonut(slices, palette) {
  const color = sliceColor(palette);
  return {
    data: {
      labels: slices.map((s) => s.label),
      datasets: [
        {
          data: slices.map((s) => s.value),
          backgroundColor: slices.map(color),
          // A ring of the surface color between slices, so neighbouring fills
          // read as separate marks rather than one band of color.
          borderColor: palette.surface,
          borderWidth: 2,
          hoverOffset: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: cssVar("--tooltip-bg") || palette.surface,
          titleColor: cssVar("--tooltip-text") || palette.text,
          bodyColor: cssVar("--tooltip-text") || palette.text,
          borderColor: cssVar("--tooltip-border") || palette.border,
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: (item) => {
              const slice = slices[item.dataIndex];
              return ` $${formatCap(slice.value)} · ${pct(slice.pct)}`;
            },
          },
        },
      },
    },
  };
}
