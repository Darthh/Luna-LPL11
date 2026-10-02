// The criteria the stock screener offers, shared by the UI and its API route
// so the two can't drift on units or field names.
//
// `field` is Yahoo's screener operand id (verified against
// /v1/finance/screener/instrument/equity/fields). Growth figures come back as
// percentages, not fractions - a company growing revenue 60% screens as 60,
// which is also what the preset labels say, so those need no conversion.
// Market cap is dollars, so the billions the options are written in get
// scaled on the way out.
//
// Forward P/E has no screener field at all, so it carries `field: null` and is
// applied to the returned rows instead - see the route.

// Every criterion is a dropdown of ready-made ranges rather than a pair of
// empty boxes, following Finviz's screener: picking "Under 20" is one click
// where typing a bound is three, and the named shortcuts ("Profitable (>0)",
// "Mega") carry the convention with them. `min`/`max` are the bounds a preset
// stands for; leaving either off means unbounded on that side.
const ANY = { label: "Any" };

const under = (v, unit = "") => ({ label: `Under ${v}${unit}`, max: v });
const over = (v, unit = "") => ({ label: `Over ${v}${unit}`, min: v });

// P/E and forward P/E share Finviz's ladder: named shortcuts, then Under and
// Over in fives.
const PE_STEPS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
const PE_OPTIONS = [
  ANY,
  { label: "Low (<15)", max: 15 },
  { label: "Profitable (>0)", min: 0 },
  { label: "High (>50)", min: 50 },
  ...PE_STEPS.map((v) => under(v)),
  ...PE_STEPS.map((v) => over(v)),
];

const GROWTH_STEPS = [5, 10, 15, 20, 25, 30, 50];
const GROWTH_OPTIONS = [
  ANY,
  { label: "Negative (<0%)", max: 0 },
  { label: "Positive (>0%)", min: 0 },
  { label: "Positive Low (0-10%)", min: 0, max: 10 },
  { label: "High (>25%)", min: 25 },
  ...GROWTH_STEPS.map((v) => under(v, "%")),
  ...GROWTH_STEPS.map((v) => over(v, "%")),
];

const PEG_STEPS = [0.5, 1, 1.5, 2, 3];
const PEG_OPTIONS = [
  ANY,
  { label: "Low (<1)", max: 1 },
  { label: "High (>2)", min: 2 },
  ...PEG_STEPS.map((v) => under(v)),
  ...PEG_STEPS.map((v) => over(v)),
];

// A plain multiple (P/S, P/B, EV/EBITDA, current ratio, beta …), so the ladder
// is built from whichever steps suit that measure's usual range.
const multiple = (steps, low, high) => [
  ANY,
  { label: `Low (<${low})`, max: low },
  { label: `High (>${high})`, min: high },
  ...steps.map((v) => under(v)),
  ...steps.map((v) => over(v)),
];

// Margins and returns. Yahoo reports every one of these as a percentage
// (NVDA's return on equity screens as 114, not 1.14), so the labels are the
// values.
const MARGIN_STEPS = [5, 10, 15, 20, 25, 30, 40, 50];
const MARGIN_OPTIONS = [
  ANY,
  { label: "Negative (<0%)", max: 0 },
  { label: "Positive (>0%)", min: 0 },
  { label: "High (>25%)", min: 25 },
  ...MARGIN_STEPS.map((v) => under(v, "%")),
  ...MARGIN_STEPS.map((v) => over(v, "%")),
];

const YIELD_STEPS = [1, 2, 3, 4, 5, 6, 8, 10];
const YIELD_OPTIONS = [
  ANY,
  { label: "Pays a dividend (>0%)", min: 0.0001 },
  { label: "High (>5%)", min: 5 },
  ...YIELD_STEPS.map((v) => under(v, "%")),
  ...YIELD_STEPS.map((v) => over(v, "%")),
];

// Written in billions to match the criterion's `scale`. The tiers and their
// cutoffs are Finviz's: mega/large/mid/small/micro/nano at 200B/10B/2B/300M/
// 50M, then the open-ended "+" (over) and "-" (under) variants of each.
const CAP_OPTIONS = [
  ANY,
  { label: "Mega ($200B and more)", min: 200 },
  { label: "Large ($10B to $200B)", min: 10, max: 200 },
  { label: "Mid ($2B to $10B)", min: 2, max: 10 },
  { label: "Small ($300M to $2B)", min: 0.3, max: 2 },
  { label: "Micro ($50M to $300M)", min: 0.05, max: 0.3 },
  { label: "Nano (under $50M)", max: 0.05 },
  { label: "+Large (over $10B)", min: 10 },
  { label: "+Mid (over $2B)", min: 2 },
  { label: "+Small (over $300M)", min: 0.3 },
  { label: "+Micro (over $50M)", min: 0.05 },
  { label: "-Large (under $200B)", max: 200 },
  { label: "-Mid (under $10B)", max: 10 },
  { label: "-Small (under $2B)", max: 2 },
  { label: "-Micro (under $300M)", max: 0.3 },
];

// Ordered so the grid reads as groups across its rows: size and earnings
// multiples, then the other multiples, then growth, then profitability, then
// balance-sheet health.
export const CRITERIA = [
  {
    key: "cap",
    field: "intradaymarketcap",
    scale: 1e9,
    label: "Market Cap",
    hint: "Company size",
    options: CAP_OPTIONS,
  },
  {
    key: "pe",
    field: "peratio.lasttwelvemonths",
    label: "P/E",
    hint: "Price to trailing twelve-month earnings",
    options: PE_OPTIONS,
  },
  {
    key: "forwardPe",
    field: null,
    label: "Forward P/E",
    hint: "Price to next year's estimated earnings",
    options: PE_OPTIONS,
  },
  {
    key: "peg",
    field: "pegratio_5y",
    label: "PEG",
    hint: "P/E against 5-year expected growth - under 1 is the classic cutoff",
    options: PEG_OPTIONS,
  },
  {
    key: "ps",
    field: "lastclosemarketcaptotalrevenue.lasttwelvemonths",
    label: "P/S",
    hint: "Price to trailing twelve-month sales",
    options: multiple([1, 2, 3, 5, 10, 20], 1, 10),
  },
  {
    key: "pb",
    field: "pricebookratio.quarterly",
    label: "P/B",
    hint: "Price to book value per share",
    options: multiple([1, 2, 3, 5, 10, 20], 1, 10),
  },
  {
    key: "evEbitda",
    field: "lastclosetevebitda.lasttwelvemonths",
    label: "EV/EBITDA",
    hint: "Enterprise value to EBITDA - a P/E that accounts for debt and cash",
    options: multiple([5, 10, 15, 20, 30, 50], 10, 30),
  },
  {
    key: "evSales",
    field: "lastclosetevtotalrevenue.lasttwelvemonths",
    label: "EV/Sales",
    hint: "Enterprise value to trailing twelve-month sales",
    options: multiple([1, 2, 3, 5, 10, 20], 1, 10),
  },
  {
    key: "revGrowth",
    field: "totalrevenues1yrgrowth.lasttwelvemonths",
    label: "Rev. growth YoY",
    hint: "Revenue over the trailing twelve months against the year before",
    options: GROWTH_OPTIONS,
  },
  {
    key: "salesGrowthQ",
    field: "quarterlyrevenuegrowth.quarterly",
    label: "Sales growth Q/Q",
    hint: "Most recent quarter's revenue against the same quarter a year earlier",
    options: GROWTH_OPTIONS,
  },
  {
    key: "epsGrowth",
    field: "dilutedeps1yrgrowth.lasttwelvemonths",
    label: "EPS dil. growth YoY",
    hint: "Diluted EPS over the trailing twelve months against the year before",
    options: GROWTH_OPTIONS,
  },
  {
    key: "divYield",
    field: "forward_dividend_yield",
    label: "Dividend yield",
    hint: "Forward annual dividend as a percentage of the share price",
    options: YIELD_OPTIONS,
  },
  {
    key: "grossMargin",
    field: "grossprofitmargin.lasttwelvemonths",
    label: "Gross margin",
    hint: "Gross profit as a percentage of revenue",
    options: MARGIN_OPTIONS,
  },
  {
    key: "netMargin",
    field: "netincomemargin.lasttwelvemonths",
    label: "Net margin",
    hint: "Net income as a percentage of revenue",
    options: MARGIN_OPTIONS,
  },
  {
    key: "roa",
    field: "returnonassets.lasttwelvemonths",
    label: "Return on assets",
    hint: "Net income against total assets",
    options: MARGIN_OPTIONS,
  },
  {
    key: "roe",
    field: "returnonequity.lasttwelvemonths",
    label: "Return on equity",
    hint: "Net income against shareholder equity",
    options: MARGIN_OPTIONS,
  },
  {
    key: "roic",
    field: "returnontotalcapital.lasttwelvemonths",
    label: "Return on capital",
    hint: "Return on total invested capital - debt and equity together",
    options: MARGIN_OPTIONS,
  },
  {
    key: "debtEquity",
    // Yahoo carries this as a percentage of equity (Ford screens as 425, not
    // 4.25), so the presets are written as the multiples people actually say
    // and scaled up on the way out.
    field: "totaldebtequity.lasttwelvemonths",
    scale: 100,
    label: "Debt/Equity",
    hint: "Total debt against equity - 0.5 means half as much debt as equity",
    options: multiple([0.1, 0.25, 0.5, 1, 2, 3], 0.25, 1),
  },
  {
    key: "currentRatio",
    field: "currentratio.lasttwelvemonths",
    label: "Current ratio",
    hint: "Current assets against current liabilities - under 1 means short-term bills exceed liquid assets",
    options: multiple([0.5, 1, 1.5, 2, 3, 5], 1, 3),
  },
  {
    key: "beta",
    field: "beta",
    label: "Beta",
    hint: "Volatility against the market - 1 moves with it, above 1 swings harder",
    options: multiple([0.5, 1, 1.5, 2, 2.5], 1, 2),
  },
];

const number = (v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Reads `<key>Min` / `<key>Max` off a URLSearchParams into Yahoo query
// operands, plus the bounds that have to be applied after the fact. A
// criterion left on "Any" sends neither bound and is simply not screened on.
export function buildQuery(params) {
  const operands = [];
  const applied = [];
  let local = null;

  for (const c of CRITERIA) {
    const min = number(params.get(`${c.key}Min`));
    const max = number(params.get(`${c.key}Max`));
    if (min == null && max == null) continue;
    applied.push({ key: c.key, min, max });

    if (!c.field) {
      local = { min, max };
      continue;
    }
    const scale = c.scale ?? 1;
    if (min != null) operands.push({ operator: "gte", operands: [c.field, min * scale] });
    if (max != null) operands.push({ operator: "lte", operands: [c.field, max * scale] });
  }

  return { operands, applied, local };
}
