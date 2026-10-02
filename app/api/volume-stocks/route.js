import { pool } from "@/lib/pool";
import { YAHOO_USER_AGENT } from "@/lib/userAgent";

export const revalidate = 900;

// The most-traded names by dollar volume, which is a different question from
// the most-mentioned ones the sibling popular-stocks route answers. Yahoo's
// "most actives" screener sorts by share count and excludes funds, so SPY and
// QQQ - two of the biggest dollar-volume tapes there are - never appear in it.
// The universe is therefore that screener's live list (whatever is hot this
// week) unioned with the funds and mega caps that are always near the top.
const ALWAYS = [
  "SPY", "QQQ", "IWM", "DIA", "VOO", "VTI", "TQQQ", "SQQQ", "SOXL", "XLF",
  "XLE", "XLK", "HYG", "GLD", "SLV", "TLT", "EEM", "ARKK", "IVV",
  "NVDA", "AAPL", "MSFT", "AMZN", "META", "GOOGL", "TSLA", "AVGO", "AMD",
  "NFLX", "PLTR", "COIN", "MSTR", "MU", "SMCI", "JPM", "BRK-B", "LLY", "UNH",
];

async function fetchUniverse() {
  try {
    const res = await fetch(
      "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=most_actives&count=50&formatted=false",
      { headers: { "User-Agent": YAHOO_USER_AGENT }, next: { revalidate: 900 } }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const quotes = json?.finance?.result?.[0]?.quotes ?? [];
    return quotes.map((q) => q.symbol).filter(Boolean);
  } catch {
    return [];
  }
}

// Weekly candles: the last bar is the week in progress, the one before it is
// last week. Dollar volume is volume x close, which is the figure that puts
// a $700 ETF above a $3 stock trading ten times the shares.
async function fetchWeeks(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1wk`;
    const res = await fetch(url, {
      headers: { "User-Agent": YAHOO_USER_AGENT },
      next: { revalidate: 900 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    const quote = result?.indicators?.quote?.[0];
    const closes = quote?.close ?? [];
    const volumes = quote?.volume ?? [];
    // Yahoo sometimes appends a partial bar for the current day on top of the
    // week's bar, which would double-count today. Bars are keyed by their week
    // start, so collapsing on that timestamp keeps one value per week.
    const byWeek = new Map();
    (result?.timestamp ?? []).forEach((t, i) => {
      const c = closes[i];
      const v = volumes[i];
      if (typeof c !== "number" || typeof v !== "number") return;
      const week = new Date(t * 1000).toISOString().slice(0, 10);
      byWeek.set(week, { shares: v, dollars: v * c });
    });
    const weeks = [...byWeek.values()];
    if (weeks.length < 2) return null;
    const name = result?.meta?.longName || result?.meta?.shortName || symbol;
    return { symbol, name, current: weeks.at(-1), previous: weeks.at(-2) };
  } catch {
    return null;
  }
}

const byDollars = (a, b) => b.dollars - a.dollars;

export async function GET() {
  const symbols = [...new Set([...ALWAYS, ...(await fetchUniverse())])];
  const rows = (await pool(symbols, 8, fetchWeeks)).filter(Boolean);
  if (!rows.length) return Response.json({ stocks: [], isDemo: true });

  // Last week's ranking is over the same universe, so a name that climbed did
  // so against the same field - the arrow is spots moved, not a new entry.
  const prevRank = new Map(
    rows
      .map((r) => ({ symbol: r.symbol, dollars: r.previous.dollars }))
      .sort(byDollars)
      .map((r, i) => [r.symbol, i + 1])
  );

  const stocks = rows
    .map((r) => ({ ...r, dollars: r.current.dollars }))
    .sort(byDollars)
    .slice(0, 20)
    .map((r, i) => ({
      rank: i + 1,
      ticker: r.symbol,
      name: r.name,
      shares: Math.round(r.current.shares),
      dollars: r.current.dollars,
      rankChange: prevRank.get(r.symbol) - (i + 1),
    }));

  return Response.json(
    { stocks, isDemo: false },
    { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" } }
  );
}
