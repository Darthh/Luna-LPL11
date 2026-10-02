// Single source of truth for the site version. Newest entry first; its
// version is what the footer badge shows.
export const CHANGELOG = [
  {
    version: "V1.12",
    date: "2026-09-13",
    changes: [
      "The About hero headline now holds one lighter-weight line on desktop, while its supporting introduction uses a wider two-line measure.",
    ],
  },
  {
    version: "V1.11",
    date: "2026-09-13",
    changes: [
      "The About hero now places the white Luna moon beside its label, removes the separate corner badge, and uses brighter supporting copy with a stronger terminal call to action.",
    ],
  },
  {
    version: "V1.10",
    date: "2026-09-13",
    changes: [
      "The About welcome screen now uses a quieter image-led composition with a compact corner mark, restrained typography, and no navigation bar over the film.",
      "Dark themes now use the supplied transparent white Luna moon for Lilo AI.",
    ],
  },
  {
    version: "V1.09",
    date: "2026-09-13",
    changes: [
      "An Open WebUI-inspired Luna assistant now fills an empty dashboard, with AWS-hosted and local OpenAI-compatible model connections.",
      "The dashboard assistant and floating Lilo button now use the supplied black moon on light themes and white moon on navy artwork on dark themes.",
    ],
  },
  {
    version: "V1.08",
    date: "2026-09-05",
    changes: [
      "The Lilo AI button in the corner now carries its own mark instead of a generic glyph.",
    ],
  },
  {
    version: "V1.07",
    date: "2026-09-05",
    changes: [
      "Creating an account now runs a Cloudflare bot check, so signups have to come from a person rather than a script.",
      "A manager's page now lives at its name - /hedge-funds/JaneStreetGroup rather than a ten-digit filer number. Older numbered links still work.",
      "Companies by market cap now shows the first fifty companies as soon as the prices and flags for those fifty are ready, about a second, instead of waiting on all seven hundred. The rest fill in behind it.",
      "Stock and option position tables list fifty rows a page, up from twenty-five.",
      "The market cap board and a manager's 13F no longer make whoever arrives after the cache expires wait for the whole thing to be rebuilt - the last good copy is shown while the refresh runs behind it.",
      "The GEX heatmap refreshes on its own every thirty seconds while the market is open, instead of only when the page is reloaded.",
      "The 24h column on the market cap board is now labelled Today.",
    ],
  },
  {
    version: "V1.06",
    date: "2026-09-04",
    changes: [
      "Paging and the Added/Reduced filters in a manager's 13F are now instant. The cost-basis walk over the last fourteen filings was being redone on every click; it is now built once per manager and reused.",
      "Cacheable API responses are now held at Cloudflare's edge. A stray login cookie on every response had been quietly preventing that, so each click re-ran the whole read.",
      "Parsed 13F filings and the cost basis built from them are now stored permanently, since a filed 13F never changes. Opening a manager nobody has viewed recently no longer re-reads fourteen filings from the SEC.",
    ],
  },
  {
    version: "V1.05",
    date: "2026-09-04",
    changes: [
      "Earnings dates and EPS now come from a keyed JSON feed that answers in production, instead of a scrape that only worked from a laptop - the chart markers appear for every company.",
      "Earnings history reaches back about 15 years where the company is that old, up from 5.",
    ],
  },
  {
    version: "V1.04",
    date: "2026-09-04",
    changes: [
      "Earnings markers are back on the price chart in production. A quarter with no scraped report date now derives one from the company's own reporting lag, so the markers no longer disappear when the calendar scrape is blocked.",
    ],
  },
  {
    version: "V1.03",
    date: "2026-09-04",
    changes: [
      "Stock and option position tables now sort instantly in the browser, using the same click-to-sort as the manager list, instead of waiting on the server.",
      "Earnings history goes back the full run again (10+ years where the data exists) rather than stopping five years back.",
    ],
  },
  {
    version: "V1.02",
    date: "2026-09-04",
    changes: [
      "13F holdings tables now sort the 25 rows on the current page instead of re-ranking the entire book.",
      "Sorting a column no longer throws you back to page 1.",
    ],
  },
  {
    version: "V1.01",
    date: "2026-09-04",
    changes: [
      "Flattened the site footer into a single horizontal row of links.",
      "Added this Change Logs page.",
      "Added a version badge in the bottom-right corner of every page.",
    ],
  },
];

export const VERSION = CHANGELOG[0].version;
