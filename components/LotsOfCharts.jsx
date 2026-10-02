"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";
import TickerInput from "@/components/TickerInput";
import { useTheme } from "@/components/PageChrome";
import { cssVar } from "@/lib/cssVar";
import { hideBrokenLogo, logoUrl } from "@/lib/companyLogo";
import { pct } from "@/lib/num";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

// Four price charts side by side over one shared range. The stock page draws
// one symbol in depth; this is the other half of the question - which of the
// four is doing something, at a glance, without four tabs.
//
// Four rather than an arbitrary grid: two by two is the most that stays
// readable at the size a chart has to be to show a drawdown, and a fifth chart
// would halve the height of all of them.
const MAX_SLOTS = 4;

const RANGES = [
  { key: "1m", label: "1M" },
  { key: "3m", label: "3M" },
  { key: "6m", label: "6M" },
  { key: "1y", label: "1Y" },
  { key: "3y", label: "3Y" },
  { key: "5y", label: "5Y" },
];

const DEFAULT_SYMBOLS = ["SPY", "QQQ", "NVDA", "AAPL"];

const dayLabel = (t) =>
  new Date(t * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const tickLabel = (t) =>
  new Date(t * 1000).toLocaleDateString("en-US", { month: "short", year: "2-digit" });

export default function LotsOfCharts() {
  const [symbols, setSymbols] = useState(DEFAULT_SYMBOLS);
  const [range, setRange] = useState("1y");
  const [draft, setDraft] = useState("");

  const add = (raw) => {
    const symbol = String(raw ?? "").trim().toUpperCase();
    setDraft("");
    if (!symbol || symbols.length >= MAX_SLOTS || symbols.includes(symbol)) return;
    setSymbols((prev) => [...prev, symbol]);
  };

  return (
    <div className="loc-page">
      <header className="loc-head">
        <div>
          <h1>Lots of Charts</h1>
          <p>
            Up to {MAX_SLOTS} symbols on one screen, over the same window. Click a chart&rsquo;s
            ticker for the full page.
          </p>
        </div>
        <div className="wl-ranges" role="group" aria-label="Chart range">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              className={`wl-range${range === r.key ? " active" : ""}`}
              onClick={() => setRange(r.key)}
              aria-pressed={range === r.key}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      {symbols.length < MAX_SLOTS && (
        <form
          className="loc-add"
          onSubmit={(e) => {
            e.preventDefault();
            add(draft);
          }}
        >
          <TickerInput
            value={draft}
            index={-1}
            label="Add a symbol"
            placeholder="Add a symbol"
            onChange={setDraft}
            onPick={add}
          />
          <button type="submit">Add</button>
        </form>
      )}

      <div className="loc-grid">
        {symbols.map((symbol) => (
          <ChartTile
            key={symbol}
            symbol={symbol}
            range={range}
            onRemove={() => setSymbols((prev) => prev.filter((s) => s !== symbol))}
          />
        ))}
      </div>
    </div>
  );
}

function ChartTile({ symbol, range, onRemove }) {
  const theme = useTheme();
  // The result carries the request it answers, so a result that does not match
  // what is being asked for now is what "loading" means - no separate flag to
  // fall out of step with the fetch.
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const requestKey = `${symbol}|${range}`;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/stock-chart?symbol=${encodeURIComponent(symbol)}&range=${range}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "No price history");
        return json;
      })
      .then((json) => {
        if (cancelled) return;
        setResult({ points: json.points ?? [], key: `${symbol}|${range}` });
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setResult(null);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, range]);

  const points = result?.key === requestKey ? result.points : null;

  const stats = useMemo(() => {
    if (!points?.length) return null;
    const closes = points.filter((p) => typeof p.c === "number");
    if (closes.length < 2) return null;
    const first = closes[0].c;
    const last = closes[closes.length - 1].c;
    return { last, changePct: (last / first - 1) * 100, up: last >= first };
  }, [points]);

  const chart = useMemo(() => {
    if (!points?.length || !stats) return null;
    const soft = cssVar("--text-soft") || "#8b949e";
    // Green when the window is up, red when it is down - the line says which
    // way it went before you read the number above it.
    const line = stats.up ? "#22c55e" : "#f63538";
    return {
      data: {
        labels: points.map((p) => p.t),
        datasets: [
          {
            label: symbol,
            data: points.map((p) => p.c),
            borderColor: line,
            borderWidth: 1.4,
            pointRadius: 0,
            pointHoverRadius: 3,
            tension: 0.1,
            fill: true,
            backgroundColor: (ctx) => {
              const { chartArea, ctx: c } = ctx.chart;
              if (!chartArea) return "transparent";
              const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
              g.addColorStop(0, stats.up ? "rgba(34,197,94,0.25)" : "rgba(246,53,56,0.25)");
              g.addColorStop(1, "rgba(0,0,0,0)");
              return g;
            },
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: cssVar("--tooltip-bg") || "#161b22",
            titleColor: cssVar("--tooltip-text") || "#e6edf3",
            bodyColor: cssVar("--tooltip-text") || "#e6edf3",
            borderColor: cssVar("--tooltip-border") || cssVar("--border") || "#30363d",
            borderWidth: 1,
            callbacks: {
              title: (items) => dayLabel(Number(items[0].label)),
              label: (c) => `${symbol}: ${c.parsed.y.toFixed(2)}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: soft,
              maxTicksLimit: 5,
              autoSkip: true,
              callback(i) {
                return tickLabel(Number(this.getLabelForValue(i)));
              },
            },
          },
          y: {
            position: "right",
            grid: { color: "rgba(139,147,163,0.12)" },
            ticks: { color: soft, maxTicksLimit: 6 },
          },
        },
      },
    };
    // theme isn't read directly - it's here to redraw when the palette moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, stats, symbol, theme]);

  return (
    <section className="loc-tile">
      <header className="loc-tile-head">
        {/* Not every symbol resolves on the logo CDN (broad ETFs especially),
            so a miss drops the image and the ticker slides over. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl(symbol, 32)} alt="" className="loc-logo" onError={hideBrokenLogo} />
        <Link href={`/stock/${encodeURIComponent(symbol)}`} className="loc-sym">
          {symbol}
        </Link>
        {stats && (
          <>
            <span className="loc-price">{stats.last.toFixed(2)}</span>
            <span className={stats.up ? "up" : "down"}>{pct(stats.changePct)}</span>
          </>
        )}
        <button type="button" onClick={onRemove} aria-label={`Remove ${symbol}`}>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>
      <div className="loc-chart">
        {error ? (
          <div className="stock-chart-empty">{error}</div>
        ) : !chart ? (
          <div className="stock-chart-empty">Loading prices…</div>
        ) : (
          <Line data={chart.data} options={chart.options} />
        )}
      </div>
    </section>
  );
}
