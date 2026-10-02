"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Filler,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";
import EtfHoldings from "@/components/EtfHoldings";
import TickerInput from "@/components/TickerInput";
import CompareControl from "@/components/CompareControl";
import WatchlistButton from "@/components/WatchlistButton";
import CatalystTimeline from "@/components/CatalystTimeline";
import TechnicalsControl, { MA_LINES, RSI_COLOR } from "@/components/TechnicalsControl";
import IndicatorsControl, { INDICATOR_COLOR, INDICATOR_METRICS } from "@/components/IndicatorsControl";
import { dragMeasurePlugin } from "@/lib/dragMeasure";
import { hoverLinePlugin } from "@/lib/hoverLine";
import { priceMarkersPlugin } from "@/lib/priceMarkers";
import { ema, rsi as computeRsi, sma, visibleTail } from "@/lib/indicators";
import { blankBrokenLogo, hideBrokenLogo, logoUrl } from "@/lib/companyLogo";
import { formatCap, formatCount } from "@/lib/formatCap";
import { supportsHoldings } from "@/lib/indexHoldings";
import { SPARK_H, SPARK_W, sparkPath } from "@/lib/sparkline";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Filler,
  dragMeasurePlugin,
  hoverLinePlugin,
  priceMarkersPlugin
);

const RANGES = [
  { key: "1d", label: "1D" },
  { key: "5d", label: "5D" },
  { key: "1m", label: "1M" },
  { key: "3m", label: "3M" },
  { key: "6m", label: "6M" },
  { key: "1y", label: "1Y" },
  { key: "2y", label: "2Y" },
  { key: "3y", label: "3Y" },
  { key: "5y", label: "5Y" },
  { key: "10y", label: "10Y" },
];

// Backoff between profile retries, in ms - about 9s of trying before the
// page gives up and offers a manual retry.
const RETRY_DELAYS = [700, 1400, 2600, 4500];

// How often an open page re-reads the profile, so a report published while
// it's up reaches the earnings cards on its own. Matched to the short cache
// the API keeps around a reporting date - polling faster only re-reads the
// same cache entry.
const PROFILE_REFRESH_MS = 5 * 60 * 1000;

const UP = "#30cc5a";
const DOWN = "#f63538";
const NEUTRAL = "#8b93a3";
const REV_BLUE = "#4da3ff";
// Earnings markers on the price chart, kept off the up/down palette so they
// read as events rather than as performance.
const EARNINGS_BLUE = "#4da3ff";
const EARN_YELLOW = "#ffd53d";
const AXIS_WIDTH = 56;

// Compare mode plots up to three tickers at once, so its colours have to say
// *which stock* rather than up or down - a categorical set, deliberately off
// the green/red palette. Blue, orange and green, checked for colour-vision
// separation and for 3:1 contrast against both the light and the dark panel.
const SERIES_COLORS = ["#2a78d6", "#d95926", "#199e70"];
const MAX_COMPARE = 2;
// Shared empty list, so "nothing to compare" keeps the same identity between
// renders and doesn't re-trigger the fetch effect.
const NO_COMPARE = [];

// Three years of quarters in the Earnings History card before "Show more".
const HISTORY_QUARTERS = 12;

const NO_TECHNICALS = { ...Object.fromEntries(MA_LINES.map((ma) => [ma.key, false])), rsi: false };
// Only the daily ranges can be padded with prior sessions; on 1D and 5D the
// candles are minutes, so an average is over minutes and starts in-range.
const PADDABLE = new Set(["1m", "3m", "6m", "1y", "2y", "3y", "5y", "10y"]);

// The market sentiment series publishes one value per day, so on the intraday
// ranges there is no curve to draw - 1D would be a single reading held flat
// across the session, which reads as a broken line rather than as "the index
// did not move today". The overlay is offered from 1M up.
const INDICATOR_RANGES = PADDABLE;
const RSI_PERIOD = 14;

const CONSENSUS_LABELS = {
  strong_buy: "Strong Buy",
  buy: "Buy",
  hold: "Hold",
  underperform: "Underperform",
  sell: "Sell",
};

const fmtNum = (v, d = 2) => (v == null ? "n/a" : v.toFixed(d));
const fmtPct = (v, d = 2) => (v == null ? "n/a" : `${(v * 100).toFixed(d)}%`);
// Growth reads as a direction, so it keeps its sign.
const fmtPctSigned = (v, d = 2) => (v == null ? "n/a" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`);
const fmtPrice = (v) =>
  v == null ? "n/a" : `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtSigned = (v) => (v == null ? "n/a" : `${v >= 0 ? "+" : "-"}$${Math.abs(v).toFixed(2)}`);

function fmtDate(iso) {
  if (!iso) return "n/a";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function tsLabel(t, rangeKey) {
  const d = new Date(t * 1000);
  if (rangeKey === "1d") return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (rangeKey === "5d") return d.toLocaleDateString("en-US", { weekday: "short", hour: "numeric" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

// Hover label for the price chart. Anything inside the last year gets the
// weekday, which is what makes a point read as a specific trading day
// ("Mon, May 4"); older points need the year more than the weekday.
function hoverLabel(t, rangeKey) {
  const d = new Date(t * 1000);
  const weekday = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  if (rangeKey === "1d" || rangeKey === "5d") {
    return `${weekday}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  }
  const withinYear = Date.now() - d.getTime() < 365 * 86400 * 1000;
  return withinYear ? weekday : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// How the change beside the price should be described, per selected range.
const RANGE_WORDING = {
  "1d": "today",
  "5d": "past 5 days",
  "1m": "past month",
  "3m": "past 3 months",
  "6m": "past 6 months",
  "1y": "past year",
  "2y": "past 2 years",
  "3y": "past 3 years",
};

// How far a reported quarter landed from consensus, as a percentage.
function epsSurprise(event) {
  if (!event || event.actual == null || event.estimate == null || event.estimate === 0) return null;
  const pct = ((event.actual - event.estimate) / Math.abs(event.estimate)) * 100;
  return { pct, text: `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`, up: pct >= 0 };
}

const fmtClock = (seconds) =>
  seconds == null
    ? null
    : new Date(seconds * 1000).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      });

// A compared ticker trades on its own calendar - a different exchange, a
// halt, an IPO part-way through the range - so its closes are carried onto
// the base symbol's timestamps: each candle takes the most recent close at or
// before it. Anything earlier than the series' first print stays null, which
// Chart.js leaves as a gap instead of drawing a line up from zero.
function alignSeries(basePoints, points) {
  const out = new Array(basePoints.length).fill(null);
  let j = 0;
  let last = null;
  for (let i = 0; i < basePoints.length; i++) {
    while (j < points.length && points[j].t <= basePoints[i].t) {
      last = points[j].c;
      j++;
    }
    out[i] = last;
  }
  return out;
}

// Nearest 1/2/2.5/5/10 at the right magnitude, so an axis fitted to its data
// still lands its ticks on numbers worth reading (…, 50%, 100%, 150%, …).
function niceStep(raw) {
  if (!(raw > 0)) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * mag;
}

function lastValue(values) {
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] != null) return values[i];
  }
  return null;
}

const fmtSpanDate = (t) =>
  new Date(t * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function percentile(sortedAsc, p) {
  if (!sortedAsc.length) return 1;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.round(p * (sortedAsc.length - 1))));
  return sortedAsc[idx];
}

function LoadingSkeleton({ symbol, retrying }) {
  return (
    <main className="stock-page">
      <div className="stock-head">
        <div className="sk sk-logo" />
        <div>
          <div className="sk sk-line" style={{ width: 220, height: 22 }} />
          <div className="sk sk-line" style={{ width: 130, height: 13, marginTop: 8 }} />
        </div>
      </div>
      <div className="stock-grid">
        <div className="stock-main">
          <section className="stock-card">
            <div className="sk sk-line" style={{ width: 180, height: 30 }} />
            <div className="sk sk-line" style={{ width: 120, height: 12, margin: "10px 0 14px" }} />
            <div className="sk sk-chart" />
          </section>
          <div className="stock-loading-hint">
            {retrying
              ? `The market data feed is busy - still loading ${symbol}…`
              : `Loading ${symbol}… fetching quotes, financials and estimates.`}
          </div>
        </div>
        <aside className="stock-side">
          <section className="stock-card">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="sk sk-line" style={{ width: "100%", height: 14, margin: "9px 0" }} />
            ))}
          </section>
        </aside>
      </div>
    </main>
  );
}

export default function StockPage({ params }) {
  const { symbol: rawSymbol } = use(params);
  const symbol = decodeURIComponent(rawSymbol).toUpperCase();

  // The ticker the header search hides for the creator's handle: no quote
  // page, just the picture.
  if (symbol === "PATRICKV") return <EasterEgg />;
  return <StockDetail symbol={symbol} />;
}

function EasterEgg() {
  return (
    <main className="easteregg">
      <img src="/easteregg.jpg" alt="" />
    </main>
  );
}

// The dashboard panel version: the same detail view, but with its own ticker
// box, since a panel has no route segment to take the symbol from.
export function StockInfoPanel({ initialSymbol = "NVDA" }) {
  const [symbol, setSymbol] = useState(initialSymbol);
  const [draft, setDraft] = useState(initialSymbol);
  return (
    <div className="stockinfo-panel">
      <div className="stockinfo-pick">
        <TickerInput
          value={draft}
          index={0}
          onChange={setDraft}
          onPick={(s) => {
            setDraft(s);
            setSymbol(s);
          }}
          label="Ticker"
        />
      </div>
      <StockDetail symbol={symbol} />
    </div>
  );
}

function StockDetail({ symbol }) {
  // Keyed by the symbol it was loaded for, so a mismatch with the current
  // symbol reads as "still loading" without a synchronous reset in the effect.
  const [load, setLoad] = useState(null);
  // Bumped by the manual retry button to re-run the fetch effect.
  const [reloadKey, setReloadKey] = useState(0);
  const [range, setRange] = useState("1d");
  // Keyed by `symbol:range`, so the compared tickers share it with the base
  // one and flipping between ranges you've already seen is instant.
  const chartCache = useRef({});
  const [chart, setChart] = useState(null);
  // Up to two other tickers plotted alongside this one, as
  // [{symbol, name, exchange}]. Keyed by the symbol they were picked for, the
  // way `load` is, so navigating to another stock starts the comparison over
  // without a reset in an effect.
  const [picked, setPicked] = useState({ symbol, list: NO_COMPARE });
  const compare = picked.symbol === symbol ? picked.list : NO_COMPARE;
  const [compareCharts, setCompareCharts] = useState({});
  // Which candle the cursor is over on the price chart, for the HTML tooltip.
  const [chartHover, setChartHover] = useState(null);
  const [descOpen, setDescOpen] = useState(false);
  const [historyTab, setHistoryTab] = useState("eps");
  // Earnings History opens on 3 years and expands to everything the feeds have.
  const [historyOpen, setHistoryOpen] = useState(false);
  const [epsMode, setEpsMode] = useState("normalized");
  const [revMode, setRevMode] = useState("quarterly");
  // Index of the EPS quarter under the cursor, so the card header can echo it.
  const [epsHover, setEpsHover] = useState(null);
  // Moving averages and the RSI panel, off until asked for.
  const [tech, setTech] = useState(NO_TECHNICALS);
  // Which market sentiment series is overlaid on the price chart, if any. The
  // series themselves are market-wide, so they are fetched once and reused
  // across every metric rather than per selection.
  const [indicatorKey, setIndicatorKey] = useState(null);
  const [indicators, setIndicators] = useState(null);
  const [watchError, setWatchError] = useState(null);

  // Any technical needs history behind the first visible candle to be right,
  // so turning one on re-fetches the range with warmup attached. Read off the
  // line list rather than named keys so adding a line cannot forget this.
  const wantsTechnicals = tech.rsi || MA_LINES.some((ma) => tech[ma.key]);
  const padded = wantsTechnicals && PADDABLE.has(range);

  // A busy or rate-limited upstream feed used to surface as "Unknown ticker"
  // on a perfectly valid symbol. Transient failures now keep the loading
  // The indicator series are market-wide and identical for every ticker, so
  // they are fetched once, and only after the user actually asks for one -
  // most visits to a quote page never open this menu.
  useEffect(() => {
    if (!indicatorKey || indicators) return;
    let cancelled = false;
    fetch("/api/fear-greed")
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !json?.dates?.length) return;
        // The composite index is the payload's own top-level series; only the
        // sub-indicators are nested. Fold it in under "fg" so every chip in the
        // menu reads from one shape.
        setIndicators({
          ...(json.indicators ?? {}),
          fg: { dates: json.dates, values: json.values },
        });
      })
      // The overlay is an extra on a page that is really about the price, so a
      // failure here leaves the chart exactly as it was.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [indicatorKey, indicators]);

  // screen up and retry on this backoff; only a definitive 404 (or a run of
  // failures) ever shows an error.
  useEffect(() => {
    let cancelled = false;
    let timer = null;

    async function attempt(tryIndex) {
      try {
        const res = await fetch(`/api/stock-profile?symbol=${encodeURIComponent(symbol)}`);
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && json && !json.error) {
          setLoad({ symbol, profile: json });
          return;
        }
        // 404 is Yahoo's authoritative "no such symbol"; anything else is a
        // hiccup worth another go.
        const fatal = res.status === 404;
        retry(tryIndex, fatal, json?.error ?? "Could not load stock data.");
      } catch {
        if (!cancelled) retry(tryIndex, false, "Could not load stock data.");
      }
    }

    function retry(tryIndex, fatal, message) {
      if (!fatal && tryIndex < RETRY_DELAYS.length) {
        setLoad({ symbol, retrying: true });
        timer = setTimeout(() => attempt(tryIndex + 1), RETRY_DELAYS[tryIndex]);
        return;
      }
      setLoad({ symbol, error: message, retryable: !fatal });
    }

    attempt(0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [symbol, reloadKey]);

  // Companies report while the page is sitting open, so the profile is pulled
  // again every few minutes and whenever the tab comes back to the front -
  // that's what moves the new quarter onto the earnings charts without a
  // reload. Only a good response replaces what's on screen, so a failed
  // refresh leaves the page exactly as it was rather than blanking it.
  useEffect(() => {
    let cancelled = false;
    let lastAt = Date.now();

    async function refresh() {
      if (document.hidden) return;
      lastAt = Date.now();
      try {
        const res = await fetch(`/api/stock-profile?symbol=${encodeURIComponent(symbol)}`, {
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!cancelled && res.ok && json && !json.error) setLoad({ symbol, profile: json });
      } catch {
        /* keep what's on screen and try again on the next tick */
      }
    }

    // Flipping between tabs shouldn't be a way to re-request the profile a
    // dozen times a minute; coming back after a while should.
    const onVisible = () => {
      if (Date.now() - lastAt >= 60_000) refresh();
    };

    const timer = setInterval(refresh, PROFILE_REFRESH_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [symbol]);

  const current = load?.symbol === symbol ? load : null;
  const profile = current?.profile ?? null;
  const profileError = current?.error ?? null;

  useEffect(() => {
    let cancelled = false;
    // The padded and unpadded responses hold different data for the same
    // range, so they cache under different keys rather than overwriting each
    // other every time a technical is switched on and off again.
    const key = `${symbol}:${range}${padded ? ":pad" : ""}`;
    const cached = chartCache.current[key];
    if (cached) {
      setChart(cached);
      return;
    }
    fetch(`/api/stock-chart?symbol=${encodeURIComponent(symbol)}&range=${range}${padded ? "&pad=1" : ""}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled || json.error) return;
        chartCache.current[key] = json;
        setChart(json);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [symbol, range, padded]);

  // The compared tickers, fetched as a set so they all land together and the
  // chart never repaints one series at a time.
  // Emptying the comparison leaves the last map in place rather than clearing
  // it - the series below only reads the tickers still on the list, so a stale
  // entry is inert, and the cache above draws a re-added stock immediately.
  useEffect(() => {
    if (!compare.length) return;
    let cancelled = false;
    Promise.all(
      compare.map(async (c) => {
        const key = `${c.symbol}:${range}`;
        if (chartCache.current[key]) return [c.symbol, chartCache.current[key]];
        try {
          const json = await (
            await fetch(`/api/stock-chart?symbol=${encodeURIComponent(c.symbol)}&range=${range}`)
          ).json();
          if (json.error || !json.points?.length) return [c.symbol, null];
          chartCache.current[key] = json;
          return [c.symbol, json];
        } catch {
          return [c.symbol, null];
        }
      })
    ).then((entries) => {
      if (cancelled) return;
      setCompareCharts(Object.fromEntries(entries.filter(([, json]) => json)));
    });
    return () => {
      cancelled = true;
    };
  }, [compare, range]);

  const view = useMemo(() => {
    const points = chart?.range === range && chart?.symbol === symbol ? chart.points : null;
    if (!points?.length) return null;
    const last = points[points.length - 1].c;
    const base = range === "1d" && chart.prevClose != null ? chart.prevClose : points[0].c;
    const change = last - base;
    const changePct = base ? (change / base) * 100 : 0;
    // Closes from before the visible window, present only on a padded fetch.
    // Nothing but the indicators below reads them.
    return { points, warmup: chart.warmup ?? null, last, base, change, changePct, up: change >= 0 };
  }, [chart, range, symbol]);

  // ----- Moving averages and RSI -----
  // Computed over warmup + visible closes and then cut back to the visible
  // window, so an average is drawn from the sessions it actually covers rather
  // than from whatever happens to fit on screen.
  const technicals = useMemo(() => {
    if (!view) return null;
    const visibleCount = view.points.length;
    const closes = [...(view.warmup ?? []), ...view.points.map((p) => p.c)];

    const lines = MA_LINES.filter((ma) => tech[ma.key]).map((ma) => ({
      ...ma,
      values: visibleTail(
        ma.kind === "ema" ? ema(closes, ma.period) : sma(closes, ma.period),
        visibleCount
      ),
    }));
    // The pane is labelled "RSI 14 + SMA 14" because RsiLE reads the RSI
    // against its own average; the smoothing is computed on the full RSI
    // series, warmup included, so the average does not restart at the edge of
    // the visible window.
    const fullRsi = tech.rsi ? computeRsi(closes, RSI_PERIOD) : null;
    const rsiValues = fullRsi ? visibleTail(fullRsi, visibleCount) : null;
    const rsiAverage = fullRsi ? visibleTail(sma(fullRsi, RSI_PERIOD), visibleCount) : null;

    // An average with no warmup behind it can only start once enough visible
    // candles have gone by; on a short range that can be the whole window, and
    // saying so beats drawing a blank strip and leaving it a mystery.
    const short = lines.filter((l) => l.values.every((v) => v == null));
    return { lines, rsiValues, rsiAverage, short };
  }, [view, tech]);

  // ----- Market sentiment overlay -----
  // The index publishes one value per day while the chart's x axis belongs to
  // the stock, so the series has to be resampled onto the visible candles.
  //
  // Matching each candle to its own day looks right on a daily range and fails
  // on an intraday one: every candle inside a session resolves to that day's
  // single reading, so 1D drew one flat step and 5D drew five. The home page
  // never hits this because its shortest range is 6m and it plots on the
  // index's own dates.
  //
  // Instead, each candle takes its value from the daily series interpolated at
  // that candle's timestamp - the same line the home page draws, sampled where
  // this chart's points actually fall. Candles outside the series' range stay
  // null so the line stops rather than running flat off the end.
  const indicatorSeries = useMemo(() => {
    if (!view || !indicatorKey || !INDICATOR_RANGES.has(range)) return null;
    const metric = INDICATOR_METRICS.find((m) => m.key === indicatorKey);
    const active = indicators?.[indicatorKey];
    if (!metric || !active?.dates?.length) return null;

    // The daily series as sortable (timestamp, value) pairs, midday UTC so a
    // reading sits inside its own session rather than on the boundary.
    const knots = [];
    active.dates.forEach((date, i) => {
      const value = active.values[i];
      const t = Date.parse(`${String(date).slice(0, 10)}T12:00:00Z`) / 1000;
      if (Number.isFinite(t) && value != null && Number.isFinite(value)) knots.push([t, value]);
    });
    if (knots.length < 2) return null;
    knots.sort((a, b) => a[0] - b[0]);

    const lastKnot = knots[knots.length - 1];
    let cursor = 0;
    const values = view.points.map((point) => {
      const t = point.t;
      // Before the series starts there is nothing to draw. After its last
      // reading there is: that reading is the current value, and today's
      // session runs hours past it, so it carries to the live edge instead of
      // blanking most of a 1D chart.
      if (t < knots[0][0]) return null;
      if (t >= lastKnot[0]) return lastKnot[1];
      // Points arrive in time order, so the search resumes where it left off
      // rather than rescanning the series for every candle.
      while (cursor < knots.length - 2 && knots[cursor + 1][0] < t) cursor += 1;
      while (cursor > 0 && knots[cursor][0] > t) cursor -= 1;
      const [t0, v0] = knots[cursor];
      const [t1, v1] = knots[cursor + 1];
      if (t1 === t0) return v0;
      const ratio = (t - t0) / (t1 - t0);
      return v0 + (v1 - v0) * ratio;
    });
    if (values.every((v) => v == null)) return null;
    return { metric, values };
  }, [view, indicatorKey, indicators, range]);

  // ----- The plotted series: this stock, plus anything being compared -----
  // Two stocks priced $200 apart can't share a price axis without one of them
  // reading as a flat line, so a comparison is indexed instead: every series
  // starts the range at 0% and the axis carries percent change. Each series
  // keeps its own baseline - the previous close intraday, its first print in
  // the range otherwise - so a stock that IPO'd mid-range is still measured
  // from its own start rather than from a price it never traded at.
  const series = useMemo(() => {
    if (!view) return null;
    const entries = [
      {
        symbol,
        name: profile?.name ?? symbol,
        exchange: profile?.exchange ?? null,
        values: view.points.map((p) => p.c),
        base: view.base,
        color: SERIES_COLORS[0],
        removable: false,
      },
    ];
    for (const c of compare) {
      const data = compareCharts[c.symbol];
      if (!data || data.range !== range || !data.points?.length) continue;
      const values = alignSeries(view.points, data.points);
      const first = values.find((v) => v != null) ?? null;
      entries.push({
        symbol: c.symbol,
        name: c.name ?? c.symbol,
        exchange: c.exchange ?? null,
        values,
        base: range === "1d" && data.prevClose != null ? data.prevClose : first,
        color: c.color,
        removable: true,
      });
    }

    return entries.map((s) => {
      const last = lastValue(s.values);
      const change = last != null && s.base != null ? last - s.base : null;
      const changePct = change != null && s.base ? (change / s.base) * 100 : null;
      return {
        ...s,
        last,
        change,
        changePct,
        pct: s.values.map((v) => (v == null || !s.base ? null : (v / s.base - 1) * 100)),
      };
    });
  }, [view, compare, compareCharts, range, symbol, profile]);

  // One series is the ordinary price chart; two or more switches the whole
  // panel into indexed percent mode.
  const compareMode = (series?.length ?? 0) > 1;

  // The indexed axis is fitted to the lines it actually holds. Left to round
  // out to its own boundaries, a comparison that ran up 250% gets an axis to
  // -100% and spends half the panel empty. Zero is always inside the range so
  // the baseline every series started from stays on screen.
  const pctAxis = useMemo(() => {
    if (!compareMode) return null;
    let lo = 0;
    let hi = 0;
    for (const s of series) {
      for (const v of s.pct) {
        if (v == null || !Number.isFinite(v)) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    const pad = Math.max((hi - lo) * 0.06, 0.5);
    const min = lo - pad;
    const max = hi + pad;
    const step = niceStep((max - min) / 7);
    return { min, max, step, decimals: step >= 1 ? 0 : step >= 0.1 ? 1 : 2 };
  }, [series, compareMode]);

  // ----- Earnings dates marked on the price chart -----
  // Results are announced after the close, so each report is pinned to the
  // nearest candle in the range on show. Quarters outside the range - and
  // the one still to be reported - simply find nothing close enough.
  const earningsMarks = useMemo(() => {
    const events = (profile?.earningsHistory ?? []).filter(
      (e) => e.reportDate && !e.upcoming && (e.actual != null || e.estimate != null)
    );
    if (!view || !events.length) return null;

    const marks = new Map();
    for (const event of events) {
      const at = Date.parse(`${event.reportDate}T20:00:00Z`) / 1000;
      let best = -1;
      let bestGap = Infinity;
      view.points.forEach((p, i) => {
        const gap = Math.abs(p.t - at);
        if (gap < bestGap) {
          bestGap = gap;
          best = i;
        }
      });
      // Further out than a long weekend and it isn't this range's event.
      if (best >= 0 && bestGap <= 3 * 86400) marks.set(best, event);
    }
    return marks.size ? marks : null;
  }, [view, profile]);


  const lineData = useMemo(() => {
    if (!view || !series) return null;

    // Compared series are drawn unfilled: three stacked gradients would hide
    // whichever line sits lowest.
    const datasets = compareMode
      ? series.map((s) => ({
          label: s.symbol,
          data: s.pct,
          borderColor: s.color,
          borderWidth: 2,
          pointRadius: 0,
          pointHitRadius: 8,
          tension: 0.1,
          fill: false,
        }))
      : [
          {
            label: symbol,
            data: view.points.map((p) => p.c),
            borderColor: view.up ? UP : DOWN,
            borderWidth: 2,
            pointRadius: 0,
            pointHitRadius: 8,
            tension: 0.1,
            fill: true,
            backgroundColor: (ctx) => {
              const { chartArea, ctx: c } = ctx.chart;
              if (!chartArea) return "transparent";
              const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
              g.addColorStop(0, view.up ? "rgba(48,204,90,0.28)" : "rgba(246,53,56,0.28)");
              g.addColorStop(1, "rgba(0,0,0,0)");
              return g;
            },
          },
        ];

    // Moving averages are prices, so they only make sense on the price axis;
    // in a comparison the axis carries percent change and they're left off.
    if (!compareMode && technicals) {
      for (const line of technicals.lines) {
        datasets.push({
          label: line.label,
          data: line.values,
          borderColor: line.color,
          borderWidth: 1.4,
          // EMAs draw dashed, the same way their swatch does and the same way
          // RsiLE draws them, so the two families stay apart at a glance.
          borderDash: line.dashed ? [5, 4] : undefined,
          pointRadius: 0,
          pointHitRadius: 0,
          tension: 0.1,
          fill: false,
          // A gap means the window behind that point was incomplete, so the
          // line should break there rather than bridge a stretch it never
          // actually averaged.
          spanGaps: false,
        });
      }
    }

    // The indicator carries its own unit, so it rides a second axis rather
    // than being squashed onto the price scale.
    if (indicatorSeries) {
      datasets.push({
        label: indicatorSeries.metric.label,
        data: indicatorSeries.values,
        borderColor: INDICATOR_COLOR,
        borderWidth: 1.6,
        pointRadius: 0,
        pointHitRadius: 0,
        tension: 0.1,
        fill: false,
        yAxisID: "indicator",
        // A day the index did not publish is a gap in the series, not a
        // straight line across it.
        spanGaps: false,
      });
    }

    // Earnings belong to this stock, so the markers ride whichever line is
    // its own - the price line, or its percent line in a comparison.
    if (earningsMarks) {
      const host = compareMode ? series[0].pct : view.points.map((p) => p.c);
      datasets.push({
        label: "Earnings",
        data: view.points.map((p, i) => (earningsMarks.has(i) ? host[i] : null)),
        showLine: false,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointBackgroundColor: EARNINGS_BLUE,
        pointBorderColor: "rgba(12,16,24,0.9)",
        pointBorderWidth: 1.5,
      });
    }

    return { labels: view.points.map((p) => tsLabel(p.t, range)), datasets };
  }, [view, series, compareMode, symbol, range, earningsMarks, technicals, indicatorSeries]);

  const lineOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        // Rendered as HTML instead: a canvas tooltip stacks its title above
        // its body, and the price and its timestamp belong on one line.
        tooltip: {
          enabled: false,
          mode: "index",
          intersect: false,
          external: (ctx) => {
            const tip = ctx.tooltip;
            if (!tip || !tip.opacity || !tip.dataPoints?.length) {
              setChartHover(null);
              return;
            }
            const index = tip.dataPoints[0].dataIndex;
            // Same index means the same caret position, so holding the
            // reference steady here keeps the mousemove from re-rendering.
            setChartHover((prev) =>
              prev?.index === index ? prev : { index, x: tip.caretX, width: ctx.chart.width }
            );
          },
        },
        hoverLine: { enabled: true },
        // Drag across the price chart to measure the move between two points.
        // Indexed series are already a change from zero, so a drag across them
        // would report a percentage of a percentage: measuring is left to the
        // single-stock chart, and the comparison reads its moves off the table.
        dragMeasure: compareMode
          ? { enabled: false }
          : { series: [{ datasetIndex: 0, format: (v) => `$${v.toFixed(2)}` }] },
        // The range high and low, and the last close tagged against the axis.
        // Indexed comparisons get the tag but not the extremes: three series
        // would want three pairs of callouts over one another.
        priceMarkers: {
          enabled: true,
          datasetIndex: 0,
          extremes: !compareMode,
          last: !compareMode,
          format: (v) => v.toFixed(2),
          color: NEUTRAL,
          lastColor: view?.up ? UP : DOWN,
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { display: false } },
        y: {
          position: "right",
          grid: compareMode
            ? {
                // Zero is the line every series started from, so it reads
                // heavier than the rest of the grid.
                color: (ctx) =>
                  ctx.tick.value === 0 ? "rgba(139,147,163,0.45)" : "rgba(139,147,163,0.12)",
              }
            : { color: "rgba(139,147,163,0.12)" },
          ...(pctAxis ? { min: pctAxis.min, max: pctAxis.max } : {}),
          ticks: {
            color: NEUTRAL,
            maxTicksLimit: pctAxis ? 8 : 6,
            ...(pctAxis
              ? {
                  // The fitted bounds are wherever the data ended, so they are
                  // dropped as ticks in favour of the round steps between them.
                  includeBounds: false,
                  stepSize: pctAxis.step,
                  callback: (v) => `${v.toFixed(pctAxis.decimals)}%`,
                }
              : {}),
          },
          afterFit: (s) => {
            s.width = AXIS_WIDTH;
          },
        },
        // Only mounted when an indicator is on. It sits opposite the price and
        // draws no grid of its own, so the chart keeps one set of gridlines
        // instead of two that almost line up.
        ...(indicatorSeries
          ? {
              indicator: {
                position: "left",
                grid: { display: false },
                ...(indicatorSeries.metric.min != null ? { min: indicatorSeries.metric.min } : {}),
                ...(indicatorSeries.metric.max != null ? { max: indicatorSeries.metric.max } : {}),
                ticks: {
                  color: INDICATOR_COLOR,
                  maxTicksLimit: 6,
                  callback: (v) => indicatorSeries.metric.format?.(v) ?? v,
                },
                afterFit: (s) => {
                  s.width = AXIS_WIDTH;
                },
              },
            }
          : {}),
      },
    };
  }, [compareMode, pctAxis, view, indicatorSeries]);

  // ----- RSI panel -----
  // Its own chart under the volume bars, sharing the price chart's x labels so
  // the two line up candle for candle.
  const rsiData = useMemo(() => {
    if (!view || !technicals?.rsiValues) return null;
    return {
      labels: view.points.map((p) => tsLabel(p.t, range)),
      datasets: [
        {
          label: `RSI ${RSI_PERIOD}`,
          data: technicals.rsiValues,
          borderColor: RSI_COLOR,
          borderWidth: 1.4,
          pointRadius: 0,
          pointHitRadius: 8,
          tension: 0.1,
          fill: false,
        },
        {
          label: `SMA ${RSI_PERIOD}`,
          data: technicals.rsiAverage,
          borderColor: "#e0a34d",
          borderWidth: 1.1,
          borderDash: [4, 3],
          pointRadius: 0,
          pointHitRadius: 0,
          tension: 0.1,
          fill: false,
          spanGaps: false,
        },
      ],
    };
  }, [view, technicals, range]);

  const rsiOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        tooltip: {
          displayColors: false,
          callbacks: { label: (item) => `RSI: ${item.parsed.y == null ? "n/a" : item.parsed.y.toFixed(2)}` },
        },
        hoverLine: { enabled: true },
      },
      scales: {
        x: { grid: { display: false }, ticks: { display: false } },
        y: {
          position: "right",
          // Pinned to 0-100 rather than fitted: the whole point of RSI is where
          // the line sits against 30 and 70, and an auto axis moves those.
          min: 0,
          max: 100,
          grid: {
            // Only the two thresholds are drawn, so the panel reads as
            // overbought / oversold bands instead of a generic grid.
            color: (ctx) =>
              ctx.tick.value === 70 || ctx.tick.value === 30 ? "rgba(139,147,163,0.35)" : "transparent",
          },
          border: { display: false },
          ticks: {
            color: NEUTRAL,
            // Chart.js needs the values on the axis for their gridlines to be
            // drawn at all; everything but the thresholds is left unlabelled.
            values: [30, 70],
            callback: (v) => (v === 70 || v === 30 ? String(v) : ""),
            autoSkip: false,
            stepSize: 10,
          },
          afterFit: (s) => {
            s.width = AXIS_WIDTH;
          },
        },
      },
    }),
    []
  );

  const volumeData = useMemo(() => {
    if (!view) return null;
    return {
      labels: view.points.map((p) => tsLabel(p.t, range)),
      datasets: [
        {
          data: view.points.map((p) => p.v),
          backgroundColor: view.points.map((p) => (p.u ? "rgba(48,204,90,0.55)" : "rgba(246,53,56,0.55)")),
          barPercentage: 1,
          categoryPercentage: 1,
        },
      ],
    };
  }, [view, range]);

  const volumeOptions = useMemo(() => {
    // A fixed divisor mis-scales across ranges (fine intraday, flat on daily).
    // Cap the axis dynamically at a percentile of this range's volumes, chosen
    // by range: intraday has huge open/close spikes, so a lower percentile
    // keeps the quiet midday bars readable; daily ranges are more uniform, so
    // a higher percentile shows proportional day-to-day variation with little
    // clipping. Tooltips carry the per-bar % change so shifts read clearly.
    const vols = view ? view.points.map((p) => p.v).filter((v) => v > 0) : [];
    const sorted = [...vols].sort((a, b) => a - b);
    const intraday = range === "1d" || range === "5d";
    // Doubling the percentile cap halves every bar's rendered height while
    // keeping the same range-adaptive shape.
    const cap = Math.max(percentile(sorted, intraday ? 0.66 : 0.9) * 2, 1);
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        tooltip: {
          displayColors: false,
          callbacks: {
            label: (item) => {
              const i = item.dataIndex;
              const cur = view?.points[i]?.v ?? 0;
              const prev = i > 0 ? view?.points[i - 1]?.v : null;
              const pct = prev ? ((cur - prev) / prev) * 100 : null;
              return pct != null
                ? `Vol: ${formatCount(cur)} (${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%)`
                : `Vol: ${formatCount(cur)}`;
            },
          },
        },
        dragMeasure: { series: [{ datasetIndex: 0, label: "Vol", format: (v) => formatCount(v) }] },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: NEUTRAL, maxTicksLimit: 7, maxRotation: 0 } },
        y: {
          position: "right",
          beginAtZero: true,
          max: cap,
          grid: { display: false },
          ticks: { color: NEUTRAL, maxTicksLimit: 3, callback: (v) => formatCount(v) },
          afterFit: (s) => {
            s.width = AXIS_WIDTH;
          },
        },
      },
    };
  }, [view, range]);

  // ----- Earnings Trends: EPS estimate vs actual (7 reported + 1 est) -----
  // What each quarter was expected to earn is drawn on both bases, as the same
  // grey ring behind the filled dot.
  //
  // Analysts publish the consensus against normalized EPS, so GAAP keeps that
  // distinction in its estimate label. The requested visual comparison still
  // scores whichever reported EPS is on screen against that displayed ring.
  const trendEps = useMemo(() => {
    const all = profile?.epsQuarters ?? [];
    const gaapMode = epsMode === "gaap";
    const rows = gaapMode ? all.filter((r) => r.gaap != null) : all;
    if (!rows.length) return null;
    const actualOf = (r) => (gaapMode ? r.gaap : r.actual);
    const colorOf = (r) => {
      const actual = actualOf(r);
      if (actual == null || r.estimate == null) return UP;
      return actual >= r.estimate ? UP : DOWN;
    };
    const lastReported = [...rows].reverse().find((r) => actualOf(r) != null);
    return {
      rows,
      gaapMode,
      actualOf,
      colorOf,
      lastReported,
      data: {
        labels: rows.map((r) => r.label),
        datasets: [
          {
            label: gaapMode ? "Estimate (normalized)" : "Estimate",
            data: rows.map((r) => r.estimate),
            showLine: false,
            pointRadius: 7,
            pointHoverRadius: 8,
            pointBorderWidth: 2,
            pointBorderColor: NEUTRAL,
            pointBackgroundColor: "transparent",
          },
          {
            label: gaapMode ? "GAAP EPS" : "Actual",
            data: rows.map(actualOf),
            showLine: false,
            pointRadius: 7,
            pointHoverRadius: 8,
            pointBackgroundColor: rows.map(colorOf),
            pointBorderColor: "transparent",
          },
        ],
      },
    };
  }, [profile, epsMode]);

  const scatterOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      onHover: (event, elements) => setEpsHover(elements.length ? elements[0].index : null),
      // A quarter is the estimate and the actual together, and they sit one on
      // top of the other - intersect mode makes you land on whichever ring is
      // in front to read either. Index reports the pair from anywhere in the
      // column, which is also what the Revenue vs. Earnings card does.
      interaction: { mode: "index", intersect: false },
      plugins: {
        tooltip: {
          displayColors: false,
          callbacks: {
            label: (item) => `${item.dataset.label}: ${item.parsed.y == null ? "n/a" : `$${item.parsed.y.toFixed(2)}`}`,
          },
        },
        // Measures reported EPS (dataset 1) across quarters, not the estimate.
        dragMeasure: { series: [{ datasetIndex: 1, format: (v) => `$${v.toFixed(2)}` }] },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: NEUTRAL, maxRotation: 0, autoSkip: false, font: { size: 10 } } },
        y: { grid: { color: "rgba(139,147,163,0.12)" }, ticks: { color: NEUTRAL, maxTicksLimit: 6 } },
      },
    }),
    []
  );

  // ----- Earnings Trends: revenue vs earnings (9 reported + 1 est) -----
  const trendRev = useMemo(() => {
    if (!profile) return null;
    const rows = (revMode === "annual" ? profile.revenueAnnual : profile.revenueQuarters) ?? [];
    if (!rows.length) return null;
    const latest = [...rows].reverse().find((r) => !r.upcoming) ?? rows[rows.length - 1];
    return {
      latest,
      data: {
        labels: rows.map((r) => r.label),
        datasets: [
          {
            label: "Revenue",
            data: rows.map((r) => r.revenue),
            backgroundColor: rows.map((r) => (r.upcoming ? "rgba(77,163,255,0.45)" : REV_BLUE)),
            borderRadius: 5,
            maxBarThickness: 34,
          },
          {
            label: "Earnings",
            data: rows.map((r) => r.netIncome),
            backgroundColor: EARN_YELLOW,
            borderRadius: 5,
            maxBarThickness: 34,
          },
        ],
      },
    };
  }, [profile, revMode]);

  const barOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: { displayColors: false, callbacks: { label: (item) => `${item.dataset.label}: ${formatCap(item.parsed.y)}` } },
        dragMeasure: {
          series: [
            { datasetIndex: 0, label: "Rev", format: (v) => formatCap(v) },
            { datasetIndex: 1, label: "Earn", format: (v) => formatCap(v) },
          ],
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: NEUTRAL, maxRotation: 0, font: { size: 10 } } },
        y: {
          grid: { color: "rgba(139,147,163,0.12)" },
          ticks: { color: NEUTRAL, maxTicksLimit: 5, callback: (v) => formatCount(v) },
        },
      },
    }),
    []
  );

  // ----- Earnings History: 3 years of quarters, expandable to the full run -----
  const sideHistory = useMemo(() => {
    const all = profile?.earningsHistory ?? [];
    if (!all.length) return null;

    const reported = all.filter((r) => !r.upcoming);
    const upcoming = all.filter((r) => r.upcoming);
    const hasMore = reported.length > HISTORY_QUARTERS;
    const shown = historyOpen ? all : [...reported.slice(-HISTORY_QUARTERS), ...upcoming];
    // Points get cramped once the sidebar holds a full five years.
    const radius = shown.length > 15 ? 4 : 5;

    // The axis spans exactly the values on screen. Anything wider leaves the
    // series stranded in a band of empty chart - a company that grew from a
    // loss to $25 a share otherwise reads as a flat line under one spike.
    const boundsOf = (datasets) => {
      const values = datasets.flatMap((d) => d.data).filter((v) => v != null && Number.isFinite(v));
      if (!values.length) return null;
      const lo = Math.min(...values);
      const hi = Math.max(...values);
      if (lo === hi) {
        const pad = Math.max(Math.abs(lo) * 0.1, 0.01);
        return { min: lo - pad, max: hi + pad };
      }
      return { min: lo, max: hi };
    };

    // Shared marker shape: hollow ring for what analysts expected, filled
    // dot for what the company actually posted.
    const ring = (data) => ({
      label: "Estimate",
      data,
      showLine: false,
      clip: false,
      pointRadius: radius,
      pointHoverRadius: radius + 1,
      pointBorderWidth: 1.6,
      pointBorderColor: NEUTRAL,
      pointBackgroundColor: "transparent",
    });
    const dot = (label, data, colors) => ({
      label,
      data,
      showLine: false,
      clip: false,
      pointRadius: radius,
      pointHoverRadius: radius + 1,
      pointBackgroundColor: colors,
      pointBorderColor: "transparent",
    });

    // Both tabs score the same way: green when the company came in above
    // consensus, red below, grey on the nose. The tolerance is relative so
    // it reads the same on a $2 EPS and a $40B revenue line.
    const scoreColor = (actual, estimate) => {
      if (actual == null || estimate == null || estimate === 0) return UP;
      const diff = (actual - estimate) / Math.abs(estimate);
      if (Math.abs(diff) < 0.0005) return NEUTRAL;
      return diff > 0 ? UP : DOWN;
    };

    const eps = historyTab === "eps";
    const estimateOf = (r) => (eps ? r.estimate : r.revenueEstimate);
    const actualOf = (r) => (eps ? r.actual : r.revenue);

    const rows = shown.filter((r) => actualOf(r) != null || estimateOf(r) != null);
    if (!rows.length) return null;
    const datasets = [
      ring(rows.map(estimateOf)),
      dot(
        "Actual",
        rows.map(actualOf),
        rows.map((r) => scoreColor(actualOf(r), estimateOf(r)))
      ),
    ];
    return {
      kind: eps ? "eps" : "revenue",
      rows,
      hasMore,
      radius,
      estimateOf,
      actualOf,
      bounds: boundsOf(datasets),
      data: { labels: rows.map((r) => r.label), datasets },
    };
  }, [profile, historyTab, historyOpen]);

  const sideHistoryOptions = useMemo(() => {
    // Surprise for the hovered quarter, shared by the footer text and its
    // colour so the two can never disagree.
    const surpriseAt = (index) => {
      const row = sideHistory?.rows?.[index];
      if (!row) return null;
      const estimate = sideHistory.estimateOf(row);
      const actual = sideHistory.actualOf(row);
      if (estimate == null || actual == null || estimate === 0) return null;
      const pct = ((actual - estimate) / Math.abs(estimate)) * 100;
      if (Math.abs(pct) < 0.05) return { pct, label: "Match", color: NEUTRAL };
      return {
        pct,
        label: `${pct > 0 ? "Beat" : "Miss"} ${pct > 0 ? "+" : ""}${pct.toFixed(2)}%`,
        color: pct > 0 ? UP : DOWN,
      };
    };

    return {
      responsive: true,
      maintainAspectRatio: false,
      // Index mode so one hover reports the estimate and the actual together
      // rather than whichever marker the cursor happens to be nearest.
      interaction: { mode: "index", intersect: false },
      plugins: {
        tooltip: {
          // Repeated here because the tooltip resolves its own mode before
          // falling back to options.interaction, and anything short of index
          // mode only answers when the cursor is right on top of a marker.
          mode: "index",
          intersect: false,
          displayColors: false,
          // Quarters missing one of the two values shouldn't print a blank row.
          filter: (item) => item.parsed.y != null,
          footerColor: (ctx) => surpriseAt(ctx.tooltip?.dataPoints?.[0]?.dataIndex)?.color ?? NEUTRAL,
          callbacks: {
            label: (item) =>
              `${item.datasetIndex === 0 ? "Est." : "Act."}  ${
                historyTab === "eps" ? `$${item.parsed.y.toFixed(2)}` : formatCap(item.parsed.y)
              }`,
            // Spell out the beat or miss the two markers encode.
            footer: (items) => surpriseAt(items[0]?.dataIndex)?.label ?? "",
          },
        },
        dragMeasure: {
          series: [
            { datasetIndex: 1, format: (v) => (historyTab === "eps" ? `$${v.toFixed(2)}` : formatCap(v)) },
          ],
        },
      },
      // The axis ends on the extreme values, so the markers sitting on them
      // need room to draw outside the plot area instead of being sheared.
      layout: { padding: { top: (sideHistory?.radius ?? 5) + 2, bottom: (sideHistory?.radius ?? 5) + 2 } },
      scales: {
        x: { grid: { display: false }, ticks: { color: NEUTRAL, maxTicksLimit: 6, maxRotation: 0, font: { size: 9 } } },
        y: {
          ...(sideHistory?.bounds ?? {}),
          grid: { color: "rgba(139,147,163,0.12)" },
          ticks: {
            color: NEUTRAL,
            maxTicksLimit: 5,
            callback: (v) => (historyTab === "eps" ? `$${v.toFixed(2)}` : formatCount(v)),
          },
        },
      },
    };
  }, [historyTab, sideHistory]);

  if (profileError) {
    return (
      <main className="stock-page">
        <div className="stock-error">
          <div>
            {symbol}: {profileError}
          </div>
          {current?.retryable && (
            <button className="stock-retry-btn" onClick={() => setReloadKey((k) => k + 1)}>
              Try again
            </button>
          )}
        </div>
      </main>
    );
  }

  if (!profile) return <LoadingSkeleton symbol={symbol} retrying={!!current?.retrying} />;

  const q = profile.quote;
  const displayPrice = view?.last ?? q?.price;
  const consensus = profile.consensus;
  const targetSpan =
    consensus?.targetLow != null && consensus?.targetHigh != null && consensus.targetHigh > consensus.targetLow
      ? consensus.targetHigh - consensus.targetLow
      : null;
  const targetPos = (v) =>
    targetSpan == null || v == null
      ? null
      : Math.min(97, Math.max(3, ((v - consensus.targetLow) / targetSpan) * 88 + 6));

  const hoverPoint = chartHover && view ? view.points[chartHover.index] : null;
  const hoverEarnings = chartHover ? earningsMarks?.get(chartHover.index) : null;
  const hoverSurprise = epsSurprise(hoverEarnings);

  // The colour is claimed when a stock joins and held until it leaves, so
  // dropping one comparison never repaints the other one out from under you.
  const addCompare = (pick) => {
    if (compare.length >= MAX_COMPARE || compare.some((c) => c.symbol === pick.symbol)) return;
    const used = new Set(compare.map((c) => c.color));
    const color = SERIES_COLORS.slice(1).find((c) => !used.has(c));
    if (!color) return;
    setPicked({ symbol, list: [...compare, { ...pick, color }] });
  };

  const removeCompare = (ticker) =>
    setPicked({ symbol, list: compare.filter((c) => c.symbol !== ticker) });

  // The dates the comparison actually spans, which ends on the last candle
  // rather than today whenever the market is shut. An intraday range starts
  // and ends on the same day, so it prints that date once.
  const spanLabel = (() => {
    if (!view) return null;
    const from = fmtSpanDate(view.points[0].t);
    const to = fmtSpanDate(view.points[view.points.length - 1].t);
    return from === to ? from : `${from} – ${to}`;
  })();

  // The extended-hours print only means anything once the regular session is
  // over, and Yahoo reports its move as a fraction.
  const market = profile.market ?? {};
  const closeClock = fmtClock(market.closeTime);
  const afterHours =
    market.postPrice != null
      ? {
          price: market.postPrice,
          change: market.postChange,
          changePct: market.postChangePct == null ? null : market.postChangePct * 100,
          up: (market.postChange ?? 0) >= 0,
        }
      : null;

  // The calendar event is the company's own confirmed date; the upcoming
  // quarter's report date stands in when Yahoo hasn't published one yet.
  const nextEarningsAt =
    profile.nextEarningsTs != null
      ? profile.nextEarningsTs * 1000
      : (() => {
          const upcoming = (profile.earningsHistory ?? []).find((r) => r.upcoming && r.reportDate);
          return upcoming ? Date.parse(`${upcoming.reportDate}T12:00:00`) : null;
        })();

  const nextEarningsLabel = nextEarningsAt
    ? new Date(nextEarningsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  // Counted in whole calendar days from today, so "1 day away" means
  // tomorrow rather than any point in the next 24 hours.
  const nextEarnings = (() => {
    if (!nextEarningsAt) return null;
    const startOfDay = (ms) => {
      const d = new Date(ms);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    };
    const days = Math.round((startOfDay(nextEarningsAt) - startOfDay(Date.now())) / 86400000);
    if (days < 0) return null;
    return {
      label: new Date(nextEarningsAt).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
      away: days === 0 ? "today" : days === 1 ? "1 day away" : `${days} days away`,
    };
  })();

  // A fund holds assets rather than having a market cap, and both stat blocks
  // name the figure the same way.
  const capLabel = profile.capKind === "assets" ? "Fund Assets" : "Market Cap";

  const statRows = [
    { label: "Forward P/E", value: fmtNum(q.forwardPE) },
    { label: capLabel, value: formatCap(q.marketCap) },
    { label: "Open", value: fmtPrice(q.open) },
    { label: "Trailing P/E", value: fmtNum(q.trailingPE) },
    {
      label: "Day Range",
      value: q.dayLow != null && q.dayHigh != null ? `$${q.dayLow.toFixed(2)}-$${q.dayHigh.toFixed(2)}` : "n/a",
    },
    { label: "Dividend Yield", value: fmtPct(q.dividendYield) },
    {
      label: "52W Range",
      value:
        q.fiftyTwoWeekLow != null && q.fiftyTwoWeekHigh != null
          ? `$${q.fiftyTwoWeekLow.toFixed(2)}-$${q.fiftyTwoWeekHigh.toFixed(2)}`
          : "n/a",
    },
    { label: "EPS", value: q.epsTrailing != null ? `$${q.epsTrailing.toFixed(2)}` : "n/a" },
    {
      label: "Revenue YoY%",
      value: fmtPctSigned(profile.revenueYoY),
      tone: profile.revenueYoY == null ? null : profile.revenueYoY >= 0 ? "up" : "down",
    },
  ];

  const valuationRows = [
    [capLabel, formatCount(profile.valuation.marketCap)],
    ["Enterprise Value", formatCount(profile.valuation.enterpriseValue)],
    ["Trailing P/E", fmtNum(profile.valuation.trailingPE)],
    ["Forward P/E", fmtNum(profile.valuation.forwardPE)],
    ["PEG Ratio (5yr expected)", fmtNum(profile.valuation.pegRatio)],
    ["Price/Sales (ttm)", fmtNum(profile.valuation.priceToSales)],
    ["Price/Book (mrq)", fmtNum(profile.valuation.priceToBook)],
    ["Enterprise Value/Revenue", fmtNum(profile.valuation.evToRevenue)],
    ["Enterprise Value/EBITDA", fmtNum(profile.valuation.evToEbitda)],
  ];

  const highlightRows = [
    ["Profit Margin", fmtPct(profile.highlights.profitMargin)],
    ["Return on Assets (ttm)", fmtPct(profile.highlights.returnOnAssets)],
    ["Return on Equity (ttm)", fmtPct(profile.highlights.returnOnEquity)],
    ["Revenue (ttm)", formatCount(profile.highlights.revenue)],
    ["Net Income Avi to Common (ttm)", formatCount(profile.highlights.netIncome)],
    ["Diluted EPS (ttm)", fmtNum(profile.highlights.dilutedEps)],
    ["Total Cash (mrq)", formatCount(profile.highlights.totalCash)],
    ["Total Debt/Equity (mrq)", profile.highlights.debtToEquity != null ? `${profile.highlights.debtToEquity.toFixed(2)}%` : "n/a"],
    ["Levered Free Cash Flow (ttm)", formatCount(profile.highlights.leveredFreeCashflow)],
  ];

  return (
    <main className="stock-page">
      <div className="stock-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="stock-head-logo"
          src={logoUrl(symbol)}
          alt=""
          onError={hideBrokenLogo}
        />
        <div>
          <h1 className="stock-head-name">{profile.name}</h1>
          <div className="stock-head-sub">
            {symbol} · {profile.exchange}
            {profile.exchangeFlag && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                className="stock-head-flag"
                src={`https://flagcdn.com/w20/${profile.exchangeFlag}.png`}
                alt={profile.exchangeFlag.toUpperCase()}
              />
            )}
            {profile.profile.industry && <> · {profile.profile.industry}</>}
          </div>
        </div>
      </div>

      <div className="stock-grid">
        <div className="stock-main">
          <section className="stock-card">
            <div className="stock-card-top">
              <div className="stock-card-top-main">
                <div className="stock-price-row">
                  <span className="stock-price">{fmtPrice(displayPrice)}</span>
                  {view && (
                    <>
                      <span className={`stock-change ${view.up ? "up" : "down"}`}>
                        {fmtSigned(view.change)} ({view.change >= 0 ? "+" : "-"}
                        {Math.abs(view.changePct).toFixed(2)}%)
                      </span>
                      <span className="stock-range-wording">{RANGE_WORDING[range]}</span>
                    </>
                  )}
                </div>
                <div className="stock-session">
                  <span className="stock-session-close">
                    At close{closeClock ? `: ${closeClock}` : ""}
                  </span>
                  {afterHours && (
                    <span className="stock-session-post">
                      After hours: <b>{fmtPrice(afterHours.price)}</b>{" "}
                      <span className={afterHours.up ? "up" : "down"}>
                        {fmtSigned(afterHours.change)}
                        {afterHours.changePct != null && (
                          <> ({afterHours.change >= 0 ? "+" : "-"}
                          {Math.abs(afterHours.changePct).toFixed(2)}%)</>
                        )}
                      </span>
                    </span>
                  )}
                </div>
              </div>
              <div className="stock-card-top-side">
                {nextEarnings && (
                  <div className="stock-next-earnings">
                    Next earnings on <b>{nextEarnings.label}</b> ({nextEarnings.away})
                  </div>
                )}
                <WatchlistButton
                  symbol={symbol}
                  name={profile.name}
                  label
                  onError={setWatchError}
                />
                {watchError && <p className="stock-watch-error">{watchError}</p>}
              </div>
            </div>
            <div className="stock-chart-bar">
              <div className="stock-ranges">
                {RANGES.map((r) => (
                  <button
                    key={r.key}
                    className={`stock-range-btn${range === r.key ? " active" : ""}`}
                    onClick={() => setRange(r.key)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <CompareControl
                base={symbol}
                compare={compare}
                max={MAX_COMPARE}
                onAdd={addCompare}
                onRemove={removeCompare}
              />
              <TechnicalsControl
                value={tech}
                onChange={setTech}
                disabled={compareMode}
                disabledReason="Averages are prices, so they need a price axis. Remove the comparison to use them."
              />
              <IndicatorsControl
                value={indicatorKey}
                onChange={setIndicatorKey}
                disabled={compareMode || !INDICATOR_RANGES.has(range)}
                disabledReason={
                  compareMode
                    ? "The indicator needs its own axis beside a single stock. Remove the comparison to use it."
                    : "The index is published once a day, so it has nothing to plot intraday. Pick 1M or longer."
                }
              />
            </div>
            <div className="stock-chart">
              <div className="watermark">◍ Luna Terminal</div>
              {lineData ? <Line data={lineData} options={lineOptions} /> : <div className="stock-chart-empty">Loading chart…</div>}
              {hoverPoint && (
                <div
                  className="stock-tip"
                  style={{
                    left: `${Math.min(
                      Math.max(chartHover.x, 95),
                      Math.max((chartHover.width ?? 0) - 95, 95)
                    )}px`,
                  }}
                >
                  <div className="stock-tip-head">
                    {/* A comparison has no single price to headline, so the
                        moment leads and each stock reports below it. */}
                    {!compareMode && <span className="stock-tip-price">{fmtPrice(hoverPoint.c)}</span>}
                    <span className="stock-tip-when">{hoverLabel(hoverPoint.t, range)}</span>
                  </div>
                  {compareMode && (
                    <div className="stock-tip-series">
                      {series.map((s) => {
                        const value = s.values[chartHover.index];
                        const pct = s.pct[chartHover.index];
                        return (
                          <div className="stock-tip-series-row" key={s.symbol}>
                            <i className="stock-tip-swatch" style={{ background: s.color }} />
                            <span className="stock-tip-series-sym">{s.symbol}</span>
                            <b>{fmtPrice(value)}</b>
                            <span className={pct == null ? "" : pct >= 0 ? "up" : "down"}>
                              {pct == null ? "n/a" : `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {hoverEarnings && (
                    <div className="stock-tip-earn">
                      <div className="stock-tip-earn-title">
                        {/* Which quarter, not just "Earnings": the fiscal
                            label is the thing a reader is checking a marker
                            against, and the date below is the day it was
                            announced rather than the quarter it covers. Falls
                            back to the bare word for a feed that hands back a
                            report with no fiscal label on it. */}
                        <i className="stock-tip-earn-dot" /> Earnings
                        {hoverEarnings.label ? ` ${hoverEarnings.label}` : ""}
                      </div>
                      <div className="stock-tip-earn-row">
                        <span>Date</span>
                        <b>{fmtDate(hoverEarnings.reportDate)}</b>
                      </div>
                      <div className="stock-tip-earn-row">
                        <span>EPS Estimate</span>
                        <b>{fmtNum(hoverEarnings.estimate)}</b>
                      </div>
                      <div className="stock-tip-earn-row">
                        <span>EPS Actual</span>
                        <b>{fmtNum(hoverEarnings.actual)}</b>
                      </div>
                      {hoverSurprise && (
                        <div className="stock-tip-earn-row">
                          <span>EPS Surprise</span>
                          <b className={hoverSurprise.up ? "up" : "down"}>{hoverSurprise.text}</b>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            {volumeData && (
              <>
                <div className="stock-volume">
                  <Bar data={volumeData} options={volumeOptions} />
                </div>
                {/* Only one stock's volume is plotted, which needs saying once
                    a second and third line are on the price chart above. */}
                {compareMode && <div className="stock-volume-note">Volume · {symbol}</div>}
              </>
            )}

            {rsiData && (
              <div className="stock-rsi">
                <div className="stock-rsi-head">
                  <span className="stock-rsi-title">RSI {RSI_PERIOD}</span>
                  <span className="stock-rsi-now">{fmtNum(lastValue(technicals.rsiValues))}</span>
                </div>
                <div className="stock-rsi-chart">
                  <Line data={rsiData} options={rsiOptions} />
                </div>
              </div>
            )}

            {/* A 200-session average on a one-month chart has nothing to
                average over yet. Better to say which line is missing than to
                leave the reader wondering why a switch did nothing. */}
            {!compareMode && technicals?.short.length > 0 && (
              <div className="stock-tech-note">
                Not enough history in this range for {technicals.short.map((l) => l.label).join(" and ")}. Try a
                longer range.
              </div>
            )}

            {compareMode && (
              <div className="stock-cmp">
                <div className="stock-cmp-caption">
                  <span>
                    {range === "1d" ? "Indexed to the previous close" : "Indexed to the start of the range"} · %
                    change {RANGE_WORDING[range]}
                  </span>
                  <span className="stock-cmp-span">{spanLabel}</span>
                </div>
                <div className="stock-cmp-table">
                  <div className="stock-cmp-row head">
                    <span>Stock</span>
                    <span>Price</span>
                    <span>Change</span>
                    <span>% Change</span>
                    <span />
                  </div>
                  {series.map((s) => (
                    <div className="stock-cmp-row" key={s.symbol}>
                      <span className="stock-cmp-id">
                        <i className="stock-cmp-swatch" style={{ background: s.color }} />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          className="stock-cmp-logo"
                          src={logoUrl(s.symbol, 48)}
                          alt=""
                          onError={blankBrokenLogo}
                        />
                        <span className="stock-cmp-names">
                          <b>{s.name}</b>
                          <em>
                            {s.symbol}
                            {s.exchange ? ` · ${s.exchange}` : ""}
                          </em>
                        </span>
                      </span>
                      <span className="stock-cmp-price">{fmtPrice(s.last)}</span>
                      <span className={s.change == null ? "" : s.change >= 0 ? "up" : "down"}>
                        {fmtSigned(s.change)}
                      </span>
                      <span
                        className={`stock-cmp-pct${
                          s.changePct == null ? "" : s.changePct >= 0 ? " up" : " down"
                        }`}
                      >
                        {s.changePct == null ? (
                          "n/a"
                        ) : (
                          <>
                            {s.changePct >= 0 ? "↗" : "↘"} {Math.abs(s.changePct).toFixed(2)}%
                          </>
                        )}
                      </span>
                      <span className="stock-cmp-remove">
                        {s.removable && (
                          <button
                            type="button"
                            onClick={() => removeCompare(s.symbol)}
                            aria-label={`Remove ${s.symbol} from the comparison`}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="stock-stats-grid">
              {statRows.map((row) => (
                <div className="stock-stat" key={row.label}>
                  <span className="stock-stat-label">{row.label}</span>
                  <span className={`stock-stat-value${row.tone ? ` ${row.tone}` : ""}`}>{row.value}</span>
                </div>
              ))}
            </div>
          </section>

          {supportsHoldings(symbol, profile.quoteType) && <EtfHoldings symbol={symbol} />}


          <h2 className="stock-section-title">Statistics</h2>
          <div className="stock-stats-cards">
            <section className="stock-card">
              <h3 className="stock-card-title">Valuation Measures</h3>
              {valuationRows.map(([label, value]) => (
                <div className="stock-row" key={label}>
                  <span>{label}</span>
                  <span className="stock-row-value">{value}</span>
                </div>
              ))}
            </section>
            <section className="stock-card">
              <h3 className="stock-card-title">Financial Highlights</h3>
              {highlightRows.map(([label, value]) => (
                <div className="stock-row" key={label}>
                  <span>{label}</span>
                  <span className="stock-row-value">{value}</span>
                </div>
              ))}
            </section>
          </div>

          <h2 className="stock-section-title">Earnings Trends</h2>
          <div className="stock-stats-cards">
            <section className="stock-card">
              <div className="stock-card-head">
                <h3 className="stock-card-title">Earnings Per Share</h3>
                <div className="stock-toggle">
                  <button className={epsMode === "gaap" ? "active" : ""} onClick={() => setEpsMode("gaap")}>
                    GAAP
                  </button>
                  <button className={epsMode === "normalized" ? "active" : ""} onClick={() => setEpsMode("normalized")}>
                    Normalized
                  </button>
                </div>
              </div>
              {trendEps ? (
                <>
                  {(() => {
                    const active =
                      (epsHover != null && trendEps.rows[epsHover]) || trendEps.lastReported;
                    if (!active) return null;
                    const value = trendEps.actualOf(active);
                    const resultClass =
                      value != null && active.estimate != null && value < active.estimate ? "down" : "up";
                    return (
                      <div className="stock-trend-sub">
                        <b>{active.label}</b>
                        {active.estimate != null && (
                          <>
                            {" "}
                            <i className="stock-eps-ring" />{" "}
                            {trendEps.gaapMode ? "Estimate (norm.)" : "Estimate"}{" "}
                            {fmtSigned(active.estimate)}
                          </>
                        )}{" "}
                        <i className="stock-eps-fill" style={{ background: trendEps.colorOf(active) }} />{" "}
                        {trendEps.gaapMode ? "GAAP" : "Actual"}{" "}
                        {value != null ? (
                          <span className={resultClass}>{fmtSigned(value)}</span>
                        ) : (
                          <span className="stock-beat-date">n/a</span>
                        )}
                      </div>
                    );
                  })()}
                  <div className="stock-trend-chart">
                    <Line data={trendEps.data} options={scatterOptions} />
                  </div>
                  <div className="stock-beat-row">
                    {trendEps.rows.map((r) => {
                      const actual = trendEps.actualOf(r);
                      const surprise = actual != null && r.estimate != null ? actual - r.estimate : null;
                      return (
                        <div className="stock-beat-cell" key={r.label}>
                          {r.upcoming ? (
                            <span className="stock-beat-date">{nextEarningsLabel ?? "Est."}</span>
                          ) : surprise != null ? (
                            <span className={surprise >= 0 ? "up" : "down"}>
                              {surprise >= 0 ? "Beat" : "Miss"} {fmtSigned(surprise)}
                            </span>
                          ) : (
                            <span className="stock-beat-date">n/a</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="stock-chart-empty">No EPS data</div>
              )}
            </section>

            <section className="stock-card">
              <div className="stock-card-head">
                <h3 className="stock-card-title">Revenue vs. Earnings</h3>
                <div className="stock-toggle">
                  <button className={revMode === "annual" ? "active" : ""} onClick={() => setRevMode("annual")}>
                    Annual
                  </button>
                  <button className={revMode === "quarterly" ? "active" : ""} onClick={() => setRevMode("quarterly")}>
                    Quarterly
                  </button>
                </div>
              </div>
              {trendRev ? (
                <>
                  <div className="stock-trend-sub">
                    <b>{trendRev.latest.label}</b> <i className="stock-dot-rev" /> Revenue{" "}
                    {formatCount(trendRev.latest.revenue)} <i className="stock-dot-earn" /> Earnings{" "}
                    {formatCount(trendRev.latest.netIncome)}
                  </div>
                  <div className="stock-trend-chart">
                    <Bar data={trendRev.data} options={barOptions} />
                  </div>
                </>
              ) : (
                <div className="stock-chart-empty">No revenue data</div>
              )}
            </section>
          </div>

          <CatalystTimeline
            symbol={symbol}
            name={profile.name}
            points={view?.points ?? []}
            fallback={{
              pct: view?.changePct,
              timestamp: profile.market.closeTime,
              close: view?.last,
            }}
          />

          {profile.peers.length > 0 && (
            <>
              <h2 className="stock-section-title">Compare</h2>
              <div className="stock-peers">
                {profile.peers.map((p) => {
                  const path = sparkPath(p.spark);
                  const sparkUp = (p.sparkChangePct ?? 0) >= 0;
                  return (
                  <a className="stock-peer-card" key={p.symbol} href={`/stock/${p.symbol}`}>
                    <div className="stock-peer-head">
                      <span className="stock-peer-symbol">{p.symbol}</span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={logoUrl(p.symbol)}
                        alt=""
                        onError={hideBrokenLogo}
                      />
                    </div>
                    <div className="stock-peer-name">{p.name}</div>
                    <div className="stock-peer-price">
                      {p.price != null ? p.price.toFixed(2) : "n/a"}{" "}
                      {p.changePct != null && (
                        <span className={p.changePct >= 0 ? "up" : "down"}>
                          {p.changePct >= 0 ? "+" : ""}
                          {p.changePct.toFixed(2)}%
                        </span>
                      )}
                    </div>
                    <div className="stock-peer-row">
                      <span>Mkt Cap</span>
                      <span>{formatCount(p.cap)}</span>
                    </div>
                    <div className="stock-peer-row">
                      <span>Industry</span>
                      <span>{p.industry}</span>
                    </div>
                    {/* Three months of daily closes, from the same quote request
                        the price above came from. */}
                    {path && (
                      <div className="stock-peer-spark">
                        <svg
                          viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
                          preserveAspectRatio="none"
                          aria-hidden="true"
                        >
                          <path d={path} className={sparkUp ? "up" : "down"} />
                        </svg>
                        <span className={`stock-peer-spark-pct ${sparkUp ? "up" : "down"}`}>
                          3M {sparkUp ? "+" : "−"}
                          {Math.abs(p.sparkChangePct).toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </a>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <aside className="stock-side">
          <section className="stock-card">
            <div className="stock-row">
              <span>Symbol</span>
              <span className="stock-row-value">{symbol}</span>
            </div>
            <div className="stock-row">
              <span>IPO Date</span>
              <span className="stock-row-value">{fmtDate(profile.profile.ipoDate)}</span>
            </div>
            <div className="stock-row">
              <span>CEO</span>
              <span className="stock-row-value">{profile.profile.ceo ?? "n/a"}</span>
            </div>
            <div className="stock-row">
              <span>Fulltime Employees</span>
              <span className="stock-row-value">{formatCount(profile.profile.employees)}</span>
            </div>
            <div className="stock-row">
              <span>Sector</span>
              <span className="stock-row-value">{profile.profile.sector ?? "n/a"}</span>
            </div>
            <div className="stock-row">
              <span>Industry</span>
              <span className="stock-row-value">{profile.profile.industry ?? "n/a"}</span>
            </div>
            <div className="stock-row">
              <span>Country</span>
              <span className="stock-row-value">{profile.profile.country ?? "n/a"}</span>
            </div>
            <div className="stock-row">
              <span>Exchange</span>
              <span className="stock-row-value">{profile.exchange ?? "n/a"}</span>
            </div>
            {profile.profile.description && (
              <>
                <p className={`stock-desc${descOpen ? " open" : ""}`}>{profile.profile.description}</p>
                <button className="stock-desc-toggle" onClick={() => setDescOpen((v) => !v)}>
                  {descOpen ? "View Less" : "View More"} {descOpen ? "▲" : "▼"}
                </button>
              </>
            )}
          </section>

          {consensus && (
            <>
              <h3 className="stock-side-title">Analyst Consensus</h3>
              <section className="stock-card">
                <div className="stock-consensus-top">
                  <span className={`stock-consensus-pill ${consensus.key ?? ""}`}>
                    {CONSENSUS_LABELS[consensus.key] ?? "n/a"}
                  </span>
                  <span className="stock-consensus-count">
                    {consensus.analysts != null ? `${consensus.analysts} analysts` : ""}
                  </span>
                </div>
                <div className="stock-consensus-counts">
                  <span className="down">{consensus.bearish} Bearish</span>
                  <span>{consensus.neutral} Neutral</span>
                  <span className="up">{consensus.bullish} Bullish</span>
                </div>
                <div className="stock-consensus-bar">
                  {(() => {
                    const total = consensus.bearish + consensus.neutral + consensus.bullish || 1;
                    const segments = 24;
                    const bear = Math.round((consensus.bearish / total) * segments);
                    const neut = Math.round((consensus.neutral / total) * segments);
                    return Array.from({ length: segments }, (_, i) => (
                      <i key={i} style={{ background: i < bear ? DOWN : i < bear + neut ? NEUTRAL : UP }} />
                    ));
                  })()}
                </div>
                <div className="stock-targets">
                  {[
                    ["Low", consensus.targetLow, "low"],
                    ["Current", consensus.current, "current"],
                    ["Average", consensus.targetMean, "avg"],
                    ["High", consensus.targetHigh, "high"],
                  ].map(([label, value, cls]) => (
                    <div className="stock-target" key={label}>
                      <div className="stock-target-value">
                        {value != null ? `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "n/a"}
                      </div>
                      <div className="stock-target-label">
                        <i className={`stock-target-dot ${cls}`} /> {label}
                      </div>
                    </div>
                  ))}
                </div>
                {targetSpan != null && (
                  <div className="stock-target-track">
                    {[
                      [consensus.targetLow, "low"],
                      [consensus.current, "current"],
                      [consensus.targetMean, "avg"],
                      [consensus.targetHigh, "high"],
                    ].map(([value, cls]) =>
                      targetPos(value) == null ? null : (
                        <i key={cls} className={`stock-target-dot ${cls}`} style={{ left: `${targetPos(value)}%` }} />
                      )
                    )}
                  </div>
                )}
              </section>
            </>
          )}

          {profile.etfs?.length > 0 && (
            <>
              <h3 className="stock-side-title">ETFs Holding {symbol}</h3>
              <section className="stock-card">
                <div className="stock-etf-sub">Major ETFs with {symbol}, by trading volume</div>
                {profile.etfs.map((e) => (
                  <a className="stock-etf-row" key={e.symbol} href={`/stock/${e.symbol}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={logoUrl(e.symbol, 48)}
                      alt=""
                      onError={blankBrokenLogo}
                    />
                    <div className="stock-etf-main">
                      <div className="stock-etf-sym">{e.symbol}</div>
                      <div className="stock-etf-name">{e.name}</div>
                    </div>
                    <div className="stock-etf-meta">
                      <div className="stock-etf-vol">Vol {formatCount(e.volume)}</div>
                      {e.changePct != null && (
                        <div className={e.changePct >= 0 ? "up" : "down"}>
                          {e.changePct >= 0 ? "+" : ""}
                          {e.changePct.toFixed(2)}%
                        </div>
                      )}
                    </div>
                  </a>
                ))}
              </section>
            </>
          )}

          {sideHistory && (
            <>
              <div className="stock-side-head">
                <h3 className="stock-side-title">Earnings History</h3>
                <div className="stock-tabs">
                  <button className={historyTab === "eps" ? "active" : ""} onClick={() => setHistoryTab("eps")}>
                    EPS
                  </button>
                  <button className={historyTab === "revenue" ? "active" : ""} onClick={() => setHistoryTab("revenue")}>
                    Revenue
                  </button>
                </div>
              </div>
              <section className="stock-card">
                <div className="stock-history-legend">
                  <span>
                    <i className="stock-eps-ring" /> Estimate
                  </span>
                  <span>
                    <i className="stock-hist-dot" style={{ background: UP }} /> Beat
                  </span>
                  <span>
                    <i className="stock-hist-dot" style={{ background: DOWN }} /> Miss
                  </span>
                  <span>
                    <i className="stock-hist-dot" style={{ background: NEUTRAL }} /> Match
                  </span>
                </div>
                <div className="stock-history-chart">
                  <Line data={sideHistory.data} options={sideHistoryOptions} />
                </div>
                {sideHistory.hasMore && (
                  <button className="stock-history-more" onClick={() => setHistoryOpen((v) => !v)}>
                    {historyOpen ? "Show less" : "Show more"} <span aria-hidden>{historyOpen ? "‹" : "›"}</span>
                  </button>
                )}
              </section>
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
