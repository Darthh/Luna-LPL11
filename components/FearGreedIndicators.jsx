"use client";

import { useMemo, useState } from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler } from "chart.js";
import { Line } from "react-chartjs-2";
import { cssVar } from "@/lib/cssVar";
import { zoneColor, rangeStartIndex } from "@/lib/zone";
import { dragMeasurePlugin } from "@/lib/dragMeasure";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler, dragMeasurePlugin);

const INDICATOR_RANGES = [
  { key: "1y", label: "1Y" },
  { key: "2y", label: "2Y" },
  { key: "3y", label: "3Y" },
];

const INDICATORS = [
  {
    key: "market_momentum_sp500",
    secondaryKey: "market_momentum_sp125",
    heading: "MARKET MOMENTUM",
    chartTitle: "S&P 500 and its 125-day moving average",
    seriesLabels: ["S&P 500", "125-day moving average"],
    format: (v) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    description:
      "Market Momentum compares the S&P 500's current level against its own 125 day moving average. Trading well above the average is a greedy signal that supports buying or holding through the trend, while trading well below it is a fearful signal that supports selling or staying defensive.",
  },
  {
    key: "stock_price_strength",
    heading: "STOCK PRICE STRENGTH",
    chartTitle: "Net new 52-week highs and lows on the NYSE",
    format: (v) => `${v.toFixed(2)}%`,
    description:
      "Stock Price Strength looks at how many NYSE stocks are setting new 52 week highs compared with those setting new 52 week lows. Far more highs than lows is a bullish, greedy sign many traders treat as a green light to buy, while far more lows than highs is a bearish, fearful sign many treat as a reason to sell.",
  },
  {
    key: "stock_price_breadth",
    heading: "STOCK PRICE BREADTH",
    chartTitle: "McClellan Volume Summation Index",
    format: (v) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    description:
      "Stock Price Breadth, tracked through the McClellan Volume Summation Index, measures whether NYSE volume favors advancing or declining stocks. A high, positive reading is a bullish, greedy setup that supports buying, while a low or negative reading is a bearish, fearful setup that supports selling.",
  },
  {
    key: "put_call_options",
    heading: "PUT AND CALL OPTIONS",
    chartTitle: "5-day average put/call ratio",
    format: (v) => v.toFixed(2),
    description:
      "Options let investors bet on a rise, a call, or a fall, a put, and the ratio shows how nervous or confident traders are feeling. A ratio roughly below 0.6 means calls dominate, a bullish signal contrarians read as a reason to sell, while above 0.8 means puts dominate, a bearish signal contrarians read as a buying opportunity.",
  },
  {
    key: "market_volatility_vix",
    secondaryKey: "market_volatility_vix_50",
    heading: "MARKET VOLATILITY",
    chartTitle: "VIX and its 50-day moving average",
    seriesLabels: ["VIX", "50-day moving average"],
    format: (v) => v.toFixed(2),
    description:
      "The VIX tracks expected S&P 500 volatility over the next 30 days and is known as Wall Street's fear gauge. A reading roughly below 20 points to a calm market good for holding or buying, while a reading above 30 points to fear driven selling that contrarians often treat as a buying opportunity.",
  },
  {
    key: "junk_bond_demand",
    heading: "JUNK BOND DEMAND",
    chartTitle: "Spread between junk bonds and investment grade bonds",
    format: (v) => `${v.toFixed(2)}pp`,
    description:
      "Junk Bond Demand measures the yield spread between risky junk bonds and safer investment grade bonds. A narrowing spread is a greedy signal that supports buying stocks, while a widening spread is a fearful signal that supports selling or holding cash.",
  },
  {
    key: "safe_haven_demand",
    heading: "SAFE HAVEN DEMAND",
    chartTitle: "20-day stock vs. Treasury bond return difference",
    format: (v) => `${v.toFixed(2)}%`,
    description:
      "Safe Haven Demand compares 20 day returns on stocks against Treasury bonds. Stocks outperforming bonds is a greedy signal that supports staying invested, while bonds outperforming stocks is a fearful signal that supports a move to cash.",
  },
];

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function formatUpdated(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  const datePart = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const timePart = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
  return `Last updated ${datePart} at ${timePart}`;
}

function sliceToRange(series, range) {
  if (!series?.dates?.length) return series;
  const i0 = rangeStartIndex(series.dates, range);
  if (i0 === 0) return series;
  return { ...series, dates: series.dates.slice(i0), values: series.values.slice(i0) };
}

function IndicatorCard({ item, primary, secondary, theme }) {
  const options = useMemo(() => {
    const tickColor = cssVar("--tick-color");
    const gridColor = cssVar("--grid");
    const tooltipBg = cssVar("--tooltip-bg");
    const tooltipText = cssVar("--tooltip-text");
    const tooltipBorder = cssVar("--tooltip-border");
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        // Measures the indicator itself; the moving-average overlay isn't
        // interesting to drag across on its own.
        dragMeasure: {
          series: [{ datasetIndex: 0, format: (v) => item.format(v) }],
          mutedColor: tickColor,
          boxColor: tooltipBg,
          boxBorderColor: tooltipBorder,
        },
        tooltip: {
          backgroundColor: tooltipBg,
          titleColor: tooltipText,
          bodyColor: tooltipText,
          borderColor: tooltipBorder,
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label(ctx) {
              return ` ${ctx.dataset.label}: ${item.format(ctx.parsed.y)}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: "transparent" },
          ticks: {
            maxTicksLimit: 6,
            color: tickColor,
            font: { size: 10 },
            callback(v) {
              const d = new Date(this.getLabelForValue(v));
              return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }).replace(" ", " '");
            },
          },
        },
        y: {
          position: "right",
          grid: { color: gridColor },
          ticks: { color: tickColor, font: { size: 10 }, callback: (v) => item.format(v) },
        },
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, theme]);

  const data = useMemo(() => {
    const fgLine = cssVar("--fg-line");
    const priceLine = cssVar("--price-line");
    const datasets = [
      {
        label: item.seriesLabels?.[0] ?? item.chartTitle,
        data: primary.values,
        borderColor: fgLine,
        borderWidth: 1.8,
        pointRadius: 0,
        pointHitRadius: 6,
        tension: 0.15,
        fill: false,
      },
    ];
    if (secondary) {
      datasets.push({
        label: item.seriesLabels?.[1] ?? "Moving average",
        data: secondary.values,
        borderColor: priceLine,
        borderWidth: 1.8,
        pointRadius: 0,
        pointHitRadius: 6,
        tension: 0.15,
        fill: false,
      });
    }
    return { labels: primary.dates, datasets };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, primary, secondary, theme]);

  const color = primary.score != null ? zoneColor(primary.score) : null;
  const updated = formatUpdated(primary.asOf);

  return (
    <div className="indicator-row">
      <div>
        <div className="indicator-heading">{item.heading}</div>
        <div className="indicator-chart-head">
          <span className="indicator-chart-title">{item.chartTitle}</span>
          {primary.rating && color && (
            <span
              className="rating-badge"
              style={{ color, background: hexToRgba(color, 0.15), borderColor: hexToRgba(color, 0.4) }}
            >
              {primary.rating.toUpperCase()}
            </span>
          )}
        </div>
        {secondary && (
          <div className="indicator-legend">
            <span>
              <span className="dot" style={{ background: "var(--fg-line)" }} />
              {item.seriesLabels[0]}
            </span>
            <span>
              <span className="dot" style={{ background: "var(--price-line)" }} />
              {item.seriesLabels[1]}
            </span>
          </div>
        )}
        <div className="indicator-chart-wrap">
          <Line data={data} options={options} />
        </div>
        {updated && <div className="indicator-updated">{updated}</div>}
      </div>
      <div className="indicator-desc">{item.description}</div>
    </div>
  );
}

export default function FearGreedIndicators({ indicators, theme }) {
  const [range, setRange] = useState("1y");

  if (!indicators) return null;

  return (
    <div className="indicators-section">
      <div className="indicators-card">
        <div className="indicators-title">
          <span className="bar" />
          7 FEAR &amp; GREED INDICATORS
          <div className="indicators-range" role="group" aria-label="Indicator date range">
            {INDICATOR_RANGES.map((r) => (
              <button
                key={r.key}
                className={r.key === range ? "zbtn active" : "zbtn"}
                onClick={() => setRange(r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        {INDICATORS.map((item) => {
          const primaryFull = indicators[item.key];
          if (!primaryFull?.dates?.length) return null;
          const primary = sliceToRange(primaryFull, range);
          const secondaryFull = item.secondaryKey ? indicators[item.secondaryKey] : null;
          const secondary = secondaryFull ? sliceToRange(secondaryFull, range) : null;
          return <IndicatorCard key={item.key} item={item} primary={primary} secondary={secondary} theme={theme} />;
        })}
      </div>
    </div>
  );
}
