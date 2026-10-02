"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ema, rsi, sma, visibleTail } from "@/lib/indicators";
import {
  rsiLeSignals,
  RSI_LE_LENGTH,
  RSI_LE_OVERBOUGHT,
  RSI_LE_OVERSOLD,
} from "@/lib/rsiLe";
import { RSI_LE_NOTIFICATION_EVENT, RSI_LE_NOTIFICATION_KEYS } from "@/lib/rsiLeNotifications";
import RsiLeAlertMenu from "@/components/RsiLeAlertMenu";
import GexHeatmap from "@/components/GexHeatmap";
import RsiLeTechnicals, { RLE_MA_LINES } from "@/components/RsiLeTechnicals";
import RsiLeSelectMenu from "@/components/RsiLeSelectMenu";
import { drawGexOverlay, gexOverlayRuns } from "@/lib/gexOverlay.mjs";
import { GEX_HISTORY_EVENT, pollGexHistory, readGexHistory } from "@/lib/gexHistory";
import { GEX_SYMBOLS } from "@/lib/gex";
import { emaCrossSignals, macdSignals, openingRangeSignals, vwapSignals } from "@/lib/intradaySignals";
import { wheelPixels, zoomViewport } from "@/lib/chartNavigation.mjs";

const RANGES = [
  { key: "1d", label: "1D", detail: "1 minute" },
  { key: "3d", label: "3D", detail: "5 minutes" },
  { key: "5d", label: "5D", detail: "5 minutes" },
];

const REFRESH_MS = 20_000;
const GEX_STYLE_OPTIONS = [
  { key: "bands", label: "GEX Bands", detail: "Continuous exposure zones" },
  { key: "bubbles", label: "GEX Bubbles", detail: "Discrete strike markers" },
];
const SIGNAL_OPTIONS = [
  { key: "rsi", label: "±2 RsiLE", detail: "RSI 14 reversals" },
  { key: "vwap", label: "VWAP Reclaim", detail: "Session VWAP crosses" },
  { key: "orb", label: "15m ORB", detail: "Opening-range breakouts" },
  { key: "ema", label: "EMA 9/21 Cross", detail: "Fast / slow trend crosses" },
  { key: "macd", label: "MACD Cross", detail: "12 / 26 / 9 momentum" },
];
const SIGNAL_DETAILS = {
  rsi: { badge: "RsiLE +/- 2", long: "+2 RsiLE", short: "−2 RsiSE", longLegend: "+2 RsiLE (Calls)", shortLegend: "−2 RsiSE (Puts)", note: "RSI(14) crossing back above 30 requests RsiLE, while crossing back below 70 requests RsiSE. Accepted reversals fill at the next candle's open." },
  vwap: { badge: "VWAP Reclaim", long: "+2 VWAP", short: "−2 VWAP", longLegend: "+2 VWAP reclaim", shortLegend: "−2 VWAP breakdown", note: "VWAP Reclaim marks a close crossing the session volume-weighted average. The marker appears on the following candle." },
  orb: { badge: "15m ORB", long: "+2 ORB", short: "−2 ORB", longLegend: "+2 opening-range break", shortLegend: "−2 opening-range break", note: "15m ORB uses each session's first 15 minutes as its opening range, then marks the first close beyond its high or low on the following candle." },
  ema: { badge: "EMA 9/21 Cross", long: "+2 EMA", short: "−2 EMA", longLegend: "+2 bullish EMA cross", shortLegend: "−2 bearish EMA cross", note: "EMA 9/21 Cross marks the fast average crossing the slow average within a session. The marker appears on the following candle." },
  macd: { badge: "MACD Cross", long: "+2 MACD", short: "−2 MACD", longLegend: "+2 bullish MACD cross", shortLegend: "−2 bearish MACD cross", note: "MACD Cross uses the 12 and 26-period EMAs and a 9-period signal average. The marker appears on the following candle." },
};
const REFRESH_SECONDS = REFRESH_MS / 1000;
// Bars shown by a reset-to-default view, matching a fresh intraday load.
const DEFAULT_VISIBLE_BARS = 390;
const FUND_DETAILS = {
  SPY: { name: "State Street SPDR S&P 500 ETF Trust", exchange: "NYSE Arca" },
  QQQ: { name: "Invesco QQQ Trust", exchange: "Nasdaq" },
  SOXX: { name: "iShares Semiconductor ETF", exchange: "Nasdaq" },
  DRAM: { name: "Themes US Memory & Storage ETF", exchange: "Nasdaq" },
};
// Driven by the shared GEX list so the buttons and the API always agree on
// which tickers exist.
const FUNDS = Object.fromEntries(
  GEX_SYMBOLS.map((ticker) => [ticker, FUND_DETAILS[ticker] || { name: ticker, exchange: "Nasdaq" }]),
);
const CHART_LEFT = 10;
const PRICE_AXIS_WIDTH = 62;
const PRICE_PANE_RATIO = 0.8;

const CandleIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 3v4m0 10v4M4.5 7h5v10h-5zM17 3v7m0 8v3m-2.5-11h5v8h-5z" />
  </svg>
);

const LineIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="m3 17 5-6 4 3 8-9" />
  </svg>
);

const PanIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3v18m0-18-3 3m3-3 3 3m-3 15-3-3m3 3 3-3M3 12h18M3 12l3-3m-3 3 3 3m15-3-3-3m3 3-3 3" />
  </svg>
);

const MeasureIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="m5 17 12-12 2 2L7 19H5v-2Zm7-7 2 2m-5 1 2 2" />
  </svg>
);

const TrendlineIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 18 19 6M5 18h.01M19 6h.01" />
  </svg>
);

const HeatmapIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
  </svg>
);

function formatPrice(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "—";
}

function formatChange(value) {
  if (!Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function formatCountdown(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatAxisTime(timestamp, range) {
  const date = new Date(timestamp * 1000);
  return range === "1d"
    ? date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatIntradayTime(timestamp) {
  return new Date(timestamp * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function adaptiveTimeInterval(duration, plotWidth) {
  const targetTicks = Math.max(4, Math.floor(plotWidth / 92));
  const roughInterval = duration / targetTicks;
  const intervals = [60, 120, 300, 600, 900, 1800, 3600, 7200, 14400, 21600, 43200, 86400];
  return intervals.find((interval) => interval >= roughInterval) || intervals[intervals.length - 1];
}

function robustVolumeCeiling(volumes) {
  const sorted = volumes.filter((volume) => volume > 0).sort((a, b) => a - b);
  if (!sorted.length) return 1;
  // A high visible-range percentile keeps genuine busy periods prominent but
  // prevents a single opening/closing auction from flattening every other bar.
  const percentile = sorted[Math.floor((sorted.length - 1) * 0.92)];
  const median = sorted[Math.floor((sorted.length - 1) * 0.5)];
  return Math.max(1, percentile, median * 2.25);
}

function scaledVolumeRatio(volume, ceiling) {
  if (!(volume > 0)) return 0;
  const ratio = volume / ceiling;
  // Preserve more of the small-to-medium volume separation while still
  // lifting quiet bars enough to remain legible against the dark chart.
  if (ratio <= 1) return Math.pow(ratio, 0.9);
  // Compress extreme outliers into the top 18% of the volume pane rather than
  // letting them redefine the scale for hundreds of ordinary candles.
  return Math.min(1.18, 1 + Math.log1p(ratio - 1) * 0.075);
}

function nicePriceStep(span, targetIntervals) {
  const roughStep = Math.max(span / Math.max(targetIntervals, 1), Number.EPSILON);
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return factor * magnitude;
}

function mergeLatestPoints(existing, latest) {
  if (!existing.length || !latest.length) return latest;
  const replacementStart = latest[0].t;
  return [...existing.filter((point) => point.t < replacementStart), ...latest];
}

function canvasColors() {
  const style = getComputedStyle(document.documentElement);
  const read = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
  return {
    panel: read("--panel", "#101318"),
    text: read("--text", "#f1f4f8"),
    soft: read("--text-soft", "#8d96a5"),
    grid: read("--grid", "rgba(130, 145, 165, .14)"),
    border: read("--border", "#27303b"),
    accent: read("--accent", "#4f8cff"),
  };
}

function drawRoundedLabel(ctx, x, y, width, height, fill) {
  const radius = 4;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.fillStyle = fill;
  ctx.fill();
}

function MarketCanvas({ symbol, points, range, mode, signals, signalLabels, rsi14, rsiAverage, showRsi, movingAverages, trendlines, onTrendlinesChange, dataStartIndex, gexLevels, gexStyle, hoverIndex, onHoverIndex, priceScale, onPriceScaleChange, priceOffset, onPriceOffsetChange, viewportStart, maxViewportStart, onViewportStartChange, onResetView, xShiftBars, visibleSpan, onZoom, interactionMode, currentPrice, secondsToRefresh }) {
  const canvasRef = useRef(null);
  const scaleDragRef = useRef(null);
  const timeDragRef = useRef(null);
  const panDragRef = useRef(null);
  const touchesRef = useRef(new Map());
  const pinchRef = useRef(null);
  const measureDragRef = useRef(null);
  const trendlineDragRef = useRef(null);
  const priceRangeRef = useRef({ span: 1, pixels: 1 });
  const lastExtentRef = useRef({ min: 0, max: 1 });
  const manualExtentRef = useRef(null);
  const [measurement, setMeasurement] = useState(null);
  const [draftTrendline, setDraftTrendline] = useState(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const colors = canvasColors();
    const width = rect.width;
    const height = rect.height;
    const left = CHART_LEFT;
    const right = PRICE_AXIS_WIDTH;
    const plotWidth = width - left - right;
    const priceTop = 16;
    const divider = showRsi ? Math.round(height * PRICE_PANE_RATIO) : height;
    const priceBottom = showRsi ? divider - 13 : height - 30;
    const rsiTop = divider + 16;
    const rsiBottom = height - 30;
    const chartBottom = showRsi ? rsiBottom : priceBottom;
    const closes = points.map((point) => point.c);
    const lows = points.map((point) => point.l ?? point.c);
    const highs = points.map((point) => point.h ?? point.c);
    const pointCadence = points.length > 1 ? Math.max(60, points[1].t - points[0].t) : 60;
    const relevantGex = points.length
      ? gexLevels.filter((level) => level.t >= points[0].t - pointCadence && level.t <= points[points.length - 1].t + pointCadence)
      : [];
    const gexStrikes = relevantGex.flatMap((level) => [level.strike, level.secondStrike]).filter(Number.isFinite);
    const averageValues = movingAverages.flatMap((line) => line.values).filter(Number.isFinite);
    // Panning the series entirely off screen leaves nothing to autofit, so the
    // last fitted extent is reused and the empty chart keeps its axis.
    const extentValues = [...lows, ...highs, ...gexStrikes, ...averageValues].filter(Number.isFinite);
    const rawMin = manualExtentRef.current?.min ?? (extentValues.length ? Math.min(...extentValues) : lastExtentRef.current.min);
    const rawMax = manualExtentRef.current?.max ?? (extentValues.length ? Math.max(...extentValues) : lastExtentRef.current.max);
    if (extentValues.length) lastExtentRef.current = { min: rawMin, max: rawMax };
    const rawSpan = Math.max(rawMax - rawMin, 0.5);
    const centerPrice = (rawMin + rawMax) / 2 + priceOffset;
    const scaledSpan = (rawSpan + Math.max(rawSpan * 0.14, 0.5)) * priceScale;
    const maxTicks = Math.max(4, Math.floor((priceBottom - priceTop) / 48));
    const tickStep = nicePriceStep(scaledSpan, maxTicks);
    let minPrice = Math.floor((centerPrice - scaledSpan / 2) / tickStep) * tickStep;
    let maxPrice = Math.ceil((centerPrice + scaledSpan / 2) / tickStep) * tickStep;
    if (maxPrice - minPrice < tickStep) maxPrice = minPrice + tickStep;
    const xAt = (index) => left + ((index + xShiftBars) / Math.max(visibleSpan - 1, 1)) * plotWidth;
    const priceY = (value) => priceTop + ((maxPrice - value) / (maxPrice - minPrice || 1)) * (priceBottom - priceTop);
    const rsiY = (value) => rsiTop + ((100 - value) / 100) * (rsiBottom - rsiTop);
    priceRangeRef.current = { span: maxPrice - minPrice, pixels: Math.max(1, priceBottom - priceTop), min: minPrice, max: maxPrice, top: priceTop };

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#030405";
    ctx.fillRect(0, 0, width, height);
    ctx.font = "11px var(--font-mono), monospace";
    ctx.lineWidth = 1;

    // Adapt vertical time rules to the visible density. Zooming in reveals
    // finer minute marks; zooming out progressively moves to hours and days.
    const timeTicks = [];
    const candleSteps = points.slice(1).map((point, index) => point.t - points[index].t).filter((step) => step > 0 && step <= 7200).sort((a, b) => a - b);
    const cadence = candleSteps[Math.floor(candleSteps.length / 2)] || 60;
    const visibleTradingDuration = cadence * Math.max(1, points.length - 1);
    const timeInterval = adaptiveTimeInterval(visibleTradingDuration, plotWidth);
    let priorBucket = null;
    let priorSession = null;
    points.forEach((point, index) => {
      const date = new Date(point.t * 1000);
      const bucket = Math.floor(point.t / timeInterval);
      const session = date.toLocaleDateString("en-CA");
      const newSession = priorSession !== null && session !== priorSession;
      priorSession = session;
      if (bucket === priorBucket && !newSession) return;
      priorBucket = bucket;
      const x = xAt(index);
      if (x < left || x > width - right + 8) return;
      timeTicks.push({ x, t: point.t, newSession });
      ctx.strokeStyle = "rgba(137, 145, 157, .13)";
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, priceTop);
      ctx.lineTo(Math.round(x) + 0.5, chartBottom);
      ctx.stroke();
    });

    // Choose clean, range-aware intervals instead of forcing half dollars.
    const firstTick = Math.ceil(minPrice / tickStep) * tickStep;
    for (let value = firstTick; value <= maxPrice + 0.001; value += tickStep) {
      const y = priceY(value);
      ctx.strokeStyle = colors.grid;
      ctx.beginPath();
      ctx.moveTo(left, Math.round(y) + 0.5);
      ctx.lineTo(width - right + 8, Math.round(y) + 0.5);
      ctx.stroke();
      ctx.fillStyle = colors.soft;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(value.toFixed(2), width - right + 14, y);
    }

    // Keep freely panned price content inside the plotting pane.
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, priceTop, plotWidth + 8, priceBottom - priceTop);
    ctx.clip();

    const volumeCeiling = robustVolumeCeiling(points.map((point) => point.v || 0));
    const volumePaneHeight = Math.min(82, (priceBottom - priceTop) * 0.17);
    const barSlot = plotWidth / Math.max(visibleSpan, 1);
    const candleWidth = Math.max(1, Math.min(7, barSlot * 0.7));

    ctx.fillStyle = colors.soft;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.font = "600 10px var(--font-mono), monospace";
    ctx.fillText("Vol", left + 2, priceBottom - 3);

    // Volume is anchored to the bottom of the price pane.
    points.forEach((point, index) => {
      const x = xAt(index);
      const volumeHeight = scaledVolumeRatio(point.v || 0, volumeCeiling) * volumePaneHeight;
      ctx.fillStyle = point.c >= point.o ? "rgba(8, 153, 129, .58)" : "rgba(199, 57, 62, .58)";
      ctx.fillRect(x - candleWidth / 2, priceBottom - volumeHeight, Math.max(1, candleWidth), Math.max(point.v ? 1 : 0, volumeHeight));
    });

    if (mode === "candle") {
      points.forEach((point, index) => {
        const x = xAt(index);
        const up = point.c >= point.o;
        const color = up ? "#20c7a5" : "#ef5b61";
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, priceY(point.h));
        ctx.lineTo(Math.round(x) + 0.5, priceY(point.l));
        ctx.stroke();
        const bodyTop = priceY(Math.max(point.o, point.c));
        const bodyBottom = priceY(Math.min(point.o, point.c));
        ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, Math.max(1, bodyBottom - bodyTop));
      });
    } else {
      const gradient = ctx.createLinearGradient(0, priceTop, 0, priceBottom);
      gradient.addColorStop(0, "rgba(67, 151, 255, .24)");
      gradient.addColorStop(1, "rgba(67, 151, 255, 0)");
      ctx.beginPath();
      closes.forEach((value, index) => {
        const x = xAt(index);
        const y = priceY(value);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.lineTo(xAt(points.length - 1), priceBottom);
      ctx.lineTo(xAt(0), priceBottom);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.beginPath();
      closes.forEach((value, index) => {
        const x = xAt(index);
        const y = priceY(value);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = "#4397ff";
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }

    // Technical overlays use the same visible-bar coordinates as candles.
    // EMAs are dashed so an EMA and SMA of the same period remain distinct
    // even when their values nearly overlap.
    movingAverages.forEach((line) => {
      ctx.beginPath();
      let drawing = false;
      line.values.forEach((value, index) => {
        if (!Number.isFinite(value)) {
          drawing = false;
          return;
        }
        const x = xAt(index);
        const y = priceY(value);
        if (!drawing) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        drawing = true;
      });
      ctx.strokeStyle = line.color;
      ctx.lineWidth = 1.35;
      ctx.globalAlpha = 0.88;
      ctx.setLineDash(line.dashed ? [5, 3] : []);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    });

    // Completed drawings live in global bar coordinates so panning and
    // zooming do not move their anchors away from the candles the user chose.
    const drawTrendline = (line, draft = false) => {
      if (!line?.start || !line?.end) return;
      const x0 = xAt(line.start.index - dataStartIndex);
      const x1 = xAt(line.end.index - dataStartIndex);
      const y0 = priceY(line.start.price);
      const y1 = priceY(line.end.price);
      ctx.strokeStyle = draft ? "rgba(241, 245, 249, .62)" : "#f1f5f9";
      ctx.lineWidth = draft ? 1.2 : 1.6;
      ctx.setLineDash(draft ? [5, 4] : []);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.setLineDash([]);
      if (!draft) {
        ctx.fillStyle = "#f1f5f9";
        for (const [x, y] of [[x0, y0], [x1, y1]]) {
          ctx.beginPath();
          ctx.arc(x, y, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };
    trendlines.forEach((line) => drawTrendline(line));
    drawTrendline(draftTrendline, true);

    // Draw the two strongest 0DTE strikes from shared, time-stamped snapshots.
    drawGexOverlay(ctx, gexOverlayRuns(points, relevantGex, pointCadence), {
      style: gexStyle, xAt, priceY, left, right: width - right,
      candleWidth, slot: barSlot,
    });

    // Reuse the stock quote chart's visible-range high/low callouts.
    const plotted = points
      .map((point, index) => ({ point, index, x: xAt(index) }))
      .filter((item) => item.x >= left && item.x <= width - right + 8);
    const highMark = plotted.reduce((best, item) => (!best || item.point.h > best.point.h ? item : best), null);
    const lowMark = plotted.reduce((best, item) => (!best || item.point.l < best.point.l ? item : best), null);
    const drawRangeCallout = (mark, value, above, prefix) => {
      if (!mark) return;
      const x = mark.x;
      const y = priceY(value);
      const labelY = y + (above ? -10 : 10);
      const toLeft = x > left + plotWidth * 0.76;
      const direction = toLeft ? -1 : 1;
      ctx.strokeStyle = "#8d96a5";
      ctx.fillStyle = "#a8afb9";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, labelY);
      ctx.lineTo(x + direction * 8, labelY);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "600 10px var(--font-mono), monospace";
      ctx.textAlign = toLeft ? "right" : "left";
      ctx.textBaseline = "middle";
      ctx.fillText(`${prefix} ${value.toFixed(2)}`, x + direction * 12, labelY);
    };
    drawRangeCallout(highMark, highMark?.point.h, true, "H");
    if (lowMark?.index !== highMark?.index || lowMark?.point.l !== highMark?.point.h) {
      drawRangeCallout(lowMark, lowMark?.point.l, false, "L");
    }

    // Alternating TradingView-style markers: exits above price, entries below.
    signals.forEach((signal, index) => {
      if (!signal) return;
      const x = xAt(index);
      const isEntry = signal === 2;
      // TradingView's market-order marker sits at the broker emulator's fill
      // price: the next candle's open, not that candle's eventual high/low.
      const anchor = priceY(points[index].o);
      const direction = isEntry ? 1 : -1;
      const tipY = anchor;
      const baseY = anchor + direction * 20;
      ctx.fillStyle = isEntry ? "#2962ff" : "#f23645";
      ctx.beginPath();
      ctx.moveTo(x, tipY);
      ctx.lineTo(x - 8, baseY);
      ctx.lineTo(x + 8, baseY);
      ctx.closePath();
      ctx.fill();
      ctx.textAlign = "center";
      ctx.font = "700 12px var(--font-mono), monospace";
      ctx.fillStyle = "#c8cdd5";
      if (isEntry) {
        ctx.textBaseline = "top";
        ctx.fillText(signalLabels.long, x, baseY + 5);
      } else {
        ctx.textBaseline = "bottom";
        ctx.fillText(signalLabels.short, x, baseY - 20);
      }
    });

    // The same drag-range readout used by the site's stock quote charts.
    if (measurement && measurement.start !== measurement.end) {
      const i0 = Math.max(0, Math.min(measurement.start, measurement.end));
      const i1 = Math.min(points.length - 1, Math.max(measurement.start, measurement.end));
      const startPoint = points[i0];
      const endPoint = points[i1];
      if (startPoint && endPoint) {
        const x0 = xAt(i0);
        const x1 = xAt(i1);
        const delta = endPoint.c - startPoint.c;
        const pct = startPoint.c ? (delta / Math.abs(startPoint.c)) * 100 : 0;
        const moveColor = delta >= 0 ? "#30cc5a" : "#f63538";
        ctx.fillStyle = "rgba(125, 145, 185, .14)";
        ctx.fillRect(x0, priceTop, x1 - x0, priceBottom - priceTop);
        ctx.strokeStyle = "rgba(156, 166, 182, .75)";
        ctx.setLineDash([4, 3]);
        [x0, x1].forEach((x) => {
          ctx.beginPath();
          ctx.moveTo(x, priceTop);
          ctx.lineTo(x, priceBottom);
          ctx.stroke();
        });
        ctx.setLineDash([]);
        [i0, i1].forEach((index) => {
          ctx.beginPath();
          ctx.fillStyle = moveColor;
          ctx.arc(xAt(index), priceY(points[index].c), 4, 0, Math.PI * 2);
          ctx.fill();
        });

        const valueText = `${delta >= 0 ? "▲ +" : "▼ −"}$${Math.abs(delta).toFixed(2)} (${delta >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(2)}%)`;
        const spanText = `${formatIntradayTime(startPoint.t)} – ${formatIntradayTime(endPoint.t)}`;
        ctx.font = "700 11px var(--font-ui), sans-serif";
        const boxWidth = Math.max(ctx.measureText(valueText).width, ctx.measureText(spanText).width) + 18;
        const boxX = Math.max(left + 3, Math.min((x0 + x1 - boxWidth) / 2, width - right - boxWidth + 5));
        const boxY = priceTop + 7;
        drawRoundedLabel(ctx, boxX, boxY, boxWidth, 42, "rgba(12, 14, 18, .96)");
        ctx.strokeStyle = "rgba(139, 147, 163, .4)";
        ctx.strokeRect(boxX + .5, boxY + .5, boxWidth - 1, 41);
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillStyle = moveColor;
        ctx.fillText(valueText, boxX + 9, boxY + 7);
        ctx.font = "500 10px var(--font-ui), sans-serif";
        ctx.fillStyle = "#8d96a5";
        ctx.fillText(spanText, boxX + 9, boxY + 24);
      }
    }
    ctx.restore();

    // Latest price guide and label.
    const latestValue = Number.isFinite(currentPrice) ? currentPrice : points[points.length - 1]?.c;
    if (Number.isFinite(latestValue)) {
      const latestY = priceY(latestValue);
      const badgeY = Math.max(priceTop + 18, Math.min(priceBottom - 18, latestY));
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = "rgba(32, 199, 165, .65)";
      ctx.beginPath();
      ctx.moveTo(left, badgeY);
      ctx.lineTo(width - right + 8, badgeY);
      ctx.stroke();
      ctx.setLineDash([]);
      drawRoundedLabel(ctx, width - right + 9, badgeY - 17, 55, 34, "#169b82");
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "700 10px var(--font-mono), monospace";
      ctx.fillText(latestValue.toFixed(2), width - right + 36.5, badgeY - 6);
      ctx.font = "700 9px var(--font-mono), monospace";
      ctx.fillText(formatCountdown(secondsToRefresh), width - right + 36.5, badgeY + 8);
    }

    if (showRsi) {
      // TradingView's built-in RSI defaults: RSI(14) on close, SMA(14),
      // 70/50/30 bands, purple background, and zone gradient fills.
      ctx.strokeStyle = colors.border;
      ctx.beginPath();
      ctx.moveTo(0, divider + 0.5);
      ctx.lineTo(width, divider + 0.5);
      ctx.stroke();
      ctx.fillStyle = "rgba(126, 87, 194, .1)";
      ctx.fillRect(left, rsiY(RSI_LE_OVERBOUGHT), plotWidth + 8, rsiY(RSI_LE_OVERSOLD) - rsiY(RSI_LE_OVERBOUGHT));
      [RSI_LE_OVERBOUGHT, 50, RSI_LE_OVERSOLD].forEach((value) => {
        const y = rsiY(value);
        ctx.setLineDash(value === 50 ? [2, 4] : [5, 5]);
        ctx.strokeStyle = value === 50 ? "rgba(120, 123, 134, .5)" : "#787b86";
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(width - right + 8, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = colors.soft;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.font = "11px var(--font-mono), monospace";
        ctx.fillText(String(value), width - right + 14, y);
      });

      ctx.save();
      ctx.beginPath();
      ctx.rect(left, rsiTop, plotWidth + 8, rsiBottom - rsiTop);
      ctx.clip();
      const fillRsiZone = (values, clipTop, clipBottom, topColor, bottomColor) => {
        const finite = values.flatMap((value, index) => Number.isFinite(value) ? [{ value, index }] : []);
        if (finite.length < 2) return;
        ctx.save();
        ctx.beginPath();
        ctx.rect(left, rsiY(clipTop), plotWidth + 8, rsiY(clipBottom) - rsiY(clipTop));
        ctx.clip();
        ctx.beginPath();
        finite.forEach(({ value, index }, pointIndex) => {
          const x = xAt(index);
          const y = rsiY(value);
          if (pointIndex === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.lineTo(xAt(finite.at(-1).index), rsiY(50));
        ctx.lineTo(xAt(finite[0].index), rsiY(50));
        ctx.closePath();
        const gradient = ctx.createLinearGradient(0, rsiY(clipTop), 0, rsiY(clipBottom));
        gradient.addColorStop(0, topColor);
        gradient.addColorStop(1, bottomColor);
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.restore();
      };
      fillRsiZone(rsi14, 100, RSI_LE_OVERBOUGHT, "rgba(76, 175, 80, .5)", "rgba(76, 175, 80, 0)");
      fillRsiZone(rsi14, RSI_LE_OVERSOLD, 0, "rgba(242, 54, 69, 0)", "rgba(242, 54, 69, .5)");
      const drawRsiLine = (values, color, lineWidth) => {
        ctx.beginPath();
        let drawing = false;
        values.forEach((value, index) => {
          if (value == null) {
            drawing = false;
            return;
          }
          const x = xAt(index);
          const y = rsiY(value);
          if (!drawing) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          drawing = true;
        });
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      };
      drawRsiLine(rsi14, "#7e57c2", 1.25);
      drawRsiLine(rsiAverage, "#fdd835", 1.35);
      ctx.restore();
    }

    // Labels follow those adaptive rules, with session boundaries called out
    // by date on multi-day charts.
    let lastTimeLabelX = -Infinity;
    timeTicks.forEach(({ x, t, newSession }) => {
      if (x - lastTimeLabelX < 42) return;
      ctx.fillStyle = colors.soft;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.font = "9px var(--font-mono), monospace";
      const label = range !== "1d" && newSession
        ? new Date(t * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })
        : formatIntradayTime(t);
      ctx.fillText(label, x, height - 5);
      lastTimeLabelX = x;
    });

    if (interactionMode === "pan" && hoverIndex != null && points[hoverIndex]) {
      const x = xAt(hoverIndex);
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = "rgba(156, 166, 182, .65)";
      ctx.beginPath();
      ctx.moveTo(x, priceTop);
      ctx.lineTo(x, chartBottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = colors.panel;
      ctx.strokeStyle = colors.border;
      ctx.beginPath();
      ctx.arc(x, priceY(points[hoverIndex].c), 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      const priceText = `$${points[hoverIndex].c.toFixed(2)}`;
      const whenText = formatAxisTime(points[hoverIndex].t, range);
      const hoverGex = [...relevantGex].reverse().find((level) => level.t <= points[hoverIndex].t + pointCadence);
      const gexText = hoverGex ? `0DTE max Net GEX · ${hoverGex.strike}` : null;
      ctx.font = "700 11px var(--font-ui), sans-serif";
      const tipWidth = Math.max(ctx.measureText(priceText).width, ctx.measureText(whenText).width, gexText ? ctx.measureText(gexText).width : 0) + 18;
      const tipX = Math.max(left + 4, Math.min(x + 10, width - right - tipWidth + 4));
      const pointY = priceY(points[hoverIndex].c);
      const tipHeight = gexText ? 54 : 40;
      const tipY = Math.max(priceTop + 4, Math.min(pointY - tipHeight - 8, priceBottom - tipHeight - 5));
      drawRoundedLabel(ctx, tipX, tipY, tipWidth, tipHeight, "rgba(12, 14, 18, .96)");
      ctx.fillStyle = "#f4f6f8";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(priceText, tipX + 9, tipY + 6);
      ctx.font = "500 9px var(--font-ui), sans-serif";
      ctx.fillStyle = "#8d96a5";
      ctx.fillText(whenText, tipX + 9, tipY + 23);
      if (gexText) {
        ctx.fillStyle = "#f5cd37";
        ctx.fillText(gexText, tipX + 9, tipY + 37);
      }
    }

    // Delineate the draggable right-side price scale.
    ctx.strokeStyle = "rgba(120, 128, 142, .18)";
    ctx.beginPath();
    ctx.moveTo(width - right + 8.5, priceTop);
    ctx.lineTo(width - right + 8.5, priceBottom);
    ctx.stroke();
  }, [currentPrice, dataStartIndex, draftTrendline, gexLevels, gexStyle, hoverIndex, interactionMode, measurement, mode, movingAverages, points, priceOffset, priceScale, range, rsi14, rsiAverage, secondsToRefresh, showRsi, signalLabels, signals, trendlines, visibleSpan, xShiftBars]);

  useEffect(() => {
    draw();
    const observer = new ResizeObserver(draw);
    const themeObserver = new MutationObserver(draw);
    if (canvasRef.current) observer.observe(canvasRef.current);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style"] });
    return () => {
      observer.disconnect();
      themeObserver.disconnect();
    };
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleWheel = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = canvas.getBoundingClientRect();
      const onPriceAxis = event.clientX - rect.left >= rect.width - PRICE_AXIS_WIDTH
        && event.clientY - rect.top <= priceRangeRef.current.top + priceRangeRef.current.pixels;
      const deltaY = wheelPixels(event.deltaY, event.deltaMode, rect.height);
      const deltaX = wheelPixels(event.deltaX, event.deltaMode, rect.width);
      if (onPriceAxis) {
        manualExtentRef.current ??= { ...lastExtentRef.current };
        onPriceScaleChange(Math.max(0.01, Math.min(100, priceScale * Math.exp(deltaY * 0.002))));
        return;
      }
      const anchor = Math.max(0, Math.min(1, (event.clientX - rect.left - CHART_LEFT) / Math.max(1, rect.width - CHART_LEFT - PRICE_AXIS_WIDTH)));
      if (!event.ctrlKey && !event.metaKey && (event.shiftKey || Math.abs(deltaX) > Math.abs(deltaY))) {
        const pixels = event.shiftKey ? (deltaY || deltaX) : deltaX;
        onViewportStartChange((start) => start + pixels * Math.max(visibleSpan - 1, 1) / Math.max(1, rect.width - CHART_LEFT - PRICE_AXIS_WIDTH));
      } else {
        onZoom(deltaY, event.ctrlKey || event.metaKey ? anchor : 1);
      }
    };
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [onPriceScaleChange, onViewportStartChange, onZoom, priceScale, visibleSpan]);

  function pointerToIndex(event) {
    const canvas = canvasRef.current;
    if (!canvas || !points.length) return null;
    const rect = canvas.getBoundingClientRect();
    const left = CHART_LEFT;
    const right = PRICE_AXIS_WIDTH;
    const ratio = (event.clientX - rect.left - left) / (rect.width - left - right);
    const index = Math.round(ratio * Math.max(visibleSpan - 1, 1) - xShiftBars);
    return index >= 0 && index < points.length ? index : null;
  }

  function pointerToPrice(event) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const rangeState = priceRangeRef.current;
    const y = Math.max(rangeState.top, Math.min(rangeState.top + rangeState.pixels, event.clientY - rect.top));
    return rangeState.max - ((y - rangeState.top) / rangeState.pixels) * rangeState.span;
  }

  function onPointerDown(event) {
    const canvas = canvasRef.current;
    if (!canvas || event.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    const onPriceAxis = event.clientX - rect.left >= rect.width - PRICE_AXIS_WIDTH
      && event.clientY - rect.top <= priceRangeRef.current.top + priceRangeRef.current.pixels;
    event.preventDefault();
    if (event.pointerType === "touch") {
      touchesRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchesRef.current.size === 2) {
        const [a, b] = [...touchesRef.current.values()];
        pinchRef.current = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
        panDragRef.current = null;
        scaleDragRef.current = null;
        timeDragRef.current = null;
        measureDragRef.current = null;
        trendlineDragRef.current = null;
        setDraftTrendline(null);
        canvas.setPointerCapture(event.pointerId);
        return;
      }
    }
    if (event.clientY - rect.top >= rect.height - 30 && !onPriceAxis) {
      timeDragRef.current = { lastX: event.clientX };
      canvas.style.cursor = "ew-resize";
    } else if (onPriceAxis) {
      manualExtentRef.current ??= { ...lastExtentRef.current };
      scaleDragRef.current = { startY: event.clientY, startScale: priceScale };
      canvas.style.cursor = "ns-resize";
    } else if (interactionMode === "measure") {
      const index = pointerToIndex(event);
      if (index == null) return;
      measureDragRef.current = { start: index };
      setMeasurement({ start: index, end: index });
      canvas.style.cursor = "crosshair";
    } else if (interactionMode === "trendline") {
      if (event.clientY - rect.top > priceRangeRef.current.top + priceRangeRef.current.pixels) return;
      const index = pointerToIndex(event);
      const price = pointerToPrice(event);
      if (index == null || price == null) return;
      const anchor = { index: dataStartIndex + index, price };
      trendlineDragRef.current = { start: anchor, end: anchor };
      setDraftTrendline({ start: anchor, end: anchor });
      canvas.style.cursor = "crosshair";
    } else {
      manualExtentRef.current ??= { ...lastExtentRef.current };
      panDragRef.current = { dollarsPerPixel: priceRangeRef.current.span / priceRangeRef.current.pixels, startX: event.clientX, startY: event.clientY, startViewport: viewportStart, startPriceOffset: priceOffset };
      canvas.style.cursor = "grabbing";
    }
    canvas.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (touchesRef.current.has(event.pointerId)) {
      touchesRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinchRef.current != null && touchesRef.current.size === 2) {
        const [a, b] = [...touchesRef.current.values()];
        const distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
        const anchor = Math.max(0, Math.min(1, ((a.x + b.x) / 2 - rect.left - CHART_LEFT) / (rect.width - CHART_LEFT - PRICE_AXIS_WIDTH)));
        onZoom(-Math.log(distance / pinchRef.current) / 0.002, anchor);
        pinchRef.current = distance;
        return;
      }
    }
    if (timeDragRef.current) {
      onZoom((timeDragRef.current.lastX - event.clientX) * 2, 1);
      timeDragRef.current.lastX = event.clientX;
      return;
    }
    if (scaleDragRef.current) {
      const delta = event.clientY - scaleDragRef.current.startY;
      const next = Math.max(0.35, Math.min(5, scaleDragRef.current.startScale * Math.exp(delta * 0.008)));
      onPriceScaleChange(next);
      return;
    }
    if (panDragRef.current) {
      const plotWidth = Math.max(1, rect.width - CHART_LEFT - PRICE_AXIS_WIDTH);
      const pixelsPerBar = plotWidth / Math.max(visibleSpan - 1, 1);
      const bars = (event.clientX - panDragRef.current.startX) / pixelsPerBar;
      const dollarsPerPixel = panDragRef.current.dollarsPerPixel;
      onViewportStartChange(panDragRef.current.startViewport - bars);
      onPriceOffsetChange(panDragRef.current.startPriceOffset + (event.clientY - panDragRef.current.startY) * dollarsPerPixel);
      return;
    }
    if (measureDragRef.current) {
      const index = pointerToIndex(event);
      if (index != null) setMeasurement({ start: measureDragRef.current.start, end: index });
      return;
    }
    if (trendlineDragRef.current) {
      const index = pointerToIndex(event);
      const price = pointerToPrice(event);
      if (index != null && price != null) {
        const next = { ...trendlineDragRef.current, end: { index: dataStartIndex + index, price } };
        trendlineDragRef.current = next;
        setDraftTrendline(next);
      }
      return;
    }
    const onPriceAxis = event.clientX - rect.left >= rect.width - PRICE_AXIS_WIDTH
      && event.clientY - rect.top <= priceRangeRef.current.top + priceRangeRef.current.pixels;
    const onTimeAxis = event.clientY - rect.top >= rect.height - 30;
    canvas.style.cursor = onPriceAxis ? "ns-resize" : onTimeAxis ? "ew-resize" : interactionMode === "pan" ? "grab" : "crosshair";
    onHoverIndex(pointerToIndex(event));
  }

  function stopDrag(event) {
    touchesRef.current.delete(event.pointerId);
    if (pinchRef.current != null) {
      pinchRef.current = null;
      if (canvasRef.current?.hasPointerCapture(event.pointerId)) canvasRef.current.releasePointerCapture(event.pointerId);
      return;
    }
    if (!timeDragRef.current && !scaleDragRef.current && !panDragRef.current && !measureDragRef.current && !trendlineDragRef.current) return;
    const completedTrendline = trendlineDragRef.current;
    scaleDragRef.current = null;
    timeDragRef.current = null;
    panDragRef.current = null;
    measureDragRef.current = null;
    trendlineDragRef.current = null;
    setDraftTrendline(null);
    if (completedTrendline && (
      completedTrendline.start.index !== completedTrendline.end.index
      || Math.abs(completedTrendline.start.price - completedTrendline.end.price) >= 0.01
    )) {
      onTrendlinesChange((currentTrendlines) => [
        ...currentTrendlines,
        completedTrendline,
      ]);
    }
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (canvas) canvas.style.cursor = interactionMode === "pan" ? "grab" : "crosshair";
  }

  return (
    <canvas
      ref={canvasRef}
      className="rle-canvas"
      data-price-scale={priceScale.toFixed(3)}
      data-price-offset={priceOffset.toFixed(3)}
      data-viewport-start={viewportStart.toFixed(3)}
      data-max-viewport-start={maxViewportStart.toFixed(3)}
      data-visible-span={visibleSpan.toFixed(3)}
      data-interaction-mode={interactionMode}
      aria-label={`Interactive ${symbol} ${mode === "candle" ? "candlestick" : "line"} chart with ${signalLabels.badge} signals${showRsi ? ", RSI 14" : ""}, GEX levels, technical overlays, and drawing tools`}
      title={interactionMode === "pan" ? "Drag freely in any direction; use the wheel to zoom" : interactionMode === "measure" ? "Drag across the chart to measure a price move" : "Drag between two points to draw a trendline"}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      onPointerLeave={() => { if (!timeDragRef.current && !scaleDragRef.current && !panDragRef.current && !measureDragRef.current && !trendlineDragRef.current) onHoverIndex(null); }}
      onDoubleClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        manualExtentRef.current = null;
        if (event.clientX - rect.left >= rect.width - PRICE_AXIS_WIDTH) { onPriceOffsetChange(0); onPriceScaleChange(1); }
        else {
          onResetView();
          onPriceOffsetChange(0);
          onPriceScaleChange(1);
          setMeasurement(null);
        }
      }}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const step = event.key === "ArrowRight" ? 1 : -1;
        onHoverIndex(Math.max(0, Math.min(points.length - 1, (hoverIndex ?? points.length - 1) + step)));
      }}
    />
  );
}

export default function RsiLeWorkspace() {
  const [symbol, setSymbol] = useState("SPY");
  const [range, setRange] = useState("1d");
  const [mode, setMode] = useState("candle");
  const [points, setPoints] = useState([]);
  const [warmup, setWarmup] = useState([]);
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [hoverIndex, setHoverIndex] = useState(null);
  const [priceScale, setPriceScale] = useState(1);
  const [priceOffset, setPriceOffset] = useState(0);
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const [gexOpen, setGexOpen] = useState(false);
  const [gexHistory, setGexHistory] = useState([]);
  const [gexStyle, setGexStyle] = useState("bands");
  const [signalMode, setSignalMode] = useState("rsi");
  const [technicals, setTechnicals] = useState({ rsi: true });
  const [trendlines, setTrendlines] = useState([]);
  const [interactionMode, setInteractionMode] = useState("pan");
  const [viewportStart, setViewportStart] = useState(0);
  const [visibleCount, setVisibleCount] = useState(0);
  const [secondsToRefresh, setSecondsToRefresh] = useState(REFRESH_SECONDS);
  const viewportRef = useRef({ start: 0, count: 0, total: 0 });
  const pointsRef = useRef([]);

  const load = useCallback(async (signal, quiet = false) => {
    const requestChart = async (includeHistory) => {
      const suffix = includeHistory ? "&history=1" : "";
      const response = await fetch(`/api/stock-chart?symbol=${symbol}&range=${range}${suffix}`, { signal });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || `${symbol} data is unavailable`);
      return json;
    };

    // The small visible-range request goes out FIRST and is awaited on its own.
    // Both requests share the browser's per-origin connection pool, and the
    // history one asks Yahoo for five days of minute candles against the quick
    // one's single day - so firing history first put the request that paints
    // the chart behind the request that merely extends it, and the page sat
    // empty until the slow one returned. History is started only once the
    // quick response is in hand; it still upgrades the chart when it lands.
    let quickJson = null;
    let quickError = null;
    try {
      quickJson = await requestChart(false);
    } catch (loadError) {
      quickError = loadError;
    }
    const historyPromise = quiet ? null : requestChart(true).catch(() => null);

    if (quickJson) {
      const quickPoints = quickJson.points || [];
      const prior = viewportRef.current;
      const priorLiveStart = Math.max(0, prior.total - Math.max(prior.count, 1));
      const wasAtLive = Math.abs(prior.start - priorLiveStart) <= 1;
      if (!quiet) {
        pointsRef.current = quickPoints;
        viewportRef.current = { start: 0, count: quickPoints.length, total: quickPoints.length };
        setPoints(quickPoints);
        setWarmup(quickJson.warmup || []);
        setViewportStart(0);
        setVisibleCount(Math.max(1, quickPoints.length));
        setLoading(false);
      } else if (wasAtLive) {
        const merged = mergeLatestPoints(pointsRef.current, quickPoints);
        const nextCount = Math.max(1, Math.min(prior.count, merged.length));
        const nextStart = Math.max(0, merged.length - nextCount);
        pointsRef.current = merged;
        viewportRef.current = { start: nextStart, count: nextCount, total: merged.length };
        setPoints(merged);
        setViewportStart(nextStart);
        setVisibleCount(nextCount);
      } else {
        const merged = mergeLatestPoints(pointsRef.current, quickPoints);
        pointsRef.current = merged;
        viewportRef.current = { ...prior, total: merged.length };
        setPoints(merged);
      }
      setCurrency(quickJson.currency || "USD");
      setUpdatedAt(new Date());
      setSecondsToRefresh(REFRESH_SECONDS);
      setError(null);
    }

    const historyJson = historyPromise ? await historyPromise : null;
    if (historyJson) {
      const historyPoints = historyJson.points || [];
      const historyStart = Math.max(0, Math.min(historyJson.viewStart || 0, historyPoints.length - 1));
      const prior = viewportRef.current;
      const priorPoints = pointsRef.current;
      const priorLiveStart = Math.max(0, prior.total - Math.max(prior.count, 1));
      const wasAtLive = Math.abs(prior.start - priorLiveStart) <= 1;
      pointsRef.current = historyPoints;
      setPoints(historyPoints);
      setWarmup(historyJson.warmup || []);
      if (!quickJson) {
        const nextCount = Math.max(1, historyPoints.length - historyStart);
        viewportRef.current = { start: historyStart, count: nextCount, total: historyPoints.length };
        setViewportStart(historyStart);
        setVisibleCount(nextCount);
      } else if (wasAtLive) {
        const nextCount = Math.max(1, Math.min(prior.count, historyPoints.length));
        const nextStart = Math.max(0, historyPoints.length - nextCount);
        viewportRef.current = { start: nextStart, count: nextCount, total: historyPoints.length };
        setViewportStart(nextStart);
        setVisibleCount(nextCount);
      } else {
        const anchorTime = priorPoints[Math.max(0, Math.floor(prior.start))]?.t;
        const mappedStart = anchorTime == null ? historyStart : Math.max(0, historyPoints.findIndex((point) => point.t >= anchorTime));
        viewportRef.current = { start: mappedStart, count: prior.count, total: historyPoints.length };
        setViewportStart(mappedStart);
      }
      setCurrency(historyJson.currency || "USD");
      setError(null);
    }

    if (!quickJson && !historyJson && quickError?.name !== "AbortError") {
      setError(quickError?.message || `${symbol} data is unavailable`);
    }
    if (!quiet) setLoading(false);
  }, [range, symbol]);

  useEffect(() => {
    const syncNotificationState = () => {
      try {
        setNotificationEnabled(localStorage.getItem(RSI_LE_NOTIFICATION_KEYS.enabled) === "1");
      } catch {}
    };
    syncNotificationState();
    window.addEventListener("storage", syncNotificationState);
    window.addEventListener(RSI_LE_NOTIFICATION_EVENT, syncNotificationState);
    return () => {
      window.removeEventListener("storage", syncNotificationState);
      window.removeEventListener(RSI_LE_NOTIFICATION_EVENT, syncNotificationState);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const initialLoad = setTimeout(() => load(controller.signal), 0);
    const timer = setInterval(() => load(controller.signal, true), REFRESH_MS);
    return () => {
      controller.abort();
      clearTimeout(initialLoad);
      clearInterval(timer);
    };
  }, [load]);

  // The snapshots are collected site-wide by RsiLeNotifier; the chart reads
  // whatever is already stored and follows it from there. Mounting also kicks
  // one poll so the series is current the moment the section opens.
  useEffect(() => {
    const sync = () => setGexHistory(readGexHistory(symbol));
    const initialSync = setTimeout(sync, 0);
    pollGexHistory(symbol);
    window.addEventListener(GEX_HISTORY_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      clearTimeout(initialSync);
      window.removeEventListener(GEX_HISTORY_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [symbol]);

  useEffect(() => {
    viewportRef.current = { start: viewportStart, count: visibleCount, total: points.length };
    pointsRef.current = points;
  }, [points, viewportStart, visibleCount]);

  useEffect(() => {
    const tick = setInterval(() => {
      setSecondsToRefresh(updatedAt ? Math.max(0, Math.ceil((updatedAt.getTime() + REFRESH_MS - Date.now()) / 1000)) : REFRESH_SECONDS);
    }, 1000);
    return () => clearInterval(tick);
  }, [updatedAt]);

  const handleZoom = useCallback((deltaY, anchor) => {
    const current = viewportRef.current;
    if (!current.total || !current.count) return;
    const next = zoomViewport(current, deltaY, anchor);
    viewportRef.current = next;
    setViewportStart(next.start);
    setVisibleCount(next.count);
  }, []);

  const handleResetView = useCallback(() => {
    const total = viewportRef.current.total;
    if (!total) return;
    const count = Math.min(DEFAULT_VISIBLE_BARS, total);
    const start = Math.max(0, total - count);
    viewportRef.current = { start, count, total };
    setViewportStart(start);
    setVisibleCount(count);
  }, []);

  const closes = useMemo(() => points.map((point) => point.c), [points]);
  const fullCloses = useMemo(() => [...warmup, ...closes], [warmup, closes]);
  const allSignals = useMemo(() => {
    if (signalMode === "vwap") return vwapSignals(points);
    if (signalMode === "orb") return openingRangeSignals(points);
    if (signalMode === "ema") return emaCrossSignals(points, warmup);
    if (signalMode === "macd") return macdSignals(points, warmup);
    return visibleTail(rsiLeSignals(fullCloses), closes.length);
  }, [closes.length, fullCloses, points, signalMode, warmup]);
  const signalDetails = SIGNAL_DETAILS[signalMode];
  const fullRsi14 = useMemo(() => rsi(fullCloses, RSI_LE_LENGTH), [fullCloses]);
  const allRsi14 = useMemo(() => visibleTail(fullRsi14, closes.length), [fullRsi14, closes.length]);
  const allRsiAverage = useMemo(() => visibleTail(sma(fullRsi14, RSI_LE_LENGTH), closes.length), [fullRsi14, closes.length]);
  const allMovingAverages = useMemo(() => RLE_MA_LINES
    .filter((line) => technicals[line.key])
    .map((line) => ({
      ...line,
      values: visibleTail(line.kind === "ema" ? ema(fullCloses, line.period) : sma(fullCloses, line.period), closes.length),
    })), [closes.length, fullCloses, technicals]);
  const visibleSpan = Math.max(visibleCount, 1);
  const maxViewportStart = Math.max(0, points.length - visibleSpan);
  // TradingView-style free scroll: the viewport may run off either end of the
  // series into empty space, so only the slice is clamped, never the viewport.
  const sliceStart = Math.max(0, Math.min(Math.floor(viewportStart), points.length));
  const xShiftBars = sliceStart - viewportStart;
  const viewportEnd = Math.max(sliceStart, Math.min(points.length, Math.ceil(viewportStart + visibleSpan)));
  const visiblePoints = points.slice(sliceStart, viewportEnd);
  const signals = allSignals.slice(sliceStart, viewportEnd);
  const rsi14 = allRsi14.slice(sliceStart, viewportEnd);
  const rsiAverage = allRsiAverage.slice(sliceStart, viewportEnd);
  const movingAverages = useMemo(() => allMovingAverages.map((line) => ({
    ...line,
    values: line.values.slice(sliceStart, viewportEnd),
  })), [allMovingAverages, sliceStart, viewportEnd]);
  const latest = points[points.length - 1];
  const first = points[Math.floor(maxViewportStart)];
  const change = latest && first ? latest.c - first.c : null;
  const changePct = change != null && first?.c ? (change / first.c) * 100 : null;
  const inspectedIndex = hoverIndex ?? (visiblePoints.length ? visiblePoints.length - 1 : null);
  const inspected = inspectedIndex != null ? visiblePoints[inspectedIndex] : null;
  const latestRsi = inspectedIndex != null ? rsi14[inspectedIndex] : null;
  const latestAverage = inspectedIndex != null ? rsiAverage[inspectedIndex] : null;
  const signalCount = signals.filter(Boolean).length;
  const latestSignalIndex = signals.findLastIndex(Boolean);
  const latestSignal = latestSignalIndex >= 0 ? signals[latestSignalIndex] : null;

  const selectSymbol = (nextSymbol) => {
    if (nextSymbol === symbol) return;
    setSymbol(nextSymbol);
    setLoading(true);
    setError(null);
    setPoints([]);
    setWarmup([]);
    setGexHistory([]);
    setHoverIndex(null);
    setTrendlines([]);
    setViewportStart(0);
    setVisibleCount(0);
    setPriceScale(1);
    setPriceOffset(0);
    pointsRef.current = [];
    viewportRef.current = { start: 0, count: 0, total: 0 };
    try {
      localStorage.setItem(RSI_LE_NOTIFICATION_KEYS.symbol, nextSymbol);
      localStorage.removeItem(RSI_LE_NOTIFICATION_KEYS.lastSeen);
    } catch {}
    window.dispatchEvent(new Event(RSI_LE_NOTIFICATION_EVENT));
  };

  const toggleNotifications = async () => {
    const nextEnabled = !notificationEnabled;
    try {
      localStorage.setItem(RSI_LE_NOTIFICATION_KEYS.enabled, nextEnabled ? "1" : "0");
      localStorage.setItem(RSI_LE_NOTIFICATION_KEYS.symbol, symbol);
      if (nextEnabled) {
        if (latest?.t) localStorage.setItem(RSI_LE_NOTIFICATION_KEYS.lastSeen, String(latest.t));
      }
    } catch {}
    setNotificationEnabled(nextEnabled);
    window.dispatchEvent(new Event(RSI_LE_NOTIFICATION_EVENT));

    if (nextEnabled && "Notification" in window && Notification.permission === "default") {
      try { await Notification.requestPermission(); } catch {}
    }
  };

  return (
    <main className="rle-page">
      <section className="rle-workspace" aria-labelledby="rle-title">
        <header className="rle-toolbar">
          <div className="rle-identity">
            <span className="rle-fund-mark" aria-hidden="true">
              <svg viewBox="0 0 42 42"><path d="M8 13.5 34 8M8 22l26-5.5M8 30.5 34 25" /></svg>
            </span>
            <div className="rle-fund-copy">
              <h2 id="rle-title">{FUNDS[symbol].name}</h2>
              <div className="rle-fund-meta">
                <span>{symbol} · {FUNDS[symbol].exchange} 🇺🇸</span>
                <b>{signalDetails.badge}</b>
                <i className="rle-live">Live</i>
              </div>
            </div>
          </div>

          <div className="rle-actions">
            <div className="rle-symbol-toggle" role="group" aria-label="Market symbol">
              {Object.keys(FUNDS).map((fundSymbol) => (
                <button key={fundSymbol} type="button" className={symbol === fundSymbol ? "active" : ""} onClick={() => selectSymbol(fundSymbol)} aria-pressed={symbol === fundSymbol}>{fundSymbol}</button>
              ))}
            </div>
            <button type="button" className={`rle-gex-button${gexOpen ? " active" : ""}`} onClick={() => setGexOpen((open) => !open)} aria-pressed={gexOpen} aria-controls="gex-panel">
              <HeatmapIcon />
              <span>GEX Heatmap</span>
            </button>
            <RsiLeSelectMenu label={gexStyle === "bands" ? "GEX Bands" : "GEX Bubbles"} value={gexStyle} options={GEX_STYLE_OPTIONS} onChange={setGexStyle} className="rle-gex-style-select" />
            <RsiLeSelectMenu label="Signals" value={signalMode} options={SIGNAL_OPTIONS} onChange={setSignalMode} className="rle-signals-select" />
            <RsiLeAlertMenu enabled={notificationEnabled} onToggle={toggleNotifications} />
            <RsiLeTechnicals
              value={technicals}
              onChange={setTechnicals}
              trendlineCount={trendlines.length}
              onUndoTrendline={() => setTrendlines((lines) => lines.slice(0, -1))}
              onClearTrendlines={() => setTrendlines([])}
            />
            <div className="rle-segment" role="group" aria-label="Chart style">
              <button className={mode === "candle" ? "active" : ""} onClick={() => setMode("candle")} aria-label="Candlestick chart" aria-pressed={mode === "candle"}>
                <CandleIcon /><span>Candles</span>
              </button>
              <button className={mode === "line" ? "active" : ""} onClick={() => setMode("line")} aria-label="Line chart" aria-pressed={mode === "line"}>
                <LineIcon /><span>Line</span>
              </button>
            </div>
            <div className="rle-segment rle-tools" role="group" aria-label="Chart interaction">
              <button className={interactionMode === "pan" ? "active" : ""} onClick={() => setInteractionMode("pan")} aria-label="Pan chart" aria-pressed={interactionMode === "pan"} title="Pan chart">
                <PanIcon /><span>Pan</span>
              </button>
              <button className={interactionMode === "measure" ? "active" : ""} onClick={() => setInteractionMode("measure")} aria-label="Measure price range" aria-pressed={interactionMode === "measure"} title="Measure price range">
                <MeasureIcon /><span>Measure</span>
              </button>
              <button className={interactionMode === "trendline" ? "active" : ""} onClick={() => setInteractionMode("trendline")} aria-label="Draw trendline" aria-pressed={interactionMode === "trendline"} title="Draw trendline">
                <TrendlineIcon /><span>Trend</span>
              </button>
            </div>
            <div className="rle-ranges" role="group" aria-label="Chart range">
              {RANGES.map((option) => (
                <button key={option.key} className={range === option.key ? "active" : ""} onClick={() => { setLoading(true); setError(null); setRange(option.key); setHoverIndex(null); setPriceScale(1); setPriceOffset(0); setTrendlines([]); }} title={`${option.label} · ${option.detail}`}>
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rle-quote" aria-live="polite">
            <div className="rle-quote-values">
              <strong>${formatPrice(latest?.c)}</strong>
              <span className={change >= 0 ? "positive" : "negative"}>
                {formatChange(change)} ({formatChange(changePct)}%)
              </span>
              <small>today</small>
            </div>
            <time>Next price in {formatCountdown(secondsToRefresh)} · {currency}</time>
          </div>
        </header>

        <div className={`rle-market-layout${gexOpen ? " gex-open" : ""}`}>
          <div className="rle-market-main">
        <div className="rle-readout">
          <span>{inspected ? formatAxisTime(inspected.t, range) : "Waiting for market data"}</span>
          {inspected && <>
            <b>O <em>{formatPrice(inspected.o)}</em></b>
            <b>H <em>{formatPrice(inspected.h)}</em></b>
            <b>L <em>{formatPrice(inspected.l)}</em></b>
            <b>C <em>{formatPrice(inspected.c)}</em></b>
            <b>Vol <em>{(inspected.v || 0).toLocaleString()}</em></b>
          </>}
          <span className="rle-scale-hint">Wheel to zoom · {interactionMode === "pan" ? "Drag freely ↔ ↕" : interactionMode === "measure" ? "Drag to measure price range" : "Drag to draw trendline"}</span>
        </div>

        <div className="rle-chart-stage">
          {points.length > 0 && (
            <MarketCanvas key={`${symbol}-${range}-${interactionMode}`} symbol={symbol} points={visiblePoints} range={range} mode={mode} signals={signals} signalLabels={signalDetails} rsi14={rsi14} rsiAverage={rsiAverage} showRsi={!!technicals.rsi} movingAverages={movingAverages} trendlines={trendlines} onTrendlinesChange={setTrendlines} dataStartIndex={sliceStart} gexLevels={gexHistory} gexStyle={gexStyle} hoverIndex={hoverIndex} onHoverIndex={setHoverIndex} priceScale={priceScale} onPriceScaleChange={setPriceScale} priceOffset={priceOffset} onPriceOffsetChange={setPriceOffset} viewportStart={viewportStart} maxViewportStart={maxViewportStart} onViewportStartChange={setViewportStart} onResetView={handleResetView} xShiftBars={xShiftBars} visibleSpan={visibleSpan} onZoom={handleZoom} interactionMode={interactionMode} currentPrice={latest?.c} secondsToRefresh={secondsToRefresh} />
          )}
          {!!technicals.rsi && <div className="rle-indicator-label">
            <span>RSI 14 close</span>
            <b>{latestRsi == null ? "—" : latestRsi.toFixed(2)}</b>
            <b className="average">{latestAverage == null ? "—" : latestAverage.toFixed(2)}</b>
          </div>}
          {loading && <div className="rle-state"><span className="rle-skeleton" />Loading {symbol} market data…</div>}
          {!loading && error && (
            <div className="rle-state rle-error">
              <strong>Market data couldn’t load.</strong>
              <span>{error}</span>
              <button onClick={() => { setLoading(true); setError(null); load(undefined); }}>Try again</button>
            </div>
          )}
        </div>

        <footer className="rle-statusbar">
          <div className="rle-legend">
            <span><i className="entry" /> {signalDetails.longLegend}</span>
            <span><i className="exit" /> {signalDetails.shortLegend}</span>
            {!!technicals.rsi && <span><i className="rsi" /> RSI 14</span>}
            {!!technicals.rsi && <span><i className="average" /> RSI-based SMA 14</span>}
            {movingAverages.map((line) => (
              <span key={line.key}><i className={line.dashed ? "technical dashed" : "technical"} style={{ "--line-color": line.color }} /> {line.label}</span>
            ))}
            {trendlines.length > 0 && <span><i className="trendline" /> Trendlines ({trendlines.length})</span>}
            <span><i className="gex" /> 0DTE max Net GEX</span>
          </div>
          <div className="rle-signal-status">
            <span>{signalCount} signals in view</span>
            {latestSignal && <b className={latestSignal === 2 ? "entry" : "exit"}>Latest: {latestSignal === 2 ? signalDetails.long : signalDetails.short}</b>}
            <time>{updatedAt ? `Updated ${updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Connecting"}</time>
          </div>
        </footer>
          </div>
          {gexOpen && <div id="gex-panel"><GexHeatmap key={symbol} symbol={symbol} onClose={() => setGexOpen(false)} /></div>}
        </div>
      </section>

      <aside className="rle-note">
        <strong>Signal logic</strong>
        <span>{`${signalDetails.note} Signals are technical research markers, not trade recommendations. Drag to pan, use the wheel to zoom, and drag the axes to scale. Double-click the chart to return live and recenter price.`}</span>
      </aside>
    </main>
  );
}
