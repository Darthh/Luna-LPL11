import https from "node:https";
import zlib from "node:zlib";
import { EXCHANGE_FLAGS } from "@/lib/market";
import { STOCK_UNIVERSE } from "@/lib/stockMapData";
import { invalidateYahooSession, yahooSession } from "@/lib/symbolProfile";
import { sleep } from "@/lib/pool";
import { BROWSER_USER_AGENT } from "@/lib/userAgent";

// Aggregated company data for the stock detail page: quote + valuation
// stats + company profile + quarterly EPS history + industry peers.

const raw = (v) => (typeof v?.raw === "number" ? v.raw : typeof v === "number" ? v : null);

// Yahoo tells apart a symbol that doesn't exist (404 "Not Found") from a
// session or throttling problem (401 "Invalid Crumb", 429, 5xx). Only the
// first means the ticker is bad; the rest are transient and worth retrying,
// so they must not be reported to the user as an unknown ticker.
async function fetchSummary(symbol, session, fresh) {
  const modules =
    "price,summaryDetail,defaultKeyStatistics,financialData,assetProfile,recommendationTrend,earningsHistory,earningsTrend,calendarEvents,majorHoldersBreakdown,institutionOwnership,fundOwnership";
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}&crumb=${encodeURIComponent(session.crumb)}`;
  // A retry bypasses the data cache so it can't re-read the failed response.
  const res = await fetch(url, {
    headers: { "User-Agent": BROWSER_USER_AGENT, Cookie: session.cookie },
    ...(fresh ? { cache: "no-store" } : { next: { revalidate: 900 } }),
  });

  if (res.status === 404) return { outcome: "unknown-ticker" };
  if (res.status === 401) {
    // The crumb went stale - drop it so the next attempt mints a new one.
    invalidateYahooSession();
    return { outcome: "retry", reason: "401" };
  }
  if (!res.ok) return { outcome: "retry", reason: String(res.status) };

  const json = await res.json().catch(() => null);
  const summary = json?.quoteSummary?.result?.[0] ?? null;
  if (!summary?.price) return { outcome: "retry", reason: "empty" };
  return { outcome: "ok", summary };
}

// Tries a few times through fresh sessions before concluding anything, so a
// single blip can't masquerade as a bad ticker.
async function loadSummary(symbol) {
  const attempts = 3;
  let reason = "unavailable";
  for (let i = 0; i < attempts; i++) {
    const fresh = i > 0;
    try {
      const session = await yahooSession({ fresh });
      const result = await fetchSummary(symbol, session, fresh);
      if (result.outcome === "ok") return { summary: result.summary, session };
      if (result.outcome === "unknown-ticker") return { unknownTicker: true };
      reason = result.reason;
    } catch (err) {
      invalidateYahooSession();
      reason = err?.message ?? "network";
    }
    if (i < attempts - 1) await sleep(300 * (i + 1));
  }
  return { unavailable: true, reason };
}

// Reported fundamentals from Yahoo's timeseries feed: quarterly diluted
// EPS (GAAP) plus quarterly and annual revenue / net income. The free feed
// only returns the most recent ~5 quarters / years even when asked for 3+.
// The first five drive the Overview charts. The rest fill the Financials
// tab's period matrix - the same line items, read annually and quarterly, so
// one request serves both toggles.
const TS_METRICS = [
  "TotalRevenue",
  "GrossProfit",
  "EBITDA",
  "OperatingIncome",
  "NetIncome",
  "DilutedEPS",
  "OperatingCashFlow",
  "CapitalExpenditure",
  "FreeCashFlow",
  "CashAndCashEquivalents",
  "TotalDebt",
  "TotalAssets",
  "TotalEquityGrossMinorityInterest",
];
const TS_TYPES = [
  ...TS_METRICS.map((m) => `quarterly${m}`),
  ...TS_METRICS.map((m) => `annual${m}`),
];

async function fetchTimeseries(symbol, session, hot) {
  const period2 = Math.floor(Date.now() / 1000) + 86400;
  // Six years back rather than four: the Financials tab shows annual columns,
  // and the feed returns what it has within the window rather than everything
  // asked for.
  const period1 = period2 - 6 * 365 * 86400;
  const url = `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}?type=${TS_TYPES.join(",")}&period1=${period1}&period2=${period2}&crumb=${encodeURIComponent(session.crumb)}`;
  const json = await (
    await fetch(url, {
      headers: { "User-Agent": BROWSER_USER_AGENT, Cookie: session.cookie },
      next: { revalidate: hot ? FRESH_REVALIDATE : 3600 },
    })
  ).json();

  const out = {};
  for (const result of json?.timeseries?.result ?? []) {
    const type = result?.meta?.type?.[0];
    if (!type || !result[type]) continue;
    out[type] = result[type]
      .filter((r) => r?.asOfDate && typeof r?.reportedValue?.raw === "number")
      .map((r) => ({ date: r.asOfDate, value: r.reportedValue.raw }));
  }
  return out;
}

// Nasdaq lists recent reported quarters plus consensus for upcoming ones.
async function fetchNasdaqEps(symbol, hot) {
  const url = `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/eps`;
  const json = await (
    await fetch(url, {
      headers: { "User-Agent": BROWSER_USER_AGENT, Accept: "application/json" },
      next: { revalidate: hot ? FRESH_REVALIDATE : 3600 },
    })
  ).json();
  const rows = json?.data?.earningsPerShare ?? [];
  return rows
    .filter((r) => r?.period)
    .map((r) => {
      const d = new Date(`1 ${r.period}`);
      return {
        date: Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10),
        label: r.period,
        actual: r.type === "PreviousQuarter" && r.earnings ? r.earnings : null,
        estimate: typeof r.consensus === "number" ? r.consensus : null,
        upcoming: r.type === "UpcomingQuarter",
      };
    })
    .filter((r) => r.date);
}

// Yahoo's HTML pages answer with ~30KB of response headers (a 21KB `link`
// preload list alone), which overflows undici's 16KB cap and makes a plain
// fetch() throw HeadersOverflowError. node:https takes a per-request
// maxHeaderSize, so the scrape goes through it instead.
function fetchHtml(url, timeoutMs = 12000, redirects = 3) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "GET",
        headers: {
          "User-Agent": BROWSER_USER_AGENT,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate",
        },
        maxHeaderSize: 262144,
        timeout: timeoutMs,
      },
      (res) => {
        const { statusCode, headers } = res;
        if (statusCode >= 300 && statusCode < 400 && headers.location && redirects > 0) {
          res.resume();
          fetchHtml(new URL(headers.location, url).href, timeoutMs, redirects - 1).then(resolve, reject);
          return;
        }
        const encoding = headers["content-encoding"];
        const stream =
          encoding === "gzip"
            ? res.pipe(zlib.createGunzip())
            : encoding === "deflate"
              ? res.pipe(zlib.createInflate())
              : res;
        const chunks = [];
        stream.on("data", (c) => chunks.push(c));
        stream.on("end", () => resolve({ status: statusCode, body: Buffer.concat(chunks).toString("utf8") }));
        stream.on("error", reject);
      }
    );
    req.on("timeout", () => req.destroy(new Error("Timed out")));
    req.on("error", reject);
    req.end();
  });
}

// Scraped HTML can't ride Next's fetch cache, so hold results in a small
// bounded TTL cache instead.
const CALENDAR_TTL = 6 * 3600 * 1000;
const CALENDAR_MAX = 200;
const calendarCache = new Map();

// Hours-long cache entries are what a company's results have to get past to
// reach the charts, so around its reporting date every earnings feed drops to
// a few minutes and the quarter lands while the number is still news. Yahoo
// leaves the date on the day it happened for a while afterwards, which is
// what closes the window again once the feeds have all caught up.
const FRESH_TTL = 5 * 60 * 1000;
const FRESH_REVALIDATE = 300;
const WINDOW_BEFORE = 2 * 86400 * 1000;
const WINDOW_AFTER = 4 * 86400 * 1000;

// True while `calendarEvents` puts a report within reach - a date Yahoo has
// confirmed or still only estimates, since an estimated one is just as likely
// to be the day the results actually appear.
function reporting(calendarEvents) {
  const now = Date.now();
  return (calendarEvents?.earnings?.earningsDate ?? []).some((d) => {
    const at = raw(d);
    return at != null && at * 1000 > now - WINDOW_AFTER && at * 1000 < now + WINDOW_BEFORE;
  });
}

const cellNumber = (s) => {
  const v = Number(String(s).replace(/[+,%]/g, "").trim());
  return Number.isFinite(v) ? v : null;
};

// stockanalysis.com's earnings endpoint: a report date, the consensus and
// the reported EPS for every quarter back ~15 years, as plain JSON.
//
// This is the feed the earnings markers on the price chart depend on. The
// Yahoo calendar below is a *scrape*, and it answers a datacenter with a
// consent page rather than the table - so in production every quarter lost
// its report date and the chart drew no markers at all, while the same code
// looked perfect from a laptop. This endpoint is a real JSON API on a host
// the deep financials already come from, needs no key or browser headers,
// and answers the same from anywhere. It leads; the scrapes fill gaps.
async function fetchStockAnalysisEarnings(symbol, hot) {
  // Class shares are `brk.b` here, the same spelling the financials use.
  const slug = symbol.toLowerCase().replace(/-/g, ".");
  const res = await fetch(`https://stockanalysis.com/api/symbol/s/${encodeURIComponent(slug)}/earnings`, {
    headers: { Accept: "application/json" },
    next: { revalidate: hot ? FRESH_REVALIDATE : 21600 },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();

  const num = (v) => (typeof v === "number" ? v : null);
  return (Array.isArray(json?.data) ? json.data : [])
    // A row with neither number is a scheduled date nobody has an estimate
    // for yet, which is not something to mark or tabulate.
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r?.date ?? "") &&
      (num(r.eps_actual) != null || num(r.eps_est) != null))
    .map((r) => ({ reportDate: r.date, estimate: num(r.eps_est), actual: num(r.eps_actual) }))
    .sort((a, b) => a.reportDate.localeCompare(b.reportDate));
}

// Yahoo's earnings calendar is the one free feed with a consensus estimate
// on *every* past quarter - the quoteSummary modules only carry the last
// four. Rows are report dates (a few weeks after the quarter they cover),
// newest first; returned oldest-first.
async function fetchYahooEarningsCalendar(symbol, hot) {
  const hit = calendarCache.get(symbol);
  if (hit && Date.now() - hit.at < (hot ? FRESH_TTL : CALENDAR_TTL)) return hit.rows;

  const url = `https://finance.yahoo.com/calendar/earnings?symbol=${encodeURIComponent(symbol)}&size=40`;
  // A refresh that can't be completed must not cost us the rows we already
  // have - dropping them takes the consensus estimate off every past quarter.
  let body;
  try {
    const res = await fetchHtml(url);
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    body = res.body;
  } catch (err) {
    if (hit) return hit.rows;
    throw err;
  }

  const rows = [];
  for (const chunk of body.split('data-testid="data-table-v2-row"').slice(1)) {
    const cells = {};
    const re = /data-testid-cell="([a-z]+)"[^>]*>([\s\S]*?)<\/td>/g;
    let m;
    while ((m = re.exec(chunk))) {
      cells[m[1]] = m[2].replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").trim();
    }
    // "August 26, 2026 at 4 PM EDT" - the clock time and zone are noise here.
    const when = Date.parse((cells.startdatetime ?? "").replace(/ at .*/, ""));
    if (!Number.isFinite(when)) continue;
    const estimate = cellNumber(cells.epsestimate);
    const actual = cellNumber(cells.epsactual);
    // Rows with neither number are non-earnings events (shareholder
    // meetings and the like).
    if (estimate == null && actual == null) continue;
    rows.push({ reportDate: new Date(when).toISOString().slice(0, 10), estimate, actual });
  }
  rows.sort((a, b) => a.reportDate.localeCompare(b.reportDate));

  // A throttled scrape comes back as a perfectly good 200 carrying a consent
  // page instead of the table, which parses to nothing. That reads as "this
  // company has never reported", so it's treated as the failure it is rather
  // than cached over the real rows.
  if (!rows.length) return hit?.rows ?? rows;

  if (calendarCache.size >= CALENDAR_MAX) calendarCache.delete(calendarCache.keys().next().value);
  calendarCache.set(symbol, { at: Date.now(), rows });
  return rows;
}

// Yahoo exchange code → the exchange segment MarketBeat puts in its URLs.
const MARKETBEAT_EXCHANGE = {
  NMS: "NASDAQ", NGM: "NASDAQ", NCM: "NASDAQ", NAS: "NASDAQ",
  NYQ: "NYSE", ASE: "NYSEAMERICAN", PCX: "NYSEARCA", BTS: "BATS",
};

// "$35.91B" / "$11.9 B" / "$412.5 M" → a plain number.
function moneyCell(s) {
  const m = /(-?[\d.,]+)\s*([BMTK])?/i.exec(String(s).replace(/[$,]/g, ""));
  if (!m) return null;
  const v = Number(m[1]);
  if (!Number.isFinite(v)) return null;
  return v * ({ T: 1e12, B: 1e9, M: 1e6, K: 1e3 }[(m[2] ?? "").toUpperCase()] ?? 1);
}

const MARKETBEAT_TTL = 6 * 3600 * 1000;
const marketBeatCache = new Map();

// Consensus *revenue* per past quarter, which none of the JSON feeds carry -
// Yahoo's calendar is EPS-only and stockanalysis publishes estimates for
// coming quarters only. MarketBeat's earnings table has both the revenue
// estimate and what was reported against it, ~8 quarters deep.
async function fetchMarketBeatEarnings(symbol, exchangeCode, hot) {
  const exchange = MARKETBEAT_EXCHANGE[exchangeCode];
  if (!exchange) return [];

  const key = `${exchange}:${symbol}`;
  const hit = marketBeatCache.get(key);
  if (hit && Date.now() - hit.at < (hot ? FRESH_TTL : MARKETBEAT_TTL)) return hit.rows;

  const url = `https://www.marketbeat.com/stocks/${exchange}/${encodeURIComponent(symbol)}/earnings/`;
  let body;
  try {
    const res = await fetchHtml(url);
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    body = res.body;
  } catch (err) {
    if (hit) return hit.rows;
    throw err;
  }

  const start = body.indexOf('id="earnings-history"');
  if (start < 0) return hit?.rows ?? [];
  const table = body.slice(start, body.indexOf("</table>", start));

  const rows = [];
  for (const rowHtml of table.split("<tr>").slice(1)) {
    const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
      m[1].replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
    );
    if (cells.length < 8) continue;
    // Machine-readable date on the first cell: "20260624000000".
    const stamp = /data-sort-value="(\d{8})/.exec(rowHtml)?.[1];
    if (!stamp) continue;
    rows.push({
      reportDate: `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`,
      revenueEstimate: moneyCell(cells[6]),
      revenueActual: moneyCell(cells[7]),
    });
  }
  const parsed = rows.filter((r) => r.revenueEstimate != null && r.revenueActual != null).reverse();
  // Same reasoning as the calendar above: an empty table is a page that
  // didn't load properly, not a company with no revenue history.
  if (!parsed.length) return hit?.rows ?? parsed;

  if (marketBeatCache.size >= CALENDAR_MAX) marketBeatCache.delete(marketBeatCache.keys().next().value);
  marketBeatCache.set(key, { at: Date.now(), rows: parsed });
  return parsed;
}

const monthLabel = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" });

// Join two {date, value} series (e.g. revenue and net income) by date.
function joinSeries(revenue = [], netIncome = []) {
  const byDate = new Map();
  for (const r of revenue) byDate.set(r.date, { date: r.date, label: monthLabel(r.date), revenue: r.value, netIncome: null });
  for (const n of netIncome) {
    const row = byDate.get(n.date);
    if (row) row.netIncome = n.value;
    else byDate.set(n.date, { date: n.date, label: monthLabel(n.date), revenue: null, netIncome: n.value });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// The Financials tab's period matrix: line items down, reporting periods
// across. Built for one basis ("annual" or "quarterly") out of the timeseries
// the route already fetched, so the tab costs no extra request.
//
// Values stay in millions the way a filing's own statements are read, and
// growth/margin arrive as their own rows rather than as a second number in a
// cell - they line up under the figure they describe.
function financialMatrix(ts, basis) {
  const at = (metric) => ts[`${basis}${metric}`] ?? [];
  // Every date any line item reported, oldest first, so a metric that starts
  // late (or stops) leaves a gap rather than shifting the columns under it.
  const periods = [
    ...new Set(TS_METRICS.flatMap((m) => at(m).map((r) => r.date))),
  ].sort();
  if (!periods.length) return null;

  const seriesOf = (metric) => {
    const byDate = new Map(at(metric).map((r) => [r.date, r.value]));
    return periods.map((d) => byDate.get(d) ?? null);
  };
  const million = (vals) => vals.map((v) => (v == null ? null : v / 1e6));
  // Period-over-period growth, in percent; null wherever there is no prior
  // period to measure from or the base is zero.
  const growth = (vals) =>
    vals.map((v, i) => {
      const prev = vals[i - 1];
      return v == null || prev == null || !prev ? null : ((v - prev) / Math.abs(prev)) * 100;
    });
  const marginOf = (vals, revenue) =>
    vals.map((v, i) => (v == null || !revenue[i] ? null : (v / revenue[i]) * 100));

  const revenue = seriesOf("TotalRevenue");
  const row = (label, values, kind = "money", sub = null) => ({ label, values, kind, sub });

  const rows = [
    row("Revenue", million(revenue)),
    row("% Growth", growth(revenue), "percent", true),
    row("Gross Profit", million(seriesOf("GrossProfit"))),
    row("% Margin", marginOf(seriesOf("GrossProfit"), revenue), "percent", true),
    row("EBITDA", million(seriesOf("EBITDA"))),
    row("% Margin", marginOf(seriesOf("EBITDA"), revenue), "percent", true),
    row("Operating Income", million(seriesOf("OperatingIncome"))),
    row("% Margin", marginOf(seriesOf("OperatingIncome"), revenue), "percent", true),
    row("Net Income", million(seriesOf("NetIncome"))),
    row("% Margin", marginOf(seriesOf("NetIncome"), revenue), "percent", true),
    row("Diluted EPS", seriesOf("DilutedEPS"), "eps"),
    row("% Growth", growth(seriesOf("DilutedEPS")), "percent", true),
    row("Operating Cash Flow", million(seriesOf("OperatingCashFlow"))),
    row("CapEx", million(seriesOf("CapitalExpenditure"))),
    row("Free Cash Flow", million(seriesOf("FreeCashFlow"))),
    row("Cash", million(seriesOf("CashAndCashEquivalents"))),
    row("Total Debt", million(seriesOf("TotalDebt"))),
    row("Total Assets", million(seriesOf("TotalAssets"))),
    row("Shareholder Equity", million(seriesOf("TotalEquityGrossMinorityInterest"))),
  ];

  // A line item the feed has nothing for on this basis is dropped along with
  // the growth/margin row under it, rather than printing a row of dashes.
  const kept = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.sub) continue;
    if (!r.values.some((v) => v != null)) continue;
    kept.push(r);
    const next = rows[i + 1];
    if (next?.sub && next.values.some((v) => v != null)) kept.push(next);
  }
  return { periods, rows: kept };
}

// Decodes a SvelteKit "devalue" flat array (index-referenced) back into a
// normal object graph. stockanalysis.com ships its financial tables this way.
function devalue(flat) {
  const cache = new Array(flat.length);
  const walk = (i) => {
    if (i === -1) return null;
    if (i < 0 || i >= flat.length) return undefined;
    if (cache[i] !== undefined) return cache[i];
    const v = flat[i];
    if (v === null || typeof v !== "object") return (cache[i] = v);
    if (Array.isArray(v)) {
      const a = [];
      cache[i] = a;
      for (const idx of v) a.push(walk(idx));
      return a;
    }
    const o = {};
    cache[i] = o;
    for (const k in v) o[k] = walk(v[k]);
    return o;
  };
  return walk(0);
}

// First array-valued property present under any of `names`. The feed has
// renamed these columns before (epsDiluted → epsdil), so every read goes
// through here with the historical spellings as fallbacks.
const column = (obj, names) => {
  for (const n of names) if (Array.isArray(obj?.[n])) return obj[n];
  return null;
};

// Up to ~20 quarters of factual financials (revenue, net income, diluted
// EPS) from stockanalysis.com - deeper than Yahoo's free 5-quarter feed.
// Returned newest-first, so reversed to chronological.
async function fetchDeepFinancials(symbol, hot) {
  // Class shares are `brk.b` here, not Yahoo's `BRK-B`.
  const slug = symbol.toLowerCase().replace(/-/g, ".");
  const url = `https://stockanalysis.com/stocks/${slug}/financials/__data.json?p=quarterly`;
  const res = await fetch(url, {
    headers: { "User-Agent": BROWSER_USER_AGENT },
    next: { revalidate: hot ? FRESH_REVALIDATE : 21600 },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();

  // The income statement now lives in one of several `sections[].data`
  // blocks rather than a single top-level table, so walk the whole graph for
  // the one carrying both revenue and diluted EPS.
  let fin = null;
  for (const node of json?.nodes ?? []) {
    if (node?.type !== "data" || !node.data) continue;
    const root = devalue(node.data);
    const stack = [root];
    const seen = new Set();
    while (stack.length && !fin) {
      const o = stack.pop();
      if (!o || typeof o !== "object" || seen.has(o)) continue;
      seen.add(o);
      if (Array.isArray(o.datekey) && column(o, ["revenue"]) && column(o, ["epsdil", "epsDiluted"])) {
        fin = o;
        break;
      }
      for (const k in o) if (o[k] && typeof o[k] === "object") stack.push(o[k]);
    }
    if (fin) break;
  }
  if (!fin) return [];

  const eps = column(fin, ["epsdil", "epsDiluted"]) ?? [];
  const revenue = column(fin, ["revenue"]) ?? [];
  const netIncome = column(fin, ["netinccmn", "netIncome", "netinc"]) ?? [];
  const rows = [];
  for (let i = 0; i < fin.datekey.length; i++) {
    const date = fin.datekey[i];
    if (!date) continue;
    rows.push({
      date,
      fyLabel: fin.fiscalQuarter?.[i] && fin.fiscalYear?.[i]
        ? `${fin.fiscalQuarter[i]} FY${String(fin.fiscalYear[i]).slice(2)}`
        : monthLabel(date),
      eps: typeof eps[i] === "number" ? eps[i] : null,
      revenue: typeof revenue[i] === "number" ? revenue[i] : null,
      netIncome: typeof netIncome[i] === "number" ? netIncome[i] : null,
    });
  }
  return rows.reverse();
}

// Sector SPDR ETFs - each holds only S&P 500 constituents, so only asserted
// for S&P 500 members.
const SECTOR_SPDR = {
  Technology: "XLK",
  "Financial Services": "XLF",
  Healthcare: "XLV",
  "Consumer Cyclical": "XLY",
  "Consumer Defensive": "XLP",
  Energy: "XLE",
  Industrials: "XLI",
  Utilities: "XLU",
  "Real Estate": "XLRE",
  "Basic Materials": "XLB",
  "Communication Services": "XLC",
};

const ETF_NAMES = {
  SPY: "SPDR S&P 500 ETF", VOO: "Vanguard S&P 500 ETF", IVV: "iShares Core S&P 500 ETF",
  QQQ: "Invesco QQQ Trust", DIA: "SPDR Dow Jones Industrial", SOXX: "iShares Semiconductor ETF",
  SMH: "VanEck Semiconductor ETF", XLK: "Technology Select Sector SPDR", XLF: "Financial Select Sector SPDR",
  XLV: "Health Care Select Sector SPDR", XLY: "Consumer Discretionary SPDR", XLP: "Consumer Staples SPDR",
  XLE: "Energy Select Sector SPDR", XLI: "Industrial Select Sector SPDR", XLU: "Utilities Select Sector SPDR",
  XLRE: "Real Estate Select Sector SPDR", XLB: "Materials Select Sector SPDR", XLC: "Communication Services SPDR",
  VTI: "Vanguard Total Stock Market", ITOT: "iShares Core S&P Total US",
  VXUS: "Vanguard Total International Stock", IXUS: "iShares Core MSCI Total Intl",
  ACWX: "iShares MSCI ACWI ex U.S.", IEFA: "iShares Core MSCI EAFE", EFA: "iShares MSCI EAFE",
  VEA: "Vanguard FTSE Developed Markets", SCHF: "Schwab International Equity",
  IEMG: "iShares Core MSCI Emerging Markets", EEM: "iShares MSCI Emerging Markets",
  VWO: "Vanguard FTSE Emerging Markets", SCHE: "Schwab Emerging Markets Equity",
  EWJ: "iShares MSCI Japan", EWU: "iShares MSCI United Kingdom", EWG: "iShares MSCI Germany",
  EWQ: "iShares MSCI France", EWL: "iShares MSCI Switzerland", EWN: "iShares MSCI Netherlands",
  EWA: "iShares MSCI Australia", EWC: "iShares MSCI Canada", EWP: "iShares MSCI Spain",
  EWI: "iShares MSCI Italy", EWD: "iShares MSCI Sweden", EWH: "iShares MSCI Hong Kong",
  EWS: "iShares MSCI Singapore", EWK: "iShares MSCI Belgium", EWO: "iShares MSCI Austria",
  EDEN: "iShares MSCI Denmark", NORW: "Global X MSCI Norway", EIRL: "iShares MSCI Ireland",
  ENZL: "iShares MSCI New Zealand", EIS: "iShares MSCI Israel", PGAL: "Global X MSCI Portugal",
  MCHI: "iShares MSCI China", FXI: "iShares China Large-Cap", EWT: "iShares MSCI Taiwan",
  EWY: "iShares MSCI South Korea", INDA: "iShares MSCI India", EWZ: "iShares MSCI Brazil",
  EWW: "iShares MSCI Mexico", EZA: "iShares MSCI South Africa", KSA: "iShares MSCI Saudi Arabia",
  EIDO: "iShares MSCI Indonesia", THD: "iShares MSCI Thailand", EWM: "iShares MSCI Malaysia",
  TUR: "iShares MSCI Turkey", ECH: "iShares MSCI Chile", EPOL: "iShares MSCI Poland",
  EPHE: "iShares MSCI Philippines", GREK: "Global X MSCI Greece", QAT: "iShares MSCI Qatar",
  UAE: "iShares MSCI UAE", EPU: "iShares MSCI Peru", GXG: "Global X MSCI Colombia",
};

// Index region by company domicile, with the country fund that tracks it.
// `ftseDev` marks the one place the two big index families disagree that
// matters here: FTSE calls South Korea developed (so it sits in VEA, not
// VWO) while MSCI still calls it emerging (IEMG, EEM).
const COUNTRY_INDEX = {
  Japan: { region: "dev", etf: "EWJ" }, "United Kingdom": { region: "dev", etf: "EWU" },
  Germany: { region: "dev", etf: "EWG" }, France: { region: "dev", etf: "EWQ" },
  Switzerland: { region: "dev", etf: "EWL" }, Netherlands: { region: "dev", etf: "EWN" },
  Australia: { region: "dev", etf: "EWA" }, Spain: { region: "dev", etf: "EWP" },
  Italy: { region: "dev", etf: "EWI" }, Sweden: { region: "dev", etf: "EWD" },
  "Hong Kong": { region: "dev", etf: "EWH" }, Singapore: { region: "dev", etf: "EWS" },
  Belgium: { region: "dev", etf: "EWK" }, Austria: { region: "dev", etf: "EWO" },
  Denmark: { region: "dev", etf: "EDEN" }, Norway: { region: "dev", etf: "NORW" },
  Ireland: { region: "dev", etf: "EIRL" }, "New Zealand": { region: "dev", etf: "ENZL" },
  Israel: { region: "dev", etf: "EIS" }, Portugal: { region: "dev", etf: "PGAL" },
  Finland: { region: "dev", etf: null },
  // Canada is developed but sits outside EAFE, so IEFA/EFA never hold it.
  Canada: { region: "dev", etf: "EWC", eafe: false },
  China: { region: "em", etf: "MCHI" }, Taiwan: { region: "em", etf: "EWT" },
  "South Korea": { region: "em", etf: "EWY", ftseDev: true },
  India: { region: "em", etf: "INDA" }, Brazil: { region: "em", etf: "EWZ" },
  Mexico: { region: "em", etf: "EWW" }, "South Africa": { region: "em", etf: "EZA" },
  "Saudi Arabia": { region: "em", etf: "KSA" }, Indonesia: { region: "em", etf: "EIDO" },
  Thailand: { region: "em", etf: "THD" }, Malaysia: { region: "em", etf: "EWM" },
  Turkey: { region: "em", etf: "TUR" }, Chile: { region: "em", etf: "ECH" },
  Poland: { region: "em", etf: "EPOL" }, Philippines: { region: "em", etf: "EPHE" },
  Greece: { region: "em", etf: "GREK" }, Qatar: { region: "em", etf: "QAT" },
  "United Arab Emirates": { region: "em", etf: "UAE" }, Peru: { region: "em", etf: "EPU" },
  Colombia: { region: "em", etf: "GXG" },
};

// The narrow funds hold only large/mid caps (EFA carries ~700 names against
// IEFA's ~2,600), so they're only asserted above this market cap. A local
// listing quotes its cap in local currency, which is left as unknown rather
// than compared against a dollar figure - those pages get the broad
// total-market funds and their country fund instead.
const LARGE_CAP_USD = 5e9;

// Panel depth: the candidate list runs past this for an international name,
// so the most-traded funds win the slots.
const MAX_ETF_HOLDERS = 8;

// Which big ETFs hold this stock, ranked by each ETF's own trading volume.
// Membership is inferred rather than looked up: index membership and sector
// for US names, domicile for everything else. The broad international funds
// are total-market (VXUS ~8,800 holdings, IEMG ~2,900), so a listed company
// of any size in a covered country is in them; matching is at the company
// level, which is what makes IEMG show up for TSM even though the fund holds
// the Taiwan line (2330.TW) rather than the ADR.
async function fetchEtfHolders(symbol, entry, sector, industry, session, country, marketCapUsd) {
  const set = new Set();
  const idx = entry?.indexes ?? [];
  if (idx.includes("sp500")) ["SPY", "VOO", "IVV"].forEach((e) => set.add(e));
  if (idx.includes("ndx100")) set.add("QQQ");
  if (idx.includes("dow30")) set.add("DIA");
  if (idx.includes("soxx") || /semiconductor/i.test(industry ?? "")) {
    set.add("SOXX");
    set.add("SMH");
  }
  if (idx.includes("sp500") && SECTOR_SPDR[sector]) set.add(SECTOR_SPDR[sector]);

  const home = country ? COUNTRY_INDEX[country] : null;
  if (country === "United States") {
    // Total-market funds hold essentially every US listing, index or not.
    ["VTI", "ITOT"].forEach((e) => set.add(e));
  } else if (home) {
    const big = marketCapUsd != null && marketCapUsd >= LARGE_CAP_USD;
    ["VXUS", "IXUS"].forEach((e) => set.add(e));
    if (big) set.add("ACWX");
    if (home.region === "dev") {
      set.add("VEA");
      set.add("SCHF");
      if (home.eafe !== false) {
        set.add("IEFA");
        if (big) set.add("EFA");
      }
    } else {
      set.add("IEMG");
      set.add("SCHE");
      if (big) set.add("EEM");
      // FTSE-developed Korea rides in VEA instead of VWO.
      set.add(home.ftseDev ? "VEA" : "VWO");
    }
    if (home.etf) set.add(home.etf);
  }

  set.delete(symbol);
  const tickers = [...set];
  if (!tickers.length) return [];

  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${tickers.join(",")}&fields=regularMarketVolume,regularMarketPrice,regularMarketChangePercent,shortName&crumb=${encodeURIComponent(session.crumb)}`;
    const json = await (
      await fetch(url, { headers: { "User-Agent": BROWSER_USER_AGENT, Cookie: session.cookie }, next: { revalidate: 900 } })
    ).json();
    const bySymbol = new Map((json?.quoteResponse?.result ?? []).map((r) => [r.symbol, r]));
    return tickers
      .map((t) => {
        const q = bySymbol.get(t);
        return {
          symbol: t,
          name: ETF_NAMES[t] ?? q?.shortName ?? t,
          volume: q?.regularMarketVolume ?? 0,
          price: q?.regularMarketPrice ?? null,
          changePct: q?.regularMarketChangePercent ?? null,
        };
      })
      .sort((a, b) => b.volume - a.volume)
      .slice(0, MAX_ETF_HOLDERS);
  } catch {
    return tickers
      .slice(0, MAX_ETF_HOLDERS)
      .map((t) => ({ symbol: t, name: ETF_NAMES[t] ?? t, volume: 0, price: null, changePct: null }));
  }
}

// Peer companies from the same industry in our static universe, with a
// live quote from the spark endpoint.
async function fetchPeers(symbol, industry, sector) {
  let peers = STOCK_UNIVERSE.filter((s) => s.symbol !== symbol && s.industry === industry);
  if (peers.length < 5 && sector) {
    const extra = STOCK_UNIVERSE.filter(
      (s) => s.symbol !== symbol && s.sector === sector && s.industry !== industry
    );
    peers = [...peers, ...extra];
  }
  peers = peers.sort((a, b) => b.cap - a.cap).slice(0, 5);
  if (!peers.length) return [];

  try {
    const symbols = peers.map((p) => p.symbol).join(",");
    const json = await (
      await fetch(
        `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${symbols}&range=3mo&interval=1d`,
        { headers: { "User-Agent": BROWSER_USER_AGENT }, next: { revalidate: 300 } }
      )
    ).json();
    return peers.map((p) => {
      const closes = (json?.[p.symbol]?.close ?? []).filter((c) => typeof c === "number");
      const last = closes[closes.length - 1] ?? null;
      const prev = closes[closes.length - 2] ?? null;
      return {
        symbol: p.symbol,
        name: p.name,
        industry: p.industry,
        cap: p.cap,
        price: last,
        changePct: last != null && prev ? ((last - prev) / prev) * 100 : null,
        // The card's 3M sparkline. Same request as the quote above - the range
        // widened from 5d, so the daily closes are already here.
        spark: closes,
        sparkChangePct:
          closes.length > 1 && closes[0] ? ((last - closes[0]) / closes[0]) * 100 : null,
      };
    });
  } catch {
    return peers.map((p) => ({
      symbol: p.symbol,
      name: p.name,
      industry: p.industry,
      cap: p.cap,
      price: null,
      changePct: null,
      spark: [],
      sparkChangePct: null,
    }));
  }
}

// IPO date comes from the chart endpoint's firstTradeDate meta.
async function fetchFirstTradeDate(symbol) {
  try {
    const json = await (
      await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`,
        { headers: { "User-Agent": BROWSER_USER_AGENT }, next: { revalidate: 86400 } }
      )
    ).json();
    const ms = json?.chart?.result?.[0]?.meta?.firstTradeDate;
    return ms ? new Date(ms * 1000).toISOString().slice(0, 10) : null;
  } catch {
    return null;
  }
}

// AlphaVantage EARNINGS: reported + estimated EPS for every quarter going
// back years - the only free source with a consensus estimate on each
// historical quarter (Yahoo/Nasdaq only cover the last ~4). Needs a free
// API key in ALPHAVANTAGE_API_KEY; returns [] when absent or rate-limited.
async function fetchAlphaVantageEps(symbol) {
  const key = process.env.ALPHAVANTAGE_API_KEY;
  if (!key) return [];
  try {
    const url = `https://www.alphavantage.co/query?function=EARNINGS&symbol=${encodeURIComponent(symbol)}&apikey=${key}`;
    const json = await (
      await fetch(url, { headers: { "User-Agent": BROWSER_USER_AGENT }, next: { revalidate: 86400 } })
    ).json();
    const rows = json?.quarterlyEarnings;
    if (!Array.isArray(rows) || !rows.length) return [];
    return rows
      .filter((r) => r?.fiscalDateEnding && r.reportedEPS !== "None" && r.reportedEPS != null)
      .map((r) => ({
        date: r.fiscalDateEnding,
        actual: Number(r.reportedEPS),
        estimate: r.estimatedEPS != null && r.estimatedEPS !== "None" ? Number(r.estimatedEPS) : null,
      }))
      .filter((r) => Number.isFinite(r.actual))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

// Last resort for a market cap, when a whole Yahoo response arrives without
// one and without the shares to rebuild it. Finnhub's company profile carries
// the figure in millions of USD and agrees with Yahoo's to the dollar wherever
// both have it. Only for a listing quoted in dollars: pairing a USD cap with a
// price in another currency would misstate the company by the exchange rate,
// which is the same trap the revenue consensus above steps around.
// Polygon has the field too and is deliberately not used - its number comes
// off a different price snapshot and reads 10% away from Yahoo's on the very
// symbols this is here for, which is worse than saying nothing.
// Recent company news, from the same Finnhub key the market-cap lookup uses.
// Unlike the Exa-backed catalyst feed this is per-ticker and unrated, so it
// needs no session and no rate-limit budget - it is the headline list, not the
// research one.
const NEWS_DAYS = 21;
const NEWS_LIMIT = 12;

async function fetchFinnhubNews(symbol, companyName) {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return [];

  const day = 86400_000;
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  const url =
    `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}` +
    `&from=${iso(Date.now() - NEWS_DAYS * day)}&to=${iso(Date.now() + day)}&token=${key}`;
  const res = await fetch(url, { headers: { Accept: "application/json" }, next: { revalidate: 900 } });
  if (!res.ok) return [];
  const json = await res.json();
  if (!Array.isArray(json)) return [];

  // Finnhub's per-ticker feed is loose: a market wrap that mentions the
  // company in passing is tagged the same as a story about it. Stories that
  // actually name the company come first, so the list reads as this
  // company's news, with the rest kept only to fill it out.
  //
  // The first word of the name is what a headline uses ("Nvidia", not
  // "NVIDIA Corporation"), and short tickers alone match too much prose to
  // be worth testing on their own.
  const firstWord = String(companyName ?? "").split(/[\s,.]+/)[0] ?? "";
  const names = [symbol, firstWord].filter((n) => n.length >= 3).map((n) => n.toLowerCase());
  const isAbout = (text) => names.some((n) => text.includes(n));

  // Finnhub repeats a story across syndicating outlets, so one headline wins
  // and the rest are dropped rather than filling the list with the same news.
  const seen = new Set();
  const rows = [];
  for (const r of json.sort((a, b) => (b.datetime ?? 0) - (a.datetime ?? 0))) {
    const headline = String(r?.headline ?? "").trim();
    const url = r?.url;
    if (!headline || !url) continue;
    const dedupe = headline.toLowerCase();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const summary = String(r.summary ?? "").trim();
    rows.push({
      headline,
      url,
      source: r.source ?? null,
      summary: summary || null,
      image: r.image || null,
      datetime: (r.datetime ?? 0) * 1000,
      about: isAbout(`${dedupe} ${summary.toLowerCase()}`),
    });
  }

  const ranked = [...rows.filter((r) => r.about), ...rows.filter((r) => !r.about)];
  return ranked.slice(0, NEWS_LIMIT).map(({ about, ...row }) => row);
}

async function fetchFinnhubMarketCap(symbol) {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;

  const url = `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${key}`;
  const res = await fetch(url, { headers: { Accept: "application/json" }, next: { revalidate: 3600 } });
  if (!res.ok) return null;
  const json = await res.json();
  const millions = json?.marketCapitalization;
  if (typeof millions !== "number" || !(millions > 0) || json?.currency !== "USD") return null;
  return millions * 1e6;
}

const NO_EARNINGS = { quarters: [], calendar: [], revenue: [] };

// Finnhub publishes a reported quarter as JSON within minutes of the release,
// and is the only free feed carrying a revenue consensus beside the EPS one -
// between them that's every number the Earnings cards draw for the quarter
// just announced. The free tier is shallow (four reported quarters, plus the
// next few scheduled dates), so it leads on the quarters it covers and the
// deeper feeds above still supply the years behind them.
async function fetchFinnhubEarnings(symbol, hot) {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return NO_EARNINGS;

  const day = 86400 * 1000;
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const opts = {
    headers: { Accept: "application/json" },
    next: { revalidate: hot ? FRESH_REVALIDATE : 3600 },
  };
  const at = `symbol=${encodeURIComponent(symbol)}&token=${key}`;
  const json = async (url) => {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };

  // Reported quarters are keyed by the quarter they cover, scheduled ones by
  // the day the company speaks - the two halves of the page's own model.
  const [history, calendar] = await Promise.all([
    json(`https://finnhub.io/api/v1/stock/earnings?${at}`).catch(() => []),
    json(
      `https://finnhub.io/api/v1/calendar/earnings?from=${iso(Date.now() - 400 * day)}&to=${iso(Date.now() + 400 * day)}&${at}`
    ).catch(() => null),
  ]);

  const num = (v) => (typeof v === "number" ? v : null);
  const rows = calendar?.earningsCalendar ?? [];
  return {
    quarters: (Array.isArray(history) ? history : [])
      .filter((r) => r?.period)
      .map((r) => ({ date: r.period, actual: num(r.actual), estimate: num(r.estimate) })),
    calendar: rows
      .filter((r) => r?.date && (num(r.epsEstimate) != null || num(r.epsActual) != null))
      .map((r) => ({ reportDate: r.date, estimate: num(r.epsEstimate), actual: num(r.epsActual) })),
    revenue: rows
      .filter((r) => r?.date && num(r.revenueEstimate) != null && num(r.revenueActual) != null)
      .map((r) => ({
        reportDate: r.date,
        revenueEstimate: num(r.revenueEstimate),
        revenueActual: num(r.revenueActual),
      })),
  };
}

// Covers the same recent window as Finnhub, in the same shape, and is only
// asked when Finnhub had nothing for the symbol: the free plan allows a few
// hundred calls a day, which one call per page view would burn through by
// lunchtime. It also holds some symbols back as premium (402), which reads
// here as "no data" like any other miss.
async function fetchFmpEarnings(symbol, hot) {
  const key = process.env.FMP_API_KEY;
  if (!key) return NO_EARNINGS;

  const url = `https://financialmodelingprep.com/stable/earnings?symbol=${encodeURIComponent(symbol)}&limit=5&apikey=${key}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: hot ? FRESH_REVALIDATE : 3600 },
  });
  if (!res.ok) return NO_EARNINGS;
  const rows = await res.json();
  if (!Array.isArray(rows)) return NO_EARNINGS;

  const num = (v) => (typeof v === "number" ? v : null);
  return {
    quarters: [],
    calendar: rows
      .filter((r) => r?.date && (num(r.epsEstimated) != null || num(r.epsActual) != null))
      .map((r) => ({ reportDate: r.date, estimate: num(r.epsEstimated), actual: num(r.epsActual) })),
    revenue: rows
      .filter((r) => r?.date && num(r.revenueEstimated) != null && num(r.revenueActual) != null)
      .map((r) => ({
        reportDate: r.date,
        revenueEstimate: num(r.revenueEstimated),
        revenueActual: num(r.revenueActual),
      })),
  };
}

// The quarterly spine as filed with the SEC, for when stockanalysis.com - an
// undocumented endpoint that owes us nothing - stops answering and takes
// every revenue bar with it. A filing trails the release by a week or two, so
// this is the history holding its shape rather than a live feed. Free tier is
// five calls a minute, hence only on the empty path.
async function fetchPolygonFinancials(symbol) {
  const key = process.env.POLYGON_API_KEY;
  if (!key) return [];

  // Class shares are `BRK.B` here, as at stockanalysis - Yahoo's `BRK-B`
  // returns an empty result rather than an error.
  const ticker = symbol.replace(/-/g, ".");
  const url = `https://api.polygon.io/vX/reference/financials?ticker=${encodeURIComponent(ticker)}&timeframe=quarterly&order=desc&limit=20&apiKey=${key}`;
  const res = await fetch(url, { headers: { Accept: "application/json" }, next: { revalidate: 21600 } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();

  const value = (node) => (typeof node?.value === "number" ? node.value : null);
  const rows = new Map();
  for (const r of json?.results ?? []) {
    if (!r?.end_date || !r?.fiscal_period?.startsWith("Q")) continue;
    const income = r.financials?.income_statement ?? {};
    const row = {
      date: r.end_date,
      fyLabel: `${r.fiscal_period} FY${String(r.fiscal_year ?? "").slice(2)}`,
      eps: value(income.diluted_earnings_per_share),
      revenue: value(income.revenues),
      netIncome: value(income.net_income_loss),
    };
    // A quarter can be filed more than once (a 10-Q, then restated inside a
    // later filing) and one of those can carry no income statement at all.
    // Keep the filing that actually reported numbers, and one row per quarter.
    if (row.eps == null && row.revenue == null && row.netIncome == null) continue;
    if (!rows.has(row.date)) rows.set(row.date, row);
  }
  // The feed's own order mixes fiscal years around; everything downstream
  // reads this as a timeline, so it's sorted here rather than trusted.
  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export async function GET(request) {
  const symbol = request.nextUrl.searchParams.get("symbol")?.trim().toUpperCase();
  if (!symbol || !/^[A-Z0-9.^=-]{1,16}$/.test(symbol)) {
    return Response.json({ error: "Bad symbol" }, { status: 400 });
  }

  const loaded = await loadSummary(symbol);
  if (loaded.unknownTicker) {
    return Response.json({ error: "Unknown ticker" }, { status: 404 });
  }
  if (loaded.unavailable) {
    // Explicitly retryable: the ticker may well be fine, the feed isn't.
    return Response.json(
      { error: "Market data is temporarily unavailable.", retryable: true },
      { status: 503 }
    );
  }
  const { summary, session } = loaded;

  const {
    price,
    summaryDetail: sd,
    defaultKeyStatistics: ks,
    financialData: fd,
    assetProfile: ap,
    recommendationTrend: rt,
    earningsHistory: eh,
    earningsTrend: et,
    calendarEvents: ce,
    majorHoldersBreakdown: mhb,
    institutionOwnership: io,
    fundOwnership: fo,
  } = summary;

  const sector = ap?.sector ?? null;
  const industry = ap?.industry?.replace(/—/g, " - ") ?? null;
  const universeEntry = STOCK_UNIVERSE.find((s) => s.symbol === symbol) ?? null;

  const officers = ap?.companyOfficers ?? [];
  const ceo =
    officers.find((o) => /chief exec|ceo/i.test(o?.title ?? ""))?.name ?? officers[0]?.name ?? null;

  // Results are due (or just in): every feed below reads through a short TTL
  // for the next few days instead of its usual hours-long one.
  const hot = reporting(ce);

  // Yahoo drops marketCap from the price module every so often while the same
  // response still carries it under summaryDetail, and always sends the share
  // count that rebuilds it - shares times price being the definition, it comes
  // out equal to Yahoo's own figure to the dollar. Whatever it's derived from,
  // it stays in the listing's own currency.
  const shares = raw(ks?.sharesOutstanding) ?? raw(ks?.impliedSharesOutstanding);
  const livePrice = raw(price.regularMarketPrice) ?? raw(fd?.currentPrice);
  let marketCap =
    raw(price.marketCap) ??
    raw(sd?.marketCap) ??
    (shares != null && livePrice != null ? shares * livePrice : null);

  // A fund has no market cap to find - what it has is the pile it holds, and
  // the page says so rather than labelling one as the other.
  const fundAssets = raw(sd?.totalAssets);
  let capKind = "cap";
  if (marketCap == null && fundAssets != null) {
    marketCap = fundAssets;
    capKind = "assets";
  }

  const [timeseries, deepFinancials, avEps, nasdaqEps, saCalendar, scrapedCalendar, marketBeatRevenue, finnhub, firstTradeDate, peers, etfs, news] =
    await Promise.all([
      fetchTimeseries(symbol, session, hot).catch(() => ({})),
      // stockanalysis.com is the spine and the only same-day one; the SEC
      // filings behind Polygon keep the history on screen when it goes quiet.
      fetchDeepFinancials(symbol, hot)
        .catch(() => [])
        .then((rows) => (rows.length ? rows : fetchPolygonFinancials(symbol).catch(() => []))),
      fetchAlphaVantageEps(symbol).catch(() => []),
      fetchNasdaqEps(symbol, hot).catch(() => []),
      fetchStockAnalysisEarnings(symbol, hot).catch(() => []),
      fetchYahooEarningsCalendar(symbol, hot).catch(() => []),
      fetchMarketBeatEarnings(symbol, price.exchange, hot).catch(() => []),
      fetchFinnhubEarnings(symbol, hot)
        .catch(() => NO_EARNINGS)
        .then((r) => (r.calendar.length ? r : fetchFmpEarnings(symbol, hot).catch(() => NO_EARNINGS))),
      fetchFirstTradeDate(symbol),
      fetchPeers(symbol, industry, sector),
      fetchEtfHolders(
        symbol,
        universeEntry,
        sector,
        industry,
        session,
        ap?.country ?? null,
        price.currency === "USD" && capKind === "cap" ? marketCap : null
      ),
      fetchFinnhubNews(symbol, price.longName ?? price.shortName).catch(() => []),
    ]);

  // One row per report date, the keyed feed winning any date both describe:
  // it answers with the numbers minutes after the release, while a scrape can
  // be a page behind or throttled into saying nothing at all. The scrapes are
  // what reach years back, so they still contribute every date it lacks.
  const preferring = (keyed, scraped) => {
    const covered = new Set(keyed.map((r) => r.reportDate));
    return [...keyed, ...scraped.filter((r) => !covered.has(r.reportDate))].sort((a, b) =>
      a.reportDate.localeCompare(b.reportDate)
    );
  };
  // Finnhub is the fastest on the newest quarter but only carries a couple of
  // rows; stockanalysis carries every quarter behind them and, unlike the
  // Yahoo scrape, actually answers in production. The Yahoo rows are last -
  // whatever is left that neither of the two APIs described.
  const calendarEps = preferring(preferring(finnhub.calendar, saCalendar), scrapedCalendar);
  const marketBeat = preferring(finnhub.revenue, marketBeatRevenue);

  // Nothing in the Yahoo payload had a size in it: ask the keyed feed rather
  // than print a gap where the company's size goes.
  if (marketCap == null && price.currency === "USD") {
    marketCap = await fetchFinnhubMarketCap(symbol).catch(() => null);
  }

  // Analyst consensus: latest recommendation trend bucket + price targets.
  const trend = rt?.trend?.find((t) => t?.period === "0m") ?? rt?.trend?.[0] ?? null;
  const consensus = trend
    ? {
        key: fd?.recommendationKey ?? null,
        analysts: raw(fd?.numberOfAnalystOpinions),
        bearish: (trend.sell ?? 0) + (trend.strongSell ?? 0),
        neutral: trend.hold ?? 0,
        bullish: (trend.strongBuy ?? 0) + (trend.buy ?? 0),
        targetLow: raw(fd?.targetLowPrice),
        targetMean: raw(fd?.targetMeanPrice),
        targetHigh: raw(fd?.targetHighPrice),
        current: raw(fd?.currentPrice) ?? raw(price.regularMarketPrice),
      }
    : null;

  // Who owns the company: the insider/institution split, plus the largest
  // institutional and fund holders. Yahoo returns the top 10 of each; an ETF
  // or a foreign line often has none of this, so every part is optional and
  // the tab says so rather than printing zeros.
  const ownerRows = (list) =>
    (list ?? [])
      .filter((r) => r?.organization)
      .map((r) => ({
        name: r.organization,
        reportDate: r.reportDate?.fmt ?? null,
        pctHeld: raw(r.pctHeld),
        shares: raw(r.position),
        value: raw(r.value),
        pctChange: raw(r.pctChange),
      }));
  const institutions = ownerRows(io?.ownershipList);
  const funds = ownerRows(fo?.ownershipList);
  const holders =
    mhb || institutions.length || funds.length
      ? {
          insidersPct: raw(mhb?.insidersPercentHeld),
          institutionsPct: raw(mhb?.institutionsPercentHeld),
          institutionsFloatPct: raw(mhb?.institutionsFloatPercentHeld),
          institutionsCount: raw(mhb?.institutionsCount),
          institutions,
          funds,
        }
      : null;

  // Yahoo's earningsHistory module covers only the last four quarters, but
  // unlike the calendar page it doesn't round to cents - worth having,
  // because a surprise computed off a rounded estimate drifts noticeably
  // (EA's Q4 FY26 reads 39.2% against 1.30 and 39.6% against 1.29627).
  const unroundedHistory = [];
  for (const row of eh?.history ?? []) {
    const d = row?.quarter?.fmt;
    if (!d) continue;
    unroundedHistory.push({ t: Date.parse(d), estimate: raw(row.epsEstimate), actual: raw(row.epsActual) });
  }
  const unroundedFor = (dateStr) => {
    const t = Date.parse(dateStr);
    let best = null;
    let bestDiff = 55 * 86400 * 1000;
    for (const e of unroundedHistory) {
      const diff = Math.abs(e.t - t);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = e;
      }
    }
    return best;
  };
  const estimateFor = (dateStr) => unroundedFor(dateStr)?.estimate ?? null;

  // Swap in the unrounded figure only when it agrees with the rounded one to
  // the cent, so this stays a precision upgrade and never a source change.
  const refine = (value, precise) =>
    precise != null && value != null && Math.abs(precise - value) < 0.005 ? precise : value;

  // Next unreported quarter's analyst estimates (0q = the quarter about to
  // report). Used for the single forward projection on each chart.
  const nextTrend = et?.trend?.find((t) => t.period === "0q") ?? null;
  const nextEpsEst = raw(nextTrend?.earningsEstimate?.avg);
  const nextRevEst = raw(nextTrend?.revenueEstimate?.avg);
  const nextEndDate = nextTrend?.endDate ?? null;

  const nextFiscalLabel = (label) => {
    const m = /Q(\d) FY(\d+)/.exec(label ?? "");
    if (!m) return "Est.";
    let q = Number(m[1]) + 1;
    let fy = Number(m[2]);
    if (q > 4) {
      q = 1;
      fy += 1;
    }
    return `Q${q} FY${fy}`;
  };

  // Calendar-quarter label ("Q3 '25") for a report date, for feeds that
  // carry no fiscal calendar of their own. Results land after the quarter
  // they cover, so step back into it before reading the quarter off.
  const quarterLabel = (iso) => {
    const d = new Date(`${iso}T00:00:00`);
    d.setDate(d.getDate() - 45);
    return `Q${Math.floor(d.getMonth() / 3) + 1} '${String(d.getFullYear()).slice(2)}`;
  };

  // ----- Quarterly earnings: estimate vs actual -----
  // The deep financials feed is the spine (fiscal labels + GAAP diluted
  // EPS); Yahoo's earnings calendar layers on the consensus estimate and the
  // normalized EPS that estimate was actually set against. The two EPS
  // bases are kept in separate fields: measuring a GAAP actual against a
  // normalized estimate invents beats and misses that never happened.
  const reportedCal = calendarEps.filter((r) => r.actual != null);
  const REPORT_LAG = 120 * 86400 * 1000;

  // A quarter's results are announced a few weeks after it closes, so each
  // reported row belongs to the most recent quarter that ended before it.
  const calendarFor = (endDate) => {
    const end = Date.parse(endDate);
    let best = null;
    let bestGap = REPORT_LAG;
    for (const r of reportedCal) {
      const gap = Date.parse(r.reportDate) - end;
      if (gap > 0 && gap < bestGap) {
        bestGap = gap;
        best = r;
      }
    }
    return best;
  };

  // Both are keyed by the quarter they cover; Finnhub is written second so it
  // wins the quarters it has, being the fresher of the two by days.
  const avByDate = new Map([...avEps, ...finnhub.quarters].map((r) => [r.date, r]));

  // Same report-date-to-quarter rule as the EPS calendar, over MarketBeat's
  // rows.
  const marketBeatFor = (endDate) => {
    const end = Date.parse(endDate);
    let best = null;
    let bestGap = REPORT_LAG;
    for (const r of marketBeat) {
      const gap = Date.parse(r.reportDate) - end;
      if (gap > 0 && gap < bestGap) {
        bestGap = gap;
        best = r;
      }
    }
    return best;
  };

  // Two feeds have to agree on what the company actually booked before their
  // consensus is trusted on the same quarter. MarketBeat reports ADRs in USD
  // while the financials feed keeps the home currency (TSM in TWD), and
  // pairing those would manufacture an enormous miss out of an exchange rate.
  const revenueEstimateFor = (row, reported) => {
    const mb = marketBeatFor(row.date);
    if (mb?.revenueEstimate == null || reported == null || mb.revenueActual == null) return null;
    return Math.abs(mb.revenueActual - reported) <= Math.abs(reported) * 0.1 ? mb.revenueEstimate : null;
  };

  // Results land a fixed few weeks after the quarter closes, and each company
  // keeps to its own rhythm. Measured off the quarters the calendar did give
  // us, so it is this company's lag rather than a guess - the median, so one
  // odd delayed filing does not drag it.
  //
  // This matters because the report date is the *only* thing pinning a quarter
  // to the price chart. The calendar scrape is a scrape: when it comes back
  // consent-walled or throttled - which is the normal case from a datacenter,
  // even while it works fine from a laptop - every quarter lost its date and
  // the chart drew no earnings markers at all. A derived date is a few days
  // off at worst, which the marker's own 3-day tolerance already absorbs.
  const REPORT_LAG_FALLBACK = 30;
  const knownLags = [];
  for (const r of deepFinancials) {
    const cal = calendarFor(r.date);
    if (!cal?.reportDate) continue;
    const days = Math.round((Date.parse(cal.reportDate) - Date.parse(r.date)) / 86400000);
    if (days > 0 && days < 120) knownLags.push(days);
  }
  knownLags.sort((a, b) => a - b);
  const typicalLag = knownLags.length
    ? knownLags[Math.floor(knownLags.length / 2)]
    : REPORT_LAG_FALLBACK;

  // The quarter's end date pushed forward by that lag, landed on a weekday -
  // nobody reports on a Saturday, and a weekend date is two days further from
  // the nearest candle than the tolerance allows.
  const impliedReportDate = (endDate) => {
    const d = new Date(`${endDate}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return null;
    d.setUTCDate(d.getUTCDate() + typicalLag);
    if (d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 2);
    if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  };

  let earningsQuarters = deepFinancials.map((r) => {
    const cal = calendarFor(r.date);
    const av = avByDate.get(r.date);
    const precise = unroundedFor(r.date);
    return {
      label: r.fyLabel,
      date: r.date,
      reportDate: cal?.reportDate ?? impliedReportDate(r.date),
      gaap: r.eps,
      // Yahoo's own history is preferred over the GAAP figure as a last
      // resort: it is the same normalized basis the estimate is set on, and
      // it carries a quarter within hours of the release, while the calendar
      // scrape above can still be a page or two behind.
      actual: refine(cal?.actual ?? av?.actual ?? precise?.actual ?? r.eps, precise?.actual),
      estimate: refine(cal?.estimate ?? av?.estimate ?? estimateFor(r.date), precise?.estimate),
      revenue: r.revenue,
      revenueEstimate: revenueEstimateFor(r, r.revenue),
      netIncome: r.netIncome,
      upcoming: false,
    };
  });

  // Without the deep feed (some ADRs and class shares) the calendar alone
  // still pairs an estimate with an actual on every quarter.
  if (!earningsQuarters.length) {
    const fallback = reportedCal.length
      ? reportedCal.map((r) => ({
          label: quarterLabel(r.reportDate),
          date: r.reportDate,
          reportDate: r.reportDate,
          gaap: null,
          actual: r.actual,
          estimate: r.estimate,
          upcoming: false,
        }))
      : avEps.map((r) => ({
          label: quarterLabel(r.date),
          date: r.date,
          reportDate: null,
          gaap: null,
          actual: r.actual,
          estimate: r.estimate,
          upcoming: false,
        }));
    earningsQuarters = fallback;
  }

  // The deep feed only reaches back about five years on the free tier, but
  // Yahoo's calendar carries every reported quarter it has. Those older
  // quarters used to be dropped on the floor, because the spine above is a
  // map over the deep feed - so the history rail stopped five years back
  // whatever the company's age. They carry an estimate and an actual and
  // nothing else, which is all the rail reads, so they go in front of the
  // spine rather than being left out of it.
  const firstDeep = earningsQuarters[0]?.reportDate ?? null;
  if (firstDeep) {
    const older = reportedCal
      .filter((r) => r.reportDate < firstDeep)
      .map((r) => ({
        label: quarterLabel(r.reportDate),
        date: r.reportDate,
        reportDate: r.reportDate,
        gaap: null,
        actual: r.actual,
        estimate: r.estimate,
        revenue: null,
        revenueEstimate: null,
        netIncome: null,
        upcoming: false,
      }));
    if (older.length) earningsQuarters = [...older, ...earningsQuarters];
  }

  // Calendar rows with an estimate but no actual haven't reported yet, and
  // follow the last reported quarter one fiscal quarter at a time.
  const lastReported = earningsQuarters[earningsQuarters.length - 1] ?? null;
  const upcomingCal = calendarEps
    .filter((r) => r.actual == null && r.estimate != null)
    .filter((r) => !lastReported?.reportDate || r.reportDate > lastReported.reportDate)
    .slice(0, 4);

  let cursor = lastReported?.label ?? null;
  for (const [i, r] of upcomingCal.entries()) {
    const next = nextFiscalLabel(cursor);
    cursor = next === "Est." ? quarterLabel(r.reportDate) : next;
    earningsQuarters.push({
      label: cursor,
      date: null,
      reportDate: r.reportDate,
      gaap: null,
      actual: null,
      estimate: r.estimate,
      revenue: null,
      // Only the quarter about to report has a revenue consensus.
      revenueEstimate: i === 0 ? nextRevEst : null,
      netIncome: null,
      upcoming: true,
    });
  }
  // No calendar at all - fall back to the single forward estimate Yahoo's
  // earningsTrend carries for the quarter about to report.
  if (!upcomingCal.length && nextEpsEst != null && lastReported) {
    earningsQuarters.push({
      label: nextFiscalLabel(lastReported.label),
      date: nextEndDate,
      reportDate: null,
      gaap: null,
      actual: null,
      estimate: nextEpsEst,
      upcoming: true,
    });
  }

  // The Earnings Trends card shows a fixed 7 reported quarters + 1 estimate;
  // the Earnings History section gets the full run.
  const WINDOW = 7;
  const reportedQuarters = earningsQuarters.filter((r) => !r.upcoming);
  const epsQuarters = [
    ...reportedQuarters.slice(-WINDOW),
    ...earningsQuarters.filter((r) => r.upcoming).slice(0, 1),
  ];

  // Last 7 reported quarters (deep feed) + 1 forward estimate for revenue.
  const recent = deepFinancials.slice(-WINDOW);
  const revenueQuarters = recent.map((r) => ({
    label: r.fyLabel,
    date: r.date,
    revenue: r.revenue,
    netIncome: r.netIncome,
    upcoming: false,
  }));
  if (recent.length && nextRevEst != null) {
    const label = nextFiscalLabel(recent[recent.length - 1].fyLabel);
    revenueQuarters.push({ label, date: nextEndDate, revenue: nextRevEst, netIncome: null, upcoming: true });
  }

  const nextEarningsTs = ce?.earnings?.earningsDate?.[0]?.raw ?? null;

  const revenueAnnual = joinSeries(timeseries.annualTotalRevenue, timeseries.annualNetIncome);

  // Revenue growth against the year before, on a trailing-twelve-month basis
  // so it moves with each report instead of waiting on the fiscal year end.
  // Being a ratio, it survives feeds that report in a non-USD currency.
  // Falls back to the last two full years when the quarterly feed is short.
  const revenueYoY = (() => {
    const total = (rows) => rows.reduce((sum, r) => sum + r.revenue, 0);
    const quarters = deepFinancials.filter((r) => typeof r.revenue === "number");
    if (quarters.length >= 8) {
      const prior = total(quarters.slice(-8, -4));
      if (prior > 0) return (total(quarters.slice(-4)) - prior) / prior;
    }
    const years = revenueAnnual.filter((r) => typeof r.revenue === "number");
    if (years.length >= 2) {
      const prior = years[years.length - 2].revenue;
      if (prior > 0) return (years[years.length - 1].revenue - prior) / prior;
    }
    return null;
  })();

  return Response.json({
    symbol,
    name: price.longName ?? price.shortName ?? symbol,
    quoteType: price.quoteType ?? null,
    exchange: price.fullExchangeName ?? price.exchangeName ?? null,
    exchangeFlag: EXCHANGE_FLAGS[price.exchange] ?? null,
    currency: price.currency ?? "USD",
    // Whether the figure above is a company's market cap or a fund's assets,
    // so the label can say which - the same distinction the map draws.
    capKind,
    quote: {
      price: raw(price.regularMarketPrice),
      change: raw(price.regularMarketChange),
      changePct: raw(price.regularMarketChangePercent),
      open: raw(sd?.open),
      dayLow: raw(sd?.dayLow),
      dayHigh: raw(sd?.dayHigh),
      volume: raw(sd?.volume),
      marketCap,
      fiftyTwoWeekLow: raw(sd?.fiftyTwoWeekLow),
      fiftyTwoWeekHigh: raw(sd?.fiftyTwoWeekHigh),
      dividendYield: raw(sd?.dividendYield),
      trailingPE: raw(sd?.trailingPE),
      forwardPE: raw(sd?.forwardPE),
      epsTrailing: raw(ks?.trailingEps),
    },
    // Session state for the header: when the regular session closed, and the
    // extended-hours print that follows it. Percentages arrive as fractions.
    market: {
      state: price.marketState ?? null,
      closeTime: raw(price.regularMarketTime),
      postPrice: raw(price.postMarketPrice),
      postChange: raw(price.postMarketChange),
      postChangePct: raw(price.postMarketChangePercent),
      postTime: raw(price.postMarketTime),
      prePrice: raw(price.preMarketPrice),
      preChange: raw(price.preMarketChange),
      preChangePct: raw(price.preMarketChangePercent),
      preTime: raw(price.preMarketTime),
    },
    valuation: {
      marketCap,
      enterpriseValue: raw(ks?.enterpriseValue),
      trailingPE: raw(sd?.trailingPE),
      forwardPE: raw(sd?.forwardPE),
      pegRatio: raw(ks?.pegRatio),
      priceToSales: raw(sd?.priceToSalesTrailing12Months),
      priceToBook: raw(ks?.priceToBook),
      evToRevenue: raw(ks?.enterpriseToRevenue),
      evToEbitda: raw(ks?.enterpriseToEbitda),
    },
    highlights: {
      profitMargin: raw(fd?.profitMargins),
      returnOnAssets: raw(fd?.returnOnAssets),
      returnOnEquity: raw(fd?.returnOnEquity),
      revenue: raw(fd?.totalRevenue),
      netIncome: raw(ks?.netIncomeToCommon),
      dilutedEps: raw(ks?.trailingEps),
      totalCash: raw(fd?.totalCash),
      debtToEquity: raw(fd?.debtToEquity),
      leveredFreeCashflow: raw(fd?.freeCashflow),
    },
    profile: {
      ceo,
      employees: ap?.fullTimeEmployees ?? null,
      sector,
      industry,
      country: ap?.country ?? null,
      ipoDate: firstTradeDate,
      description: ap?.longBusinessSummary ?? null,
    },
    consensus,
    holders,
    news,
    financials: {
      annual: financialMatrix(timeseries, "annual"),
      quarterly: financialMatrix(timeseries, "quarterly"),
    },
    nextEarningsTs,
    revenueYoY,
    epsQuarters,
    // Full run of quarters (~5 years where the feeds reach that far) for the
    // Earnings History section, which shows 3 years and expands on demand.
    earningsHistory: earningsQuarters,
    revenueQuarters,
    revenueAnnual: revenueAnnual.map((r) => ({ ...r, label: r.date.slice(0, 4) })),
    peers,
    etfs,
  }, {
    // Quotes move, but not per-visitor: everyone loading AAPL in the same
    // quarter-hour wants the same payload, and stale-while-revalidate hands
    // the next one the cached copy while this rebuilds behind them.
    headers: { "Cache-Control": `public, s-maxage=${hot ? FRESH_REVALIDATE : 900}, stale-while-revalidate=86400` },
  });
}
