"use client";

import Link from "next/link";
import { logoUrl, blankBrokenLogo } from "@/lib/companyLogo";

// One quote row, shared by the two rail panels that rank tickers by percent
// move. Both screens show the same three columns, so the row lives here rather
// than twice.
export function MoverRow({ symbol, name, price, changePct, showLogos = false }) {
  const up = changePct != null && changePct >= 0;
  return (
    <Link href={`/stock/${encodeURIComponent(symbol)}`} className={showLogos ? "mover-row mover-row-with-logo" : "mover-row"}>
      {showLogos && (
        // The shared logo endpoint already serves small, cached images and SVG fallbacks.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="mover-logo" src={logoUrl(symbol, 64)} alt="" width="28" height="28" loading="lazy" decoding="async" onError={blankBrokenLogo} />
      )}
      <span className="mover-sym">{symbol}</span>
      <span className="mover-price">
        {price == null ? "—" : price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </span>
      <span className={up ? "mover-chg up" : "mover-chg down"}>
        {changePct == null ? "—" : `${up ? "" : "-"}${Math.abs(changePct).toFixed(2)}%`}
      </span>
      <span className="mover-name">{name ?? ""}</span>
    </Link>
  );
}

export function MoverList({ rows, empty, showLogos = false }) {
  if (!rows.length) return <p className="trail-empty">{empty}</p>;
  return (
    <div className="mover-list">
      {rows.map((r) => (
        <MoverRow key={r.symbol} {...r} showLogos={showLogos} />
      ))}
    </div>
  );
}
