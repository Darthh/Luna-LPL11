// Sovereign bond yields, from FRED's public CSV endpoint - no key, no client.
//
// Two tiers of data, and the difference matters enough that the page says it:
// the US curve is daily and current (the H.15 series), while every other
// country is only published here as a monthly 10-year average that lands about
// three months in arrears. So the US gets a full curve and the rest get one
// tenor, and every row carries the date it is actually as of.

const CSV = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=";

// The US Treasury constant-maturity curve, daily.
export const US_CURVE = [
  { key: "US1Y", tenor: "1Y", series: "DGS1" },
  { key: "US2Y", tenor: "2Y", series: "DGS2" },
  { key: "US3Y", tenor: "3Y", series: "DGS3" },
  { key: "US5Y", tenor: "5Y", series: "DGS5" },
  { key: "US7Y", tenor: "7Y", series: "DGS7" },
  { key: "US10Y", tenor: "10Y", series: "DGS10" },
  { key: "US20Y", tenor: "20Y", series: "DGS20" },
  { key: "US30Y", tenor: "30Y", series: "DGS30" },
];

// Long-term (10-year) government bond yields, monthly, one per country.
export const GLOBAL_10Y = [
  { key: "DE10Y", country: "Germany", series: "IRLTLT01DEM156N" },
  { key: "GB10Y", country: "United Kingdom", series: "IRLTLT01GBM156N" },
  { key: "FR10Y", country: "France", series: "IRLTLT01FRM156N" },
  { key: "IT10Y", country: "Italy", series: "IRLTLT01ITM156N" },
  { key: "ES10Y", country: "Spain", series: "IRLTLT01ESM156N" },
  { key: "NL10Y", country: "Netherlands", series: "IRLTLT01NLM156N" },
  { key: "CH10Y", country: "Switzerland", series: "IRLTLT01CHM156N" },
  { key: "JP10Y", country: "Japan", series: "IRLTLT01JPM156N" },
  { key: "CA10Y", country: "Canada", series: "IRLTLT01CAM156N" },
  { key: "AU10Y", country: "Australia", series: "IRLTLT01AUM156N" },
  { key: "KR10Y", country: "South Korea", series: "IRLTLT01KRM156N" },
  { key: "MX10Y", country: "Mexico", series: "IRLTLT01MXM156N" },
];

export const ALL_SERIES = [
  ...US_CURVE.map((r) => ({ ...r, group: "us", label: `United States ${r.tenor}` })),
  ...GLOBAL_10Y.map((r) => ({ ...r, group: "global", tenor: "10Y", label: `${r.country} 10Y` })),
];

// FRED writes a gap as "." rather than omitting the row, which parses as NaN
// and would otherwise draw a hole straight through a line.
export async function fetchSeries(id) {
  const res = await fetch(`${CSV}${encodeURIComponent(id)}`, {
    // A daily series updates once a business day and a monthly one once a
    // month; six hours is well inside both and keeps a page load off FRED.
    next: { revalidate: 21600 },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const points = [];
  for (const line of text.trim().split("\n").slice(1)) {
    const [date, raw] = line.split(",");
    const value = Number(raw);
    if (date && Number.isFinite(value)) points.push({ date, value });
  }
  if (!points.length) throw new Error("No observations");
  return points;
}
