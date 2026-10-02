"use client";

import Link from "next/link";

// One quote row, shared by the two rail panels that rank tickers by percent
// move. Both screens show the same three columns, so the row lives here rather
// than twice.
export function MoverRow({ symbol, name, price, changePct }) {
  const up = changePct != null && changePct >= 0;
  return (
    <Link href={`/stock/${encodeURIComponent(symbol)}`} className="mover-row">
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

export function MoverList({ rows, empty }) {
  if (!rows.length) return <p className="trail-empty">{empty}</p>;
  return (
    <div className="mover-list">
      {rows.map((r) => (
        <MoverRow key={r.symbol} {...r} />
      ))}
    </div>
  );
}
