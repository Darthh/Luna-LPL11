"use client";

import { useMemo } from "react";
import Link from "next/link";
import { layoutWheel, wedgePath, W, H, CX, CY, LABEL_X } from "@/lib/etfWheel";
import { hideBrokenLogo, logoUrl } from "@/lib/companyLogo";
import { formatCap } from "@/lib/formatCap";
import { OTHER_COLOR, holdingColors } from "@/lib/portfolioColors";
import { clamp } from "@/lib/num";

// Your holdings as the same wheel the ETF pages draw, because a portfolio and
// a fund are the same picture: a ring of positions sized by what they're
// worth. Geometry and label-fitting are lib/etfWheel unchanged - the only
// difference here is that the weights come from shares x price rather than
// from a fund's filing, and that a slice links to the stock page in-app.
//
// `holdings` is [{ symbol, name, value }], value being the position's worth.

const fmtPct = (v) => (v == null ? "n/a" : `${v.toFixed(v >= 10 ? 1 : 2)}%`);

export default function PortfolioWheel({ holdings, total }) {
  // Colors come from the shared map rather than from the wheel's own rank
  // order, so a ticker is the same color here as on the chart above it.
  const colors = useMemo(() => holdingColors(holdings), [holdings]);

  const wheel = useMemo(() => {
    if (!total) return null;
    // Ranked biggest-first, which is the order the wheel labels assume.
    const ranked = [...holdings]
      .sort((a, b) => b.value - a.value)
      .map((h) => ({ ...h, percent: (h.value / total) * 100 }));
    const built = layoutWheel(ranked);
    if (!built) return null;
    // layoutWheel assigns its own palette by rank; the slice objects are
    // recolored in place from the shared map so both pictures agree. The
    // labels hold references to the same slice objects, so their leader lines
    // follow without a second pass.
    for (const slice of built.slices) {
      slice.color = slice.symbol ? (colors[slice.symbol] ?? OTHER_COLOR) : OTHER_COLOR;
    }
    return built;
  }, [holdings, total, colors]);

  if (!wheel) return null;

  // The shared viewBox reserves label room for a twenty-holding ETF. A
  // portfolio rarely has that many, and the empty band top and bottom is what
  // pushes the growth chart below the fold in the column beside the list. So
  // the box is cropped to the labels actually laid out - the geometry is
  // untouched, only the window onto it.
  const ys = wheel.labels.map((l) => l.y);
  const top = clamp(Math.min(...ys.map((y) => y - 22)), 0, CY - 190);
  const bottom = Math.min(H, Math.max(CY + 190, ...ys.map((y) => y + 22)));

  return (
    <section className="stock-card etf-wheel-card wl-wheel-card">
      <div className="etf-wheel-head">
        <h2 className="stock-card-title">Portfolio weight</h2>
        <span>Each holding sized by what it&rsquo;s worth today</span>
      </div>
      <svg
        className="etf-wheel"
        viewBox={`0 ${top} ${W} ${bottom - top}`}
        role="img"
        aria-label="Your portfolio by weight"
      >
        {wheel.slices.map((s) => (
          <path
            key={s.symbol ?? "other"}
            className={`etf-slice${s.symbol ? " clickable" : ""}`}
            d={wedgePath(s.a0, s.a1)}
            fill={s.color}
          >
            <title>
              {s.name ?? s.symbol} - {fmtPct(s.percent)}
            </title>
          </path>
        ))}
        {wheel.labels.map(({ slice: s, ax, ay, y, right }) => {
          const tx = right ? CX + LABEL_X : CX - LABEL_X;
          const elbowX = right ? tx - 26 : tx + 26;
          return (
            <g key={`label-${s.symbol ?? "other"}`} className="etf-label">
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
              <text
                className="etf-label-sym"
                x={right ? tx + 30 : tx - 30}
                y={y - 2}
                textAnchor={right ? "start" : "end"}
              >
                {s.symbol ?? "Other"}
              </text>
              <text
                className="etf-label-pct"
                x={right ? tx + 30 : tx - 30}
                y={y + 13}
                textAnchor={right ? "start" : "end"}
              >
                {fmtPct(s.percent)}
              </text>
              <title>
                {s.name ?? s.symbol} - {fmtPct(s.percent)}
              </title>
            </g>
          );
        })}
        <text className="etf-center-sym" x={CX} y={CY - 4} textAnchor="middle">
          {formatCap(total)}
        </text>
        <text className="etf-center-sub" x={CX} y={CY + 18} textAnchor="middle">
          {holdings.length} holding{holdings.length === 1 ? "" : "s"}
        </text>
      </svg>
      {/* The wheel's slices are SVG, so the links that make it navigable live
          here as real anchors rather than as click handlers on a <path>. */}
      <div className="wl-wheel-links">
        {[...holdings]
          .sort((a, b) => b.value - a.value)
          .map((h) => (
            <Link
              key={h.symbol}
              className="wl-wheel-link"
              href={`/stock/${encodeURIComponent(h.symbol)}`}
            >
              <span
                className="wl-wheel-link-dot"
                style={{ background: colors[h.symbol] }}
                aria-hidden="true"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="wl-wheel-link-logo"
                src={logoUrl(h.symbol)}
                alt=""
                width="18"
                height="18"
                loading="lazy"
                onError={hideBrokenLogo}
              />
              <span className="wl-wheel-link-sym">{h.symbol}</span>
              <span className="wl-wheel-link-pct">{fmtPct((h.value / total) * 100)}</span>
            </Link>
          ))}
      </div>
    </section>
  );
}
