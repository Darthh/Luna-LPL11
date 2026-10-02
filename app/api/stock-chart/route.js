// Price series for the stock detail page chart, per display range.
import { YAHOO_USER_AGENT } from "@/lib/userAgent";

// Tradier's production feed is the primary real-time source for the
// instruments shown by GEX RsiLE. Everything else, and every longer-term
// chart, stays on Yahoo. Keeping the token server-only also prevents a client
// from spending the account's market-data quota.
const TRADIER_INTRADAY_SYMBOLS = new Set(["SPY", "QQQ", "SOXX"]);
const TRADIER_INTERVALS = { "1m": "1min", "5m": "5min" };

// Yahoo chart params per display range. 1D uses intraday candles; the rest
// use daily closes.
const RANGES = {
  // Fine intraday candles for accuracy on the short ranges.
  "1d": { range: "1d", interval: "1m", sessions: 1, history: { range: "5d", interval: "1m" } },
  "3d": { range: "5d", interval: "5m", sessions: 3, history: { range: "1mo", interval: "5m" } },
  "5d": { range: "5d", interval: "5m", sessions: 5, history: { range: "1mo", interval: "5m" } },
  "1m": { range: "1mo", interval: "1d" },
  "3m": { range: "3mo", interval: "1d" },
  "6m": { range: "6mo", interval: "1d" },
  "1y": { range: "1y", interval: "1d" },
  "2y": { range: "2y", interval: "1d" },
  // Yahoo has no 3y preset; use an explicit period window instead.
  "3y": { years: 3, interval: "1d" },
  "5y": { range: "5y", interval: "1d" },
  // A decade of daily closes is ~2,500 points, which is still a couple of
  // hundred KB - weekly candles here would cost the shape of every drawdown.
  "10y": { range: "10y", interval: "1d" },
};

// Calendar days each daily range covers, used only when a caller asks for
// moving-average warmup.
const RANGE_DAYS = {
  "1m": 31,
  "3m": 93,
  "6m": 186,
  "1y": 366,
  "2y": 731,
  "3y": 1096,
  "5y": 1827,
  "10y": 3653,
};
// Longest average the Technicals menu offers is 200 sessions. 300 calendar
// days clears that with room for holidays and halts.
const WARMUP_DAYS = 300;

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function tradierTimestamp(row) {
  const timestamp = asNumber(row.timestamp);
  if (timestamp != null) return timestamp > 10_000_000_000 ? Math.floor(timestamp / 1000) : Math.floor(timestamp);
  const parsed = Date.parse(row.time);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
}

function tradierDateTime(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day} ${value.hour}:${value.minute}`;
}

function tradierLookbackDays(rangeKey, history) {
  if (rangeKey === "1d") return history ? 7 : 2;
  return history ? 35 : 8;
}

async function fetchTradierPoints(symbol, rangeKey, interval, history) {
  const token = process.env.TRADIER_API_TOKEN;
  if (!token) return null;
  const end = new Date();
  const start = new Date(end.getTime() - tradierLookbackDays(rangeKey, history) * 86400 * 1000);
  const params = new URLSearchParams({
    symbol,
    interval: TRADIER_INTERVALS[interval],
    start: tradierDateTime(start),
    end: tradierDateTime(end),
    session_filter: "open",
  });
  const response = await fetch(`https://api.tradier.com/v1/markets/timesales?${params}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Tradier HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  const data = (await response.json())?.series?.data;
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  const points = [];
  let prevClose = null;
  for (const row of rows) {
    const t = tradierTimestamp(row);
    const close = asNumber(row.close);
    if (t == null || close == null) continue;
    const open = asNumber(row.open) ?? close;
    points.push({
      t,
      o: open,
      h: asNumber(row.high) ?? close,
      l: asNumber(row.low) ?? close,
      c: close,
      v: asNumber(row.volume) ?? 0,
      u: prevClose != null ? (close >= prevClose ? 1 : 0) : (close >= open ? 1 : 0),
    });
    prevClose = close;
  }
  if (!points.length) throw new Error("Tradier returned no usable candles");
  return points;
}

async function fetchYahooChart(url, interval) {
  const options = { headers: { "User-Agent": YAHOO_USER_AGENT } };
  // Intraday Yahoo is the fallback when Tradier is unavailable. It must not
  // inherit a stale KV entry, otherwise the fallback recreates the outage this
  // provider priority is meant to avoid.
  if (interval === "1m" || interval === "5m") options.cache = "no-store";
  else options.next = { revalidate: 900 };
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export async function GET(request) {
  const symbol = request.nextUrl.searchParams.get("symbol")?.trim().toUpperCase();
  const rangeKey = request.nextUrl.searchParams.get("range") ?? "1d";
  const cfg = RANGES[rangeKey];
  if (!symbol || !cfg) {
    return Response.json({ error: "Bad symbol or range" }, { status: 400 });
  }

  // A 200-day average over a 3-month chart is 200 sessions of history the
  // display window doesn't contain, so `pad` widens the fetch and hands the
  // leading closes back separately. `points` keeps its exact meaning either
  // way, which is what stops every other reader on the page from caring.
  const padDays = RANGE_DAYS[rangeKey];
  const pad = request.nextUrl.searchParams.get("pad") === "1" && padDays != null;
  const history = request.nextUrl.searchParams.get("history") === "1" && cfg.history;
  const fetchCfg = history ? { ...cfg, ...cfg.history } : cfg;
  const intraday = fetchCfg.interval === "1m" || fetchCfg.interval === "5m";
  const now = Math.floor(Date.now() / 1000);
  const windowStart = pad ? now - padDays * 86400 : null;

  const span = pad
    ? `period1=${now - (padDays + WARMUP_DAYS) * 86400}&period2=${now}`
    : fetchCfg.range
      ? `range=${fetchCfg.range}`
      : `period1=${now - fetchCfg.years * 365 * 86400}&period2=${now}`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${span}&interval=${fetchCfg.interval}&includePrePost=false`;
  let json;
  let tradierPoints = null;
  try {
    if (intraday && TRADIER_INTRADAY_SYMBOLS.has(symbol)) {
      try {
        tradierPoints = await fetchTradierPoints(symbol, rangeKey, fetchCfg.interval, history);
      } catch (error) {
        console.warn(`${symbol} Tradier chart fetch failed; falling back to Yahoo`, error);
      }
    }
    if (!tradierPoints) json = await fetchYahooChart(url, fetchCfg.interval);
  } catch {
    return Response.json({ error: "Chart data unavailable" }, { status: 502 });
  }

  const result = json?.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const closes = quote?.close;
  const volumes = quote?.volume;
  const opens = quote?.open;
  const highs = quote?.high;
  const lows = quote?.low;
  const timestamps = result?.timestamp;
  if (!tradierPoints && (!result || !Array.isArray(closes) || !Array.isArray(timestamps))) {
    const description = json?.chart?.error?.description ?? "Unknown ticker";
    return Response.json({ error: description }, { status: 404 });
  }

  // Each point carries OHLC, volume and an up/down flag (close vs the prior
  // close), supporting both line and candlestick readers of this endpoint.
  const points = tradierPoints || [];
  let prevClose = result?.meta?.chartPreviousClose ?? null;
  for (let i = 0; !tradierPoints && i < timestamps.length; i++) {
    if (typeof closes[i] !== "number") continue;
    const open = typeof opens?.[i] === "number" ? opens[i] : prevClose;
    const up = prevClose != null ? closes[i] >= prevClose : closes[i] >= (open ?? closes[i]);
    points.push({
      t: timestamps[i],
      o: typeof opens?.[i] === "number" ? opens[i] : closes[i],
      h: typeof highs?.[i] === "number" ? highs[i] : closes[i],
      l: typeof lows?.[i] === "number" ? lows[i] : closes[i],
      c: closes[i],
      v: typeof volumes?.[i] === "number" ? volumes[i] : 0,
      u: up ? 1 : 0,
    });
    prevClose = closes[i];
  }

  // Split off everything before the display window. The client averages over
  // warmup + points and then keeps only the visible tail, so the first plotted
  // candle already carries a true 200-session mean.
  let warmup = null;
  let visible = points;
  let viewStart = 0;
  if (pad) {
    const cut = points.findIndex((p) => p.t >= windowStart);
    if (cut > 0) {
      warmup = points.slice(0, cut).map((p) => p.c);
      visible = points.slice(cut);
    }
  } else if (cfg.sessions) {
    const sessionDates = [...new Set(points.map((point) => new Date(point.t * 1000).toISOString().slice(0, 10)))];
    const firstVisibleDate = sessionDates[Math.max(0, sessionDates.length - cfg.sessions)];
    const cut = points.findIndex((point) => new Date(point.t * 1000).toISOString().slice(0, 10) === firstVisibleDate);
    if (history) viewStart = Math.max(0, cut);
    else if (cut > 0) visible = points.slice(cut);
  }

  return Response.json({
    symbol,
    range: rangeKey,
    points: visible,
    ...(history ? { viewStart } : {}),
    ...(warmup ? { warmup } : {}),
    prevClose: result?.meta?.chartPreviousClose ?? null,
    currency: result?.meta?.currency ?? "USD",
    price: result?.meta?.regularMarketPrice ?? (points.length ? points[points.length - 1].c : null),
    source: tradierPoints ? "tradier" : "yahoo",
  }, {
    // Live intraday data must never be served from an edge stale-while-
    // revalidate entry. Daily data remains economical to cache.
    headers: {
      "Cache-Control": intraday ? "no-store, max-age=0" : "public, s-maxage=900, stale-while-revalidate=86400",
    },
  });
}
