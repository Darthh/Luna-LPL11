"use client";

import { useMemo, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";
import PasswordGate from "@/components/PasswordGate";
import { generateSeries, realisedVol, BARS_PER_DAY } from "@/lib/synthMarket";
import { monteCarlo, STRATEGIES } from "@/lib/backtest";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

// An RSI strategy lab on a synthetic 1-minute tape.
//
// The honest framing, which the page states rather than hides: a backtest on
// made-up data cannot tell you what works on SPY. Whatever the generator was
// given is what the search finds. What it CAN do, and what real data cannot,
// is show the null - run the same rules on a tape with no edge in it at all and
// watch the range of profits that luck alone produces. That range is the bar a
// real result has to clear, and it is why `random` is the default regime here.

const REGIMES = [
  {
    key: "random",
    label: "Random walk",
    blurb:
      "No edge exists. Any profit here is luck, and the spread across paths is the noise band a real backtest has to beat.",
  },
  {
    key: "meanRevert",
    label: "Mean-reverting",
    blurb:
      "Dips get bought back. Mean reversion should win - which proves the search works, not that SPY behaves this way.",
  },
  {
    key: "trend",
    label: "Trending",
    blurb:
      "Moves persist. Momentum should win. Same tape, same rules, opposite answer - that is the lesson.",
  },
];

const KEYS = ["buyHold", "meanRevert", "momentum", "meanRevertTrend"];

const COLORS = {
  buyHold: "#8b93a7",
  meanRevert: "#3fae5e",
  momentum: "#e5484d",
  meanRevertTrend: "#4a8fe7",
};

const DEFAULTS = {
  regime: "random",
  regimeStrength: 0.5,
  days: 60,
  seed: 1,
  annualVol: 0.16,
  annualDrift: 0.08,
  paths: 100,
  period: 14,
  oversold: 30,
  overbought: 70,
  exitLevel: 50,
  costBps: 2,
};

const pct = (n, d = 2) => `${n > 0 ? "+" : ""}${(n * 100).toFixed(d)}%`;

// `group` swaps the <label> for a labelled group. A label wrapping several
// buttons folds all of their text into one accessible name - the segmented
// regime control announced itself as "Regime Mean-reverting Trending" and
// "Random walk" stopped existing as a control at all.
function Field({ label, hint, children, group = false }) {
  const inner = (
    <>
      <span className="bt-field-label">
        {label}
        {hint && <span className="bt-field-hint">{hint}</span>}
      </span>
      {children}
    </>
  );
  return group ? (
    <div className="bt-field" role="group" aria-label={label}>
      {inner}
    </div>
  ) : (
    <label className="bt-field">{inner}</label>
  );
}

function NumberField({ label, hint, value, onChange, ...rest }) {
  return (
    <Field label={label} hint={hint}>
      <input
        type="number"
        className="bt-input"
        value={value}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        {...rest}
      />
    </Field>
  );
}

function Lab() {
  const [cfg, setCfg] = useState(DEFAULTS);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (k) => (v) => setCfg((c) => ({ ...c, [k]: v }));
  const regime = REGIMES.find((r) => r.key === cfg.regime);

  function run() {
    setBusy(true);
    // The run is a few million iterations of straight-line arithmetic. Yielding
    // one frame first lets the button repaint as "Running" instead of the whole
    // page freezing with no explanation.
    setTimeout(() => {
      const params = {
        period: cfg.period,
        oversold: cfg.oversold,
        overbought: cfg.overbought,
        exitLevel: cfg.exitLevel,
        costBps: cfg.costBps,
        trendPeriod: BARS_PER_DAY,
      };
      const generate = (i) =>
        generateSeries({
          days: cfg.days,
          // Path i gets its own seed, but the whole run is reproducible from the
          // one the user typed.
          seed: cfg.seed * 1000 + i,
          annualVol: cfg.annualVol,
          annualDrift: cfg.annualDrift,
          regime: cfg.regime,
          regimeStrength: cfg.regimeStrength,
        });

      const out = monteCarlo(generate, KEYS, params, cfg.paths);
      setResult({
        ...out,
        vol: realisedVol(out.sample.closes),
        cfg: { ...cfg },
      });
      setBusy(false);
    }, 20);
  }

  const priceChart = useMemo(() => {
    if (!result) return null;
    const closes = result.sample.closes;
    const stride = Math.max(1, Math.floor(closes.length / 600));
    const pts = [];
    for (let i = 0; i < closes.length; i += stride) pts.push(closes[i]);
    return {
      labels: pts.map((_, i) => ((i * stride) / BARS_PER_DAY).toFixed(1)),
      datasets: [
        {
          label: "Synthetic SPY",
          data: pts,
          borderColor: "#4a8fe7",
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0,
        },
      ],
    };
  }, [result]);

  const equityChart = useMemo(() => {
    if (!result) return null;
    const runs = result.sample.runs;
    const len = Math.max(...KEYS.map((k) => runs[k].curve.length));
    return {
      labels: Array.from({ length: len }, (_, i) =>
        ((i / len) * result.cfg.days).toFixed(1)
      ),
      datasets: KEYS.map((k) => ({
        label: STRATEGIES[k].label,
        data: runs[k].curve,
        borderColor: COLORS[k],
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0,
      })),
    };
  }, [result]);

  const chartOpts = (yTitle) => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: yTitle !== "Price", labels: { boxWidth: 10, font: { size: 11 } } },
      tooltip: { callbacks: { title: (t) => `Day ${t[0].label}` } },
    },
    scales: {
      x: { ticks: { maxTicksLimit: 8, font: { size: 10 } }, grid: { display: false } },
      y: { ticks: { font: { size: 10 } } },
    },
  });

  const rows = result?.summary ?? [];
  const best = rows.length
    ? rows.reduce((a, b) => (b.medianReturn > a.medianReturn ? b : a))
    : null;

  return (
    <main className="bt-page">
      <header className="bt-head">
        <h1 className="bt-title">RSI backtester</h1>
        <p className="bt-sub">
          Synthetic 1-minute tape with fat tails, volatility clustering and the intraday U.
          Four RSI rules, run across many independent paths.
        </p>
      </header>

      <div className="bt-warn">
        <b>This cannot tell you what works on SPY.</b> Whatever the generator is given is what
        the search finds &mdash; set the regime to mean-reverting and mean reversion wins, set it
        to trending and momentum wins. What it is genuinely for is the{" "}
        <b>random walk</b> setting: no edge exists in that tape, so the spread of returns you see
        there is what luck alone produces. That is the bar any real backtest has to clear.
      </div>

      <section className="bt-controls">
        <div className="bt-group">
          <h2 className="bt-group-title">Market</h2>
          <Field label="Regime" group>
            <div className="bt-seg">
              {REGIMES.map((r) => (
                <button
                  key={r.key}
                  className={r.key === cfg.regime ? "bt-seg-btn bt-seg-on" : "bt-seg-btn"}
                  onClick={() => set("regime")(r.key)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </Field>
          <p className="bt-blurb">{regime.blurb}</p>
          <Field label="Regime strength" hint={cfg.regimeStrength.toFixed(2)}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={cfg.regimeStrength}
              disabled={cfg.regime === "random"}
              onChange={(e) => set("regimeStrength")(Number(e.target.value))}
            />
          </Field>
          <div className="bt-grid">
            <NumberField label="Days" value={cfg.days} onChange={set("days")} min={5} max={500} />
            <NumberField label="Paths" hint="Monte Carlo" value={cfg.paths} onChange={set("paths")} min={1} max={500} />
            <NumberField label="Annual vol" value={cfg.annualVol} onChange={set("annualVol")} step={0.01} min={0.02} max={1} />
            <NumberField label="Annual drift" value={cfg.annualDrift} onChange={set("annualDrift")} step={0.01} min={-0.5} max={0.5} />
            <NumberField label="Seed" value={cfg.seed} onChange={set("seed")} min={1} />
          </div>
        </div>

        <div className="bt-group">
          <h2 className="bt-group-title">Rules</h2>
          <div className="bt-grid">
            <NumberField label="RSI period" value={cfg.period} onChange={set("period")} min={2} max={100} />
            <NumberField label="Oversold" value={cfg.oversold} onChange={set("oversold")} min={1} max={49} />
            <NumberField label="Overbought" value={cfg.overbought} onChange={set("overbought")} min={51} max={99} />
            <NumberField label="Exit level" value={cfg.exitLevel} onChange={set("exitLevel")} min={2} max={98} />
            <NumberField
              label="Cost"
              hint="bps round trip"
              value={cfg.costBps}
              onChange={set("costBps")}
              step={0.5}
              min={0}
              max={100}
            />
          </div>
          <p className="bt-blurb">
            Cost is the whole ballgame at 1-minute frequency. SPY shares round-trip near 1&ndash;2
            bps; a near-the-money SPY option is closer to 100&ndash;500. Type that in and watch
            every rule die &mdash; that is the real result, not a bug.
          </p>
          <button className="bt-run" onClick={run} disabled={busy}>
            {busy ? "Running…" : "Run backtest"}
          </button>
        </div>
      </section>

      {result && (
        <>
          <section className="bt-results">
            <div className="bt-meta">
              {result.cfg.paths} paths &middot; {result.cfg.days} days &middot;{" "}
              {(result.cfg.days * BARS_PER_DAY).toLocaleString()} bars each &middot; realised vol{" "}
              {(result.vol * 100).toFixed(1)}%
            </div>
            <div className="bt-table-wrap">
              <table className="bt-table">
                <thead>
                  <tr>
                    <th>Strategy</th>
                    <th>Median</th>
                    <th>5th–95th</th>
                    <th>Profitable paths</th>
                    <th>Trades</th>
                    <th>Win rate</th>
                    <th>Sharpe</th>
                    <th>Max DD</th>
                    <th>Exposure</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className={r.key === best?.key ? "bt-best" : undefined}>
                      <td>
                        <span className="bt-swatch" style={{ background: COLORS[r.key] }} />
                        {r.label}
                      </td>
                      <td className={r.medianReturn >= 0 ? "bt-up" : "bt-down"}>
                        {pct(r.medianReturn)}
                      </td>
                      <td className="bt-dim">
                        {pct(r.p05, 1)} … {pct(r.p95, 1)}
                      </td>
                      <td>{(r.winPaths * 100).toFixed(0)}%</td>
                      <td>{r.trades.toFixed(0)}</td>
                      <td>{r.winRate == null ? "—" : `${(r.winRate * 100).toFixed(0)}%`}</td>
                      <td>{r.sharpe.toFixed(2)}</td>
                      <td className="bt-down">{pct(r.maxDrawdown, 1)}</td>
                      <td>{(r.exposure * 100).toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="bt-read">
              {result.cfg.regime === "random" ? (
                <>
                  This tape has <b>no edge in it</b>. Read the 5th&ndash;95th column as the range
                  luck produces &mdash; a real strategy has to beat that whole band, not the
                  median.{" "}
                  {result.cfg.costBps > 0 ? (
                    <>
                      Profitable paths sit well under 50% because costs are on: the coin is fair,
                      the {result.cfg.costBps} bps you pay to flip it is not. Set cost to 0 to see
                      it return to a coin flip.
                    </>
                  ) : (
                    <>
                      With costs at 0, profitable paths near 50% is the coin landing where it
                      should. Turn costs on to see what the spread actually charges.
                    </>
                  )}
                </>
              ) : (
                <>
                  <b>{best?.label}</b> leads &mdash; but it was put there by the regime knob.
                  Switch to random walk to see the same rules with the edge removed.
                </>
              )}
            </p>
          </section>

          <section className="bt-charts">
            <div className="bt-chart">
              <h3 className="bt-chart-title">Sample tape (path 1)</h3>
              <div className="bt-canvas">
                <Line data={priceChart} options={chartOpts("Price")} />
              </div>
            </div>
            <div className="bt-chart">
              <h3 className="bt-chart-title">Equity on that same path</h3>
              <div className="bt-canvas">
                <Line data={equityChart} options={chartOpts("Equity")} />
              </div>
              <p className="bt-blurb">
                One path, shown because curves are legible in a way tables are not. It is the
                weakest evidence on this page &mdash; the table above is the result.
              </p>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

export default function RsiLabPage() {
  return (
    <PasswordGate title="RSI Backtester">
      <Lab />
    </PasswordGate>
  );
}
