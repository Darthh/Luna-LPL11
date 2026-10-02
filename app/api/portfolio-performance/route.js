import { YAHOO_USER_AGENT } from "@/lib/userAgent";
import { memo } from "@/lib/memo";

// Performance for a set of holdings: the return columns the portfolio tables
// show, computed from the weighted daily closes of what the portfolio holds.
//
// A portfolio's return is the weighted sum of its holdings' returns, so the
// work is one price series per distinct symbol and then arithmetic. Weights
// come from the caller as either shares or percentages; shares are turned into
// weights using the latest close, since a portfolio of 10 shares of a $500
// stock and 10 of a $5 one is not half-and-half.
//
// Ten years of daily closes per symbol is the widest window any column needs
// (the 10Y CAGR), so one fetch per symbol answers every column.

export const maxDuration = 60;

// Prices move during the day but these are period returns on daily closes -
// they change once a day. An hour keeps a popular set of holdings from costing
// a fan-out per viewer.
const TTL = 3600 * 1000;
const closes = memo(TTL, { max: 400 });

const DAY = 86400 * 1000;

async function fetchCloses(symbol) {
  return closes(symbol, async () => {
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
      `?range=10y&interval=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": YAHOO_USER_AGENT },
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    const stamps = result?.timestamp ?? [];
    const values = result?.indicators?.adjclose?.[0]?.adjclose ?? result?.indicators?.quote?.[0]?.close ?? [];
    const out = [];
    for (let i = 0; i < stamps.length; i++) {
      // A halted session comes back null. Dropping it leaves a gap; carrying
      // the previous close would invent a trade at a price nobody paid.
      if (typeof values[i] === "number") out.push({ t: stamps[i] * 1000, close: values[i] });
    }
    return out;
  });
}

// The last close at or before a date. The series is sorted, so this walks back
// from the end - the dates asked for are all recent relative to ten years.
function closeAt(series, when) {
  for (let i = series.length - 1; i >= 0; i--) if (series[i].t <= when) return series[i].close;
  return null;
}

// Simple return over a window, or null when the series does not reach back far
// enough - a fund launched last year has no 10Y number, and showing 0% or the
// since-inception figure in a column headed 10Y would be a lie.
function periodReturn(series, from) {
  if (!series.length) return null;
  // A window that starts before the series does has no answer. Two extra days
  // of slack absorbs a start date that lands on a weekend or a holiday.
  if (series[0].t > from + 2 * DAY) return null;
  const start = closeAt(series, from);
  const end = series[series.length - 1].close;
  return start && start > 0 ? ((end - start) / start) * 100 : null;
}

// Annualised, for the CAGR columns: the same total return expressed as the
// constant yearly rate that would have produced it.
function cagr(series, years) {
  const total = periodReturn(series, Date.now() - years * 365 * DAY);
  if (total == null) return null;
  return (Math.pow(1 + total / 100, 1 / years) - 1) * 100;
}

const startOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
};
const startOfYear = () => new Date(new Date().getFullYear(), 0, 1).getTime();

// Weighted blend of the per-holding numbers. A holding whose own figure is
// null (too short a history) is left out and the remaining weights are
// renormalised, so one recent listing does not void the whole column.
function blend(rows, pick) {
  let sum = 0;
  let weight = 0;
  for (const row of rows) {
    const value = pick(row);
    if (value == null) continue;
    sum += value * row.weight;
    weight += row.weight;
  }
  return weight > 0 ? sum / weight : null;
}

export async function POST(request) {
  let holdings;
  try {
    ({ holdings } = await request.json());
  } catch {
    return Response.json({ error: "Bad JSON" }, { status: 400 });
  }
  if (!Array.isArray(holdings) || !holdings.length) {
    return Response.json({ error: "No holdings" }, { status: 400 });
  }

  // Trusted no further than shape: this is user input, and a malformed symbol
  // must not reach a URL.
  const clean = holdings
    .map((h) => ({
      symbol: String(h?.symbol ?? "").trim().toUpperCase(),
      shares: Number(h?.shares) > 0 ? Number(h.shares) : null,
      weight: Number(h?.weight) > 0 ? Number(h.weight) : null,
    }))
    .filter((h) => /^[A-Z0-9.\-^]{1,12}$/.test(h.symbol))
    .slice(0, 60);

  if (!clean.length) return Response.json({ error: "No usable holdings" }, { status: 400 });

  const series = await Promise.all(
    clean.map((h) => fetchCloses(h.symbol).catch(() => []))
  );

  // Shares become weights at the latest close, so the mix reflects money held
  // rather than share count. A portfolio given explicit weights uses those.
  const rows = clean.map((h, i) => {
    const s = series[i];
    const last = s.length ? s[s.length - 1].close : null;
    return {
      symbol: h.symbol,
      series: s,
      value: h.shares != null && last != null ? h.shares * last : null,
      weight: h.weight ?? null,
      price: last,
    };
  });

  const totalValue = rows.reduce((a, r) => a + (r.value ?? 0), 0);
  const givenWeight = rows.reduce((a, r) => a + (r.weight ?? 0), 0);
  for (const r of rows) {
    if (r.weight != null && givenWeight > 0) r.weight = r.weight / givenWeight;
    else if (totalValue > 0) r.weight = (r.value ?? 0) / totalValue;
    // Nothing to weight by - no shares, no weights, no prices - so an equal
    // split is the only honest reading of "these are the holdings".
    else r.weight = 1 / rows.length;
  }

  const perHolding = rows.map((r) => ({
    symbol: r.symbol,
    weight: r.weight,
    price: r.price,
    value: r.value,
    mtd: periodReturn(r.series, startOfMonth()),
    ytd: periodReturn(r.series, startOfYear()),
    y1: periodReturn(r.series, Date.now() - 365 * DAY),
    cagr3: cagr(r.series, 3),
    cagr5: cagr(r.series, 5),
    cagr10: cagr(r.series, 10),
  }));

  return Response.json(
    {
      value: totalValue || null,
      holdings: perHolding,
      totals: {
        mtd: blend(perHolding, (r) => r.mtd),
        ytd: blend(perHolding, (r) => r.ytd),
        y1: blend(perHolding, (r) => r.y1),
        cagr3: blend(perHolding, (r) => r.cagr3),
        cagr5: blend(perHolding, (r) => r.cagr5),
        cagr10: blend(perHolding, (r) => r.cagr10),
      },
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
