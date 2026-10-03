// Appearance preferences, shared by the pre-paint init script in app/layout.js
// and the settings menu. The palettes themselves live in globals.css - this
// file only names them and says which background each one starts with.

export const THEME_GROUPS = [
  {
    label: "Light",
    themes: [
      ["light", "Light"],
      ["sepia", "Sepia"],
      ["lavender", "Lavender"],
      ["luna", "Luna"],
      ["padres", "Padres"],
    ],
  },
  {
    label: "Dark",
    themes: [
      ["dark", "Dark"],
      ["midnight", "Midnight"],
      ["ocean", "Ocean"],
      ["bloomberg", "Bloomberg"],
      ["ume", "Ume"],
      ["halloween", "Halloween"],
    ],
  },
];

export const THEMES = THEME_GROUPS.flatMap((g) => g.themes.map(([v]) => v));

export const PATTERNS = [
  ["none", "None"],
  ["dots", "Dots"],
  ["constellations", "Constellations"],
  ["rain", "Rain"],
  ["synapse", "Synapse"],
  ["perlin-flow", "Flow field"],
  ["petals", "Petals"],
  ["sparkles", "Sparkles"],
  ["embers", "Embers"],
  ["haunted", "Haunted night"],
];

// Each theme's background is a choice the palette was designed around, so
// switching theme also switches to that theme's background.
export const THEME_PATTERN = {
  light: "dots",
  sepia: "dots",
  lavender: "petals",
  luna: "dots",
  // Dark keeps the star field from the pre-terminal site for people who select it.
  dark: "constellations",
  midnight: "rain",
  ocean: "constellations",
  ume: "petals",
  bloomberg: "none",
  halloween: "haunted",
  padres: "none",
};

export const FONTS = {
  sans: 'var(--font-sans), -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  mono: 'var(--font-mono), ui-monospace, "SF Mono", Menlo, monospace',
  serif: 'Georgia, "Times New Roman", Times, serif',
  interwoff: 'var(--font-inter-woff), -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
};

export const FONT_OPTIONS = [
  ["interwoff", "InterWoff"],
  ["sans", "Sans"],
  ["mono", "Mono"],
  ["serif", "Serif"],
];

export const DENSITIES = [
  ["compact", "Compact"],
  ["comfortable", "Comfortable"],
  ["spacious", "Spacious"],
];

// How heavy the interface text sits. "Normal" is the weight the site was
// designed at; "Bold" steps every weight up together rather than picking out
// headings, so the page keeps the contrast it had between a label and the
// number beside it.
//
// Two settings rather than three. A third step has nothing left to render on
// the default face: InterWoff ships one static master, the browser fakes its
// bold, and that synthesis is on-or-off - so "Bolder" looked identical to
// "Bold" for most readers. See the Text weight block in globals.css.
export const WEIGHTS = [
  ["normal", "Normal"],
  ["bold", "Bold"],
];

export const DEFAULTS = {
  theme: "luna",
  // No backdrop by default: the terminal is a working surface, and an animated
  // pattern behind live numbers is noise. A reader who wants one can still
  // pick it.
  pattern: "none",
  font: "interwoff",
  density: "compact",
  weight: "normal",
};

// localStorage keys, in one place because the init script writes the same ones.
export const KEYS = {
  theme: "theme",
  pattern: "bgPattern",
  font: "uiFont",
  density: "density",
  weight: "textWeight",
};
