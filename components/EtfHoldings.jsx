"use client";

import { useEffect, useMemo, useState } from "react";
import { layoutWheel, wedgePath, W, H, CX, CY, LABEL_X } from "@/lib/etfWheel";
import { blankBrokenLogo, hideBrokenLogo, logoUrl } from "@/lib/companyLogo";

// Fiscal.ai-style ETF holdings wheel: a donut of the fund's largest
// constituents, biggest to smallest clockwise from 12 o'clock, with logo +
// ticker + weight labels fanned around the outside and everything else rolled
// into "Other". Clicking a slice/label/table row opens that stock's page,
// same as searching for it. Layout math lives in lib/etfWheel.

function openStock(symbol) {
  if (!symbol) return;
  window.open(`/stock/${encodeURIComponent(symbol)}`, "_blank", "noopener");
}

const fmtPct = (v) => (v == null ? "n/a" : `${v.toFixed(v >= 10 ? 1 : 2)}%`);

export default function EtfHoldings({ symbol }) {
  // Result is keyed by the symbol it was fetched for; a mismatch with the
  // current symbol is what "loading" means. `data: null` marks a failure.
  const [result, setResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/etf-holdings?symbol=${encodeURIComponent(symbol)}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        const ok = !json.error && json.holdings?.length;
        setResult({ symbol, data: ok ? json : null });
      })
      .catch(() => {
        if (!cancelled) setResult({ symbol, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const current = result?.symbol === symbol ? result : null;
  const data = current?.data ?? null;
  const failed = !!current && !current.data;

  const wheel = useMemo(() => (data ? layoutWheel(data.holdings) : null), [data]);

  // A failure renders nothing so the page simply omits the section.
  if (failed) return null;
  if (!data || !wheel) {
    return (
      <section className="stock-card etf-wheel-card">
        <h3 className="stock-card-title">Market Value</h3>
        <div className="stock-chart-empty">Loading holdings…</div>
      </section>
    );
  }

  const shownCount = data.holdings.length;

  return (
    <>
      <section className="stock-card etf-wheel-card">
        <div className="etf-wheel-head">
          <h3 className="stock-card-title">Market Value</h3>
          {data.tracker && (
            <span>
              {data.tracker.exact ? "Tracked by" : "Market proxy"}: {data.tracker.name} ({data.tracker.symbol})
            </span>
          )}
        </div>
        <svg className="etf-wheel" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${symbol} holdings breakdown`}>
          {wheel.slices.map((s) => (
            <path
              key={s.code ?? "other"}
              className={`etf-slice${s.symbol ? " clickable" : ""}`}
              d={wedgePath(s.a0, s.a1)}
              fill={s.color}
              onClick={() => openStock(s.symbol)}
            >
              <title>
                {s.name} - {fmtPct(s.percent)}
              </title>
            </path>
          ))}
          {wheel.labels.map(({ slice: s, ax, ay, y, right }) => {
            const tx = right ? CX + LABEL_X : CX - LABEL_X;
            const elbowX = right ? tx - 26 : tx + 26;
            return (
              <g
                key={`label-${s.code ?? "other"}`}
                className={`etf-label${s.symbol ? " clickable" : ""}`}
                onClick={() => openStock(s.symbol)}
              >
                <polyline
                  points={`${ax},${ay} ${elbowX},${y} ${tx},${y}`}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="1.2"
                  opacity="0.75"
                />
                {s.symbol && (
                  <image
                    href={logoUrl(s.symbol)}
                    x={right ? tx + 6 : tx - 24}
                    y={y - 16}
                    width="18"
                    height="18"
                    onError={hideBrokenLogo}
                  />
                )}
                <text className="etf-label-sym" x={right ? tx + 30 : tx - 30} y={y - 2} textAnchor={right ? "start" : "end"}>
                  {s.symbol ?? s.code ?? "Other"}
                </text>
                <text className="etf-label-pct" x={right ? tx + 30 : tx - 30} y={y + 13} textAnchor={right ? "start" : "end"}>
                  {fmtPct(s.percent)}
                </text>
                <title>
                  {s.name} - {fmtPct(s.percent)}
                </title>
              </g>
            );
          })}
          <text className="etf-center-sym" x={CX} y={CY - 4} textAnchor="middle">
            {data.displaySymbol ?? symbol}
          </text>
          <text className="etf-center-sub" x={CX} y={CY + 18} textAnchor="middle">
            {data.totalCount} holdings
          </text>
        </svg>
      </section>

      <h2 className="stock-section-title">
        Top {shownCount} Holdings{data.totalCount > shownCount ? ` out of ${data.totalCount}` : ""}
      </h2>
      <section className="stock-card etf-table-card">
        <table className="etf-table">
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Company</th>
              <th className="num">% Portfolio</th>
              <th className="num">Shares</th>
            </tr>
          </thead>
          <tbody>
            {data.holdings.map((h, i) => (
              <tr
                key={h.symbol ?? `${h.code ?? h.name}-${i}`}
                className={h.symbol ? "clickable" : ""}
                onClick={() => openStock(h.symbol)}
              >
                <td>
                  <span className="etf-table-sym">
                    {h.symbol && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={logoUrl(h.symbol, 48)}
                        alt=""
                        loading="lazy"
                        onError={blankBrokenLogo}
                      />
                    )}
                    {h.symbol ?? h.code ?? "n/a"}
                  </span>
                </td>
                <td className="etf-table-name">{h.name}</td>
                <td className="num">{fmtPct(h.percent)}</td>
                <td className="num">{h.shares != null ? h.shares.toLocaleString() : "n/a"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
