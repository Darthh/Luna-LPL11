import { YAHOO_USER_AGENT } from "./userAgent.js";

const NASDAQ_CALENDAR_URL = "https://api.nasdaq.com/api/calendar/earnings";

// The calendar only shows companies at or above this cap. Nasdaq lists a few
// hundred names a day, most of them micro caps nobody is trading the print of;
// the floor is what keeps a day column readable. A row whose cap is blank -
// the feed does that for a handful of recent listings - is below the bar by
// definition, since nothing shows it is above it.
export const MIN_MARKET_CAP = 4_000_000_000;

const SESSION_LABELS = {
  "time-pre-market": "Before open",
  "time-after-hours": "After close",
  "time-not-supplied": "Time TBD",
};

function parseMarketCap(value) {
  const amount = Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function normalizeEarning(row) {
  return {
    symbol: String(row?.symbol || "").trim().toUpperCase(),
    name: String(row?.name || "").trim(),
    session: SESSION_LABELS[row?.time] ? row.time : "time-not-supplied",
    marketCap: String(row?.marketCap || "N/A"),
    marketCapValue: parseMarketCap(row?.marketCap),
    fiscalQuarter: String(row?.fiscalQuarterEnding || "N/A"),
    epsForecast: String(row?.epsForecast || "N/A"),
  };
}

export async function fetchNasdaqEarnings(date) {
  const response = await fetch(`${NASDAQ_CALENDAR_URL}?date=${encodeURIComponent(date)}`, {
    headers: {
      Accept: "application/json, text/plain, */*",
      Origin: "https://www.nasdaq.com",
      Referer: "https://www.nasdaq.com/market-activity/earnings",
      "User-Agent": YAHOO_USER_AGENT,
    },
    next: { revalidate: 60 * 60 },
  });

  if (!response.ok) throw new Error(`Earnings feed returned ${response.status}`);
  const payload = await response.json();
  const rows = payload?.data?.rows;
  if (!Array.isArray(rows)) return [];

  return rows
    .map(normalizeEarning)
    .filter((company) => company.symbol && company.name && company.marketCapValue >= MIN_MARKET_CAP)
    .sort((a, b) => b.marketCapValue - a.marketCapValue);
}

export function mondayOfWeek(date = new Date()) {
  const value = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = value.getUTCDay();
  const distance = day === 0 ? -6 : 1 - day;
  value.setUTCDate(value.getUTCDate() + distance);
  return value;
}

export function dateIso(date) {
  return date.toISOString().slice(0, 10);
}


const DAY_MS = 86_400_000;

export function weekdaysOfWeek(monday) {
  return Array.from({ length: 5 }, (_, index) => dateIso(new Date(monday.valueOf() + index * DAY_MS)));
}

// The month grid runs Monday-Friday only, from the Monday of the week holding
// the 1st through the Friday of the week holding the last day. That is why the
// reference screenshot's August grid opens on Aug 3 and closes on Sep 4: the
// edge rows carry the neighbouring month's weekdays rather than blank cells.
export function monthGridDays(monthStart) {
  const year = monthStart.getUTCFullYear();
  const month = monthStart.getUTCMonth();
  const last = new Date(Date.UTC(year, month + 1, 0));
  const days = [];
  // Anchor on the first weekday, not the 1st: when a month opens on a Saturday
  // (Aug 2026) the Monday of the 1st's week belongs to the previous month
  // entirely, and the grid would open on a row with nothing of this month in it.
  const first = new Date(Date.UTC(year, month, 1));
  while (first.getUTCDay() === 0 || first.getUTCDay() === 6) first.setUTCDate(first.getUTCDate() + 1);
  for (let cursor = mondayOfWeek(first); cursor <= last || cursor.getUTCDay() !== 1; ) {
    if (cursor.getUTCDay() >= 1 && cursor.getUTCDay() <= 5) days.push(dateIso(cursor));
    cursor = new Date(cursor.valueOf() + DAY_MS);
  }
  return days;
}

export function monthIso(date) {
  return date.toISOString().slice(0, 7);
}

export function addMonths(iso, delta) {
  const [year, month] = iso.split("-").map(Number);
  return monthIso(new Date(Date.UTC(year, month - 1 + Number(delta), 1)));
}

// Both the page and the API route have to decide whether a ?week= is a real
// Monday, and both used to carry their own copy of this. Returning the Date
// rather than a boolean covers both callers: the route wants the value to
// build the week from, the page only needs to know it parsed.
export function parseMondayIso(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || dateIso(date) !== value || date.getUTCDay() !== 1) return null;
  return date;
}

export function parseMonthIso(value) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value || "")) return null;
  const date = new Date(`${value}-01T00:00:00.000Z`);
  return Number.isNaN(date.valueOf()) ? null : date;
}
