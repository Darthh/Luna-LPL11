import { invalidateYahooSession, yahooSession } from "@/lib/symbolProfile";
import { YAHOO_USER_AGENT } from "@/lib/userAgent";
import { memo } from "@/lib/memo";

// Valuation multiples through time, for the Graphs pages.
//
// There is no feed that hands over "P/E on every day of the last five years",
// and there is no need for one: a multiple is a price over a per-share
// fundamental, the price series is already available daily, and the
// fundamental only moves when a quarter is filed. So this route fetches both
// halves and divides - a daily close over whichever quarter's figure was the
// latest filed on that day. That is also what makes the step shape in the
// chart honest: the denominator really does jump on filing day.
//
// Three multiples come out of it:
//   P/E     = price / trailing-twelve-month EPS
//   P/S     = price / TTM revenue per share
//   EV/EBIT = (market cap + debt - cash) / TTM EBIT
// EV/EBIT is the one that needs more than price: shares, debt and cash all
// come off the quarterly balance sheet, so it steps quarterly on both halves.

export const maxDuration = 60;

const raw = (v) => (typeof v?.raw === "number" ? v.raw : typeof v === "number" ? v : null);

// Fundamentals are quarterly filings. Six hours is already far more often than
// they can possibly change; the TTL is here to stop a popular ticker costing a
// Yahoo round trip per viewer, not to track anything live.
const TTL = 6 * 3600 * 1000;
const cached = memo(TTL, { max: 200 });

const RANGES = {
  "1m": { range: "1mo" },
  "3m": { range: "3mo" },
  "6m": { range: "6mo" },
  "1y": { range: "1y" },
  "2y": { range: "2y" },
  "3y": { range: "3y" },
  "5y": { range: "5y" },
};

async function yahoo(url, session) {
  const res = await fetch(url, {
    headers: { "User-Agent": YAHOO_USER_AGENT, Cookie: session.cookie },
    next: { revalidate: 3600 },
  });
  // A stale crumb reads as 401; drop it so the next attempt mints a new one
  // rather than looping on a session that can no longer sign a request.
  if (res.status === 401) invalidateYahooSession();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Daily closes, as [{ t: epochMs, close }].
async function prices(symbol, range, session) {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?range=${range}&interval=1d`;
  const json = await yahoo(url, session);
  const result = json?.chart?.result?.[0];
  const stamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const out = [];
  for (let i = 0; i < stamps.length; i++) {
    // A halted or untraded session comes back as a null close. Dropping the
    // point leaves a gap; carrying the previous close would invent a trade.
    if (typeof closes[i] === "number") out.push({ t: stamps[i] * 1000, close: closes[i] });
  }
  return out;
}

// The filings behind the multiples, oldest first, each stamped with the date
// it became public.
//
// Yahoo has two shapes of this and neither is enough alone: quoteSummary's
// quarterly modules stop at four or five quarters, which is one TTM point, and
// the annual timeseries only steps once a year. So both are read from the
// fundamentals-timeseries endpoint and merged - annual figures carry the early
// years of a 5Y chart, quarterly TTM sums take over for the recent stretch
// where they exist, because they are the finer of the two.
const FIELDS = [
  ["revenue", "TotalRevenue"],
  ["netIncome", "NetIncome"],
  ["ebit", "EBIT"],
  ["operatingIncome", "OperatingIncome"],
  ["debt", "TotalDebt"],
  ["cash", "CashAndCashEquivalents"],
  ["shares", "BasicAverageShares"],
];

// Filings land some weeks after the period closes; without that lag the chart
// would show the market pricing a number nobody had published yet. 45 days is
// the SEC's own deadline for a 10-Q from a large filer.
const FILING_LAG = 45 * 86400 * 1000;

async function timeseries(symbol, prefix, session, years) {
  const types = FIELDS.map(([, name]) => prefix + name).join(",");
  const now = Math.floor(Date.now() / 1000);
  const url =
    `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}` +
    `?symbol=${encodeURIComponent(symbol)}&type=${types}` +
    `&period1=${now - years * 365 * 86400}&period2=${now}&crumb=${encodeURIComponent(session.crumb)}`;
  const json = await yahoo(url, session);

  // The answer is one entry per requested type, each a list of periods. They
  // are re-keyed by period here so a period becomes one row with every field
  // on it, which is what the multiples need.
  const byDate = new Map();
  for (const entry of json?.timeseries?.result ?? []) {
    const key = Object.keys(entry).find((k) => k !== "meta" && k !== "timestamp");
    if (!key) continue;
    const field = FIELDS.find(([, name]) => key === prefix + name)?.[0];
    if (!field) continue;
    for (const point of entry[key] ?? []) {
      const value = raw(point?.reportedValue);
      const at = Date.parse(point?.asOfDate);
      if (value == null || !Number.isFinite(at)) continue;
      if (!byDate.has(at)) byDate.set(at, { end: at });
      byDate.get(at)[field] = value;
    }
  }
  return [...byDate.values()].sort((a, b) => a.end - b.end);
}

async function quarters(symbol, session) {
  const [annual, quarterly] = await Promise.all([
    timeseries(symbol, "annual", session, 8),
    timeseries(symbol, "quarterly", session, 8),
  ]);

  const row = (period, revenue, netIncome, ebit, quarterly = false) => ({
    from: period.end + FILING_LAG,
    quarterly,
    revenue,
    netIncome,
    ebit,
    shares: period.shares ?? null,
    debt: period.debt ?? 0,
    cash: period.cash ?? 0,
  });

  // Annual figures are already twelve months, so they are TTM as filed.
  const rows = annual
    .filter((a) => a.revenue != null && a.shares)
    .map((a) => row(a, a.revenue, a.netIncome ?? null, a.ebit ?? a.operatingIncome ?? null));

  // A quarterly TTM needs its three predecessors; a sum over fewer would read
  // as though the company had shrunk. Where they exist they replace the annual
  // row, since a quarterly step is the truer shape.
  for (let i = 3; i < quarterly.length; i++) {
    const window = quarterly.slice(i - 3, i + 1);
    const sum = (k) =>
      window.every((q) => Number.isFinite(q[k])) ? window.reduce((a, q) => a + q[k], 0) : null;
    const ebit = sum("ebit") ?? sum("operatingIncome");
    const period = quarterly[i];
    if (sum("revenue") == null || !period.shares) continue;
    rows.push(row(period, sum("revenue"), sum("netIncome"), ebit, true));
  }

  // An annual period and the quarter that closes the same fiscal year are the
  // same twelve months filed twice. They rarely land on the exact same day, so
  // deduping by date is not enough - two rows a day apart would make the year
  // over year comparison straddle both and spike. Quarterly wins wherever the
  // two are within a month of each other, being the finer series.
  const MONTH = 31 * 86400 * 1000;
  const quarterlyFrom = new Set(
    rows.filter((r) => r.quarterly).map((r) => r.from)
  );
  return rows
    .sort((a, b) => a.from - b.from)
    .filter(
      (r) =>
        r.quarterly || ![...quarterlyFrom].some((q) => Math.abs(q - r.from) < MONTH)
    );
}

function build(closes, fundamentals) {
  if (!closes.length || !fundamentals.length) return [];

  const series = [];
  let idx = -1;
  for (const point of closes) {
    // Walk forward to the newest filing already public on this date. Both
    // lists are sorted, so this is one pass rather than a lookup per point.
    while (idx + 1 < fundamentals.length && fundamentals[idx + 1].from <= point.t) idx++;
    const f = idx >= 0 ? fundamentals[idx] : null;
    if (!f || !f.shares) continue;

    const cap = point.close * f.shares;
    // A negative denominator is not a cheap multiple, it is a company losing
    // money - plotting -8x next to 20x would read as the best value on the
    // chart. Those points are holes instead.
    const pe = f.netIncome > 0 ? cap / f.netIncome : null;
    const ps = f.revenue > 0 ? cap / f.revenue : null;
    const evEbit = f.ebit > 0 ? (cap + f.debt - f.cash) / f.ebit : null;

    series.push({
      t: point.t,
      close: point.close,
      // The TTM revenue behind this point, so revenue growth can be computed
      // from the filings themselves rather than reverse-engineered out of the
      // price and P/S - dividing two ratios across a filing step produced
      // spikes of several hundred percent that no company actually had.
      revenue: f.revenue ?? null,
      pe: pe == null ? null : Math.round(pe * 100) / 100,
      ps: ps == null ? null : Math.round(ps * 100) / 100,
      evEbit: evEbit == null ? null : Math.round(evEbit * 100) / 100,
    });
  }
  return series;
}

// Exported so the comparison route can fan out over it rather than carry a
// second copy of the same maths - a multiple has to mean the same thing on
// both pages.
export async function valuationSeries(symbol, rangeKey) {
  const cfg = RANGES[rangeKey];
  if (!symbol || !/^[A-Z0-9.\-^]{1,12}$/.test(symbol) || !cfg) throw new Error("Bad symbol or range");
  return cached(`${symbol}:${rangeKey}`, async () => {
    const session = await yahooSession();
    const [closes, fundamentals] = await Promise.all([
      prices(symbol, cfg.range, session),
      quarters(symbol, session),
    ]);
    return build(closes, fundamentals);
  });
}

export async function GET(request) {
  const symbol = request.nextUrl.searchParams.get("symbol")?.trim().toUpperCase();
  const rangeKey = request.nextUrl.searchParams.get("range") ?? "1y";
  if (!RANGES[rangeKey] || !symbol) {
    return Response.json({ error: "Bad symbol or range" }, { status: 400 });
  }

  try {
    const series = await valuationSeries(symbol, rangeKey);
    if (!series.length) {
      return Response.json({ error: "No fundamentals for that symbol" }, { status: 404 });
    }
    return Response.json(
      { symbol, range: rangeKey, series },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } }
    );
  } catch (err) {
    return Response.json({ error: String(err.message ?? err) }, { status: 502 });
  }
}
