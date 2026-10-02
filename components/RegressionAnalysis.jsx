"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clamp, pct } from "@/lib/num";

const BENCHMARKS = [
  { symbol: "SPY", label: "S&P 500" },
  { symbol: "QQQ", label: "Nasdaq 100" },
  { symbol: "DIA", label: "Dow Jones" },
  { symbol: "IWM", label: "Russell 2000" },
  { symbol: "SOXX", label: "Semiconductor Index" },
  { symbol: "IEMG", label: "Emerging Markets" },
  { symbol: "IEFA", label: "Developed Markets ex-US" },
];

const PERIODS = ["3m", "6m", "1y", "2y", "3y", "5y"];
const FREQUENCIES = ["Daily", "Weekly", "Monthly"];

const fmtDate = (seconds) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(seconds * 1000)
  );

function pairSeries(stockPoints, indexPoints) {
  const indexByDay = new Map(
    indexPoints.map((point) => [new Date(point.t * 1000).toISOString().slice(0, 10), point])
  );
  return stockPoints
    .map((stock) => {
      const key = new Date(stock.t * 1000).toISOString().slice(0, 10);
      const index = indexByDay.get(key);
      return index ? { t: stock.t, stock: stock.c, index: index.c } : null;
    })
    .filter(Boolean);
}

function bucketKey(timestamp, frequency) {
  const date = new Date(timestamp * 1000);
  if (frequency === "Monthly") return `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
  if (frequency === "Weekly") {
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    return `${date.getUTCFullYear()}-${Math.ceil(((date - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7)}`;
  }
  return String(timestamp);
}

function observationsFrom(paired, frequency) {
  const sampled = [];
  let lastKey = null;
  for (const point of paired) {
    const key = bucketKey(point.t, frequency);
    if (key === lastKey) sampled[sampled.length - 1] = point;
    else sampled.push(point);
    lastKey = key;
  }
  return sampled.slice(1).map((point, index) => {
    const previous = sampled[index];
    return {
      t: point.t,
      x: ((point.index / previous.index) - 1) * 100,
      y: ((point.stock / previous.stock) - 1) * 100,
    };
  });
}

function regression(points) {
  if (points.length < 2) return { beta: 0, alpha: 0, correlation: 0, r2: 0 };
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;
  for (const point of points) {
    const dx = point.x - meanX;
    const dy = point.y - meanY;
    covariance += dx * dy;
    varianceX += dx * dx;
    varianceY += dy * dy;
  }
  const beta = varianceX ? covariance / varianceX : 0;
  const alpha = meanY - beta * meanX;
  const correlation = varianceX && varianceY ? covariance / Math.sqrt(varianceX * varianceY) : 0;
  return { beta, alpha, correlation, r2: correlation * correlation };
}

function histogram(values, min, max, bins = 24) {
  const counts = Array.from({ length: bins }, () => 0);
  const width = max - min || 1;
  values.forEach((value) => {
    const bin = clamp(Math.floor(((value - min) / width) * bins), 0, bins - 1);
    counts[bin] += 1;
  });
  return counts;
}

function RegressionPlot({ points, stats }) {
  const plot = { x: 158, y: 24, width: 1010, height: 390 };
  const bottom = { x: plot.x, y: 438, width: plot.width, height: 66 };
  const side = { x: 38, y: plot.y, width: 96, height: plot.height };
  const rawX = points.flatMap((point) => [point.x]);
  const rawY = points.flatMap((point) => [point.y]);
  const xAbs = Math.max(1, ...rawX.map(Math.abs));
  const yAbs = Math.max(1, ...rawY.map(Math.abs));
  const xLimit = xAbs * 1.12;
  const yLimit = yAbs * 1.12;
  const xScale = (value) => plot.x + ((value + xLimit) / (xLimit * 2)) * plot.width;
  const yScale = (value) => plot.y + plot.height - ((value + yLimit) / (yLimit * 2)) * plot.height;
  const xHist = histogram(rawX, -xLimit, xLimit);
  const yHist = histogram(rawY, -yLimit, yLimit);
  const maxXHist = Math.max(1, ...xHist);
  const maxYHist = Math.max(1, ...yHist);
  const xTicks = [-1, -0.5, 0, 0.5, 1].map((n) => n * xLimit);
  const yTicks = [-1, -0.5, 0, 0.5, 1].map((n) => n * yLimit);
  const lineStart = { x: -xLimit, y: stats.alpha + stats.beta * -xLimit };
  const lineEnd = { x: xLimit, y: stats.alpha + stats.beta * xLimit };
  // A year of daily returns is ~250 overlapping points; at the old r=3.1 with a
  // blur filter they merged into one mass around the origin and each dot was
  // drawn wider than its own error. Small marks with a hairline edge let the
  // cloud show its true density, so the scale shrinks as the sample grows.
  const dotRadius = points.length > 600 ? 1.5 : points.length > 200 ? 1.9 : points.length > 80 ? 2.4 : 3;

  return (
    <div className="reg-chart-scroll">
      <svg className="reg-scatter" viewBox="0 0 1210 540" role="img" aria-label="Stock returns plotted against index returns with a regression line">
        <defs>
          <clipPath id="regPlotClip"><rect x={plot.x} y={plot.y} width={plot.width} height={plot.height} /></clipPath>
        </defs>
        <rect className="reg-plot-bg" x={plot.x} y={plot.y} width={plot.width} height={plot.height} />
        <rect className="reg-plot-bg" x={side.x} y={side.y} width={side.width} height={side.height} />
        <rect className="reg-plot-bg" x={bottom.x} y={bottom.y} width={bottom.width} height={bottom.height} />

        {xTicks.map((tick) => <line className={Math.abs(tick) < 0.001 ? "reg-zero" : "reg-grid"} key={`x${tick}`} x1={xScale(tick)} x2={xScale(tick)} y1={plot.y} y2={plot.y + plot.height} />)}
        {yTicks.map((tick) => <line className={Math.abs(tick) < 0.001 ? "reg-zero" : "reg-grid"} key={`y${tick}`} x1={plot.x} x2={plot.x + plot.width} y1={yScale(tick)} y2={yScale(tick)} />)}

        <g clipPath="url(#regPlotClip)">
          {points.map((point, index) => (
            <circle className="reg-dot" key={`${point.t}-${index}`} cx={xScale(point.x).toFixed(2)} cy={yScale(point.y).toFixed(2)} r={dotRadius}>
              <title>{`${fmtDate(point.t)} — Index ${pct(point.x)}, Stock ${pct(point.y)}`}</title>
            </circle>
          ))}
          {/* Drawn after the cloud: the fit is the conclusion, so it reads on
              top of the observations rather than being buried by the dense
              middle of them. */}
          <line className="reg-fit-line" x1={xScale(lineStart.x)} y1={yScale(lineStart.y)} x2={xScale(lineEnd.x)} y2={yScale(lineEnd.y)} />
        </g>

        {xHist.map((count, index) => {
          const barWidth = bottom.width / xHist.length - 2;
          const height = (count / maxXHist) * (bottom.height - 8);
          return <rect className="reg-hist" key={`xh${index}`} x={bottom.x + index * (bottom.width / xHist.length) + 1} y={bottom.y + bottom.height - height} width={barWidth} height={height} />;
        })}
        {yHist.map((count, index) => {
          const barHeight = side.height / yHist.length - 2;
          const width = (count / maxYHist) * (side.width - 8);
          return <rect className="reg-hist" key={`yh${index}`} x={side.x} y={side.y + side.height - (index + 1) * (side.height / yHist.length) + 1} width={width} height={barHeight} />;
        })}

        {xTicks.map((tick) => <text className="reg-axis-tick" key={`xt${tick}`} x={xScale(tick)} y="428" textAnchor="middle">{tick.toFixed(1)}</text>)}
        {yTicks.map((tick) => <text className="reg-axis-tick" key={`yt${tick}`} x="148" y={yScale(tick) + 4} textAnchor="end">{tick.toFixed(1)}</text>)}
        <text className="reg-axis-label" x={plot.x + plot.width / 2} y="533" textAnchor="middle">Index return (%)</text>
        <text className="reg-axis-label" transform="translate(15 220) rotate(-90)" textAnchor="middle">Stock return (%)</text>
        <text className="reg-equation" x={plot.x + 14} y={plot.y + 24}>Y = {stats.beta.toFixed(2)}X {stats.alpha >= 0 ? "+" : "−"} {Math.abs(stats.alpha).toFixed(2)}%</text>
      </svg>
    </div>
  );
}

function PerformanceChart({ paired, stockSymbol, benchmarkSymbol }) {
  if (paired.length < 2) return null;
  const width = 1200;
  const height = 208;
  const pad = { left: 50, right: 18, top: 16, bottom: 30 };
  const stockBase = paired[0].stock;
  const indexBase = paired[0].index;
  const stock = paired.map((point) => ({ t: point.t, value: (point.stock / stockBase) * 100 }));
  const index = paired.map((point) => ({ t: point.t, value: (point.index / indexBase) * 100 }));
  const values = [...stock, ...index].map((point) => point.value);
  const min = Math.min(...values) * 0.96;
  const max = Math.max(...values) * 1.04;
  const x = (i) => pad.left + (i / Math.max(1, paired.length - 1)) * (width - pad.left - pad.right);
  const y = (value) => pad.top + (1 - (value - min) / (max - min || 1)) * (height - pad.top - pad.bottom);
  const path = (series) => series.map((point, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");
  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((n) => min + (max - min) * n);
  const stockLast = stock.at(-1).value;
  const indexLast = index.at(-1).value;

  return (
    <section className="reg-performance" aria-labelledby="relative-performance-title">
      <div className="reg-performance-head">
        <div><h2 id="relative-performance-title">Relative performance</h2><p>Normalized to 100 at start</p></div>
        <div className="reg-line-legend"><span className="stock"><i />{stockSymbol} <b>{stockLast.toFixed(1)}</b></span><span className="index"><i />{benchmarkSymbol} <b>{indexLast.toFixed(1)}</b></span></div>
      </div>
      <svg className="reg-performance-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Relative performance of ${stockSymbol} and ${benchmarkSymbol}`}>
        {gridValues.map((value) => <g key={value}><line className="reg-grid" x1={pad.left} x2={width - pad.right} y1={y(value)} y2={y(value)} /><text className="reg-axis-tick" x={pad.left - 10} y={y(value) + 4} textAnchor="end">{value.toFixed(0)}</text></g>)}
        <line className="reg-baseline" x1={pad.left} x2={width - pad.right} y1={y(100)} y2={y(100)} />
        <path className="reg-performance-stock" d={path(stock)} />
        <path className="reg-performance-index" d={path(index)} />
        <text className="reg-axis-tick" x={pad.left} y={height - 8}>{fmtDate(paired[0].t)}</text>
        <text className="reg-axis-tick" x={width - pad.right} y={height - 8} textAnchor="end">{fmtDate(paired.at(-1).t)}</text>
      </svg>
    </section>
  );
}

export default function RegressionAnalysis() {
  const initialLoad = useRef(false);
  const [stockInput, setStockInput] = useState("NVDA");
  const [stockSymbol, setStockSymbol] = useState("NVDA");
  const [benchmarkSymbol, setBenchmarkSymbol] = useState("SPY");
  const [frequency, setFrequency] = useState("Daily");
  const [period, setPeriod] = useState("1y");
  const [paired, setPaired] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const symbol = stockInput.trim().toUpperCase();
    if (!symbol) return;
    setLoading(true);
    setError(null);
    try {
      const [stockResponse, benchmarkResponse] = await Promise.all([
        fetch(`/api/stock-chart?symbol=${encodeURIComponent(symbol)}&range=${period}`),
        fetch(`/api/stock-chart?symbol=${encodeURIComponent(benchmarkSymbol)}&range=${period}`),
      ]);
      const [stockJson, benchmarkJson] = await Promise.all([stockResponse.json(), benchmarkResponse.json()]);
      if (!stockResponse.ok) throw new Error(stockJson.error || `No price history found for ${symbol}`);
      if (!benchmarkResponse.ok) throw new Error(benchmarkJson.error || `No price history found for ${benchmarkSymbol}`);
      const next = pairSeries(stockJson.points || [], benchmarkJson.points || []);
      if (next.length < 3) throw new Error("Not enough overlapping price history for this comparison.");
      setPaired(next);
      setStockSymbol(symbol);
    } catch (err) {
      setError(err.message || "Historical price data is unavailable.");
    } finally {
      setLoading(false);
    }
  }, [benchmarkSymbol, period, stockInput]);

  useEffect(() => {
    if (initialLoad.current) return;
    initialLoad.current = true;
    const frame = requestAnimationFrame(load);
    return () => cancelAnimationFrame(frame);
  }, [load]);

  const points = useMemo(() => observationsFrom(paired, frequency), [paired, frequency]);
  const stats = useMemo(() => regression(points), [points]);
  const benchmarkName = BENCHMARKS.find((item) => item.symbol === benchmarkSymbol)?.label || benchmarkSymbol;

  return (
    <main className="reg-page">
      <header className="reg-page-head">
        <div><span className="reg-eyebrow">Research tools / Historical beta</span><h1>Regression Analysis</h1><p>Measure how a stock&apos;s returns move against a market index using historical beta and linear regression.</p></div>
        {/* The swatches carry the colour, so the labels name what the marks
            mean rather than what colour they are - the palette follows the
            active theme and "yellow dots" would be wrong on most of them. */}
        <div className="reg-key" aria-label="Chart key"><span><i className="dot" />Observations <small>individual periods</small></span><span><i className="line" />Best fit <small>regression line</small></span></div>
      </header>

      <form className="reg-controls" onSubmit={(event) => { event.preventDefault(); load(); }}>
        <label><span>Historical Beta (Stock)</span><div className="reg-symbol-input"><b>{stockInput.trim().slice(0, 1).toUpperCase() || "—"}</b><input value={stockInput} onChange={(event) => setStockInput(event.target.value.replace(/[^a-z0-9.-]/gi, "").slice(0, 10))} aria-label="Historical Beta stock ticker" spellCheck={false} /></div></label>
        <label><span>Relative Index</span><select value={benchmarkSymbol} onChange={(event) => setBenchmarkSymbol(event.target.value)} aria-label="Relative Index">{BENCHMARKS.map((item) => <option key={item.symbol} value={item.symbol}>{item.symbol} · {item.label}</option>)}</select></label>
        <label><span>Frequency</span><select value={frequency} onChange={(event) => setFrequency(event.target.value)}>{FREQUENCIES.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>Period</span><select value={period} onChange={(event) => setPeriod(event.target.value)}>{PERIODS.map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}</select></label>
        <label className="reg-date"><span>Start date</span><output>{paired.length ? fmtDate(paired[0].t) : "—"}</output></label>
        <label className="reg-date"><span>End date</span><output>{paired.length ? fmtDate(paired.at(-1).t) : "—"}</output></label>
        <button className="reg-run" disabled={loading} type="submit"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7z" /></svg>{loading ? "Analyzing…" : "Run analysis"}</button>
      </form>

      <section className="reg-workspace" aria-live="polite">
        <div className="reg-workspace-bar"><div><strong>{stockSymbol}</strong><span>vs</span><strong>{benchmarkName}</strong><em>{frequency} returns</em></div><span className="reg-observation-count">{points.length} observations</span></div>
        {error ? <div className="reg-state"><strong>Analysis unavailable</strong><span>{error}</span><button type="button" onClick={load}>Try again</button></div> : loading ? <div className="reg-state"><i className="reg-spinner" /><span>Loading aligned price history…</span></div> : <>
          <RegressionPlot points={points} stats={stats} />
          <div className="reg-stats">
            <div><span>Beta</span><strong>{stats.beta.toFixed(2)}</strong></div>
            <div><span>Alpha ({frequency})</span><strong className={stats.alpha < 0 ? "negative" : "positive"}>{pct(stats.alpha)}</strong></div>
            <div><span>R²</span><strong>{stats.r2.toFixed(2)}</strong></div>
            <div><span>Correlation</span><strong>{stats.correlation.toFixed(2)}</strong></div>
            <div><span>Observations</span><strong>{points.length}</strong></div>
          </div>
          <PerformanceChart paired={paired} stockSymbol={stockSymbol} benchmarkSymbol={benchmarkSymbol} />
        </>}
      </section>
      <p className="reg-footnote">Past performance is not indicative of future results. Returns are calculated from adjusted market-session closes where available.</p>
    </main>
  );
}
