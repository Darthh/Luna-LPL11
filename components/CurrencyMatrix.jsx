"use client";

import { useEffect, useState } from "react";

// Every currency against every other over one window: read a row to see what
// that currency did against each of the others. Green is the row currency
// gaining, red is it losing, and the shade carries the size - a grid this
// dense is read by colour first and by number second.
//
// The range comes from the board above, so the matrix and the chart always
// describe the same window.

// Shades relative to the largest absolute move on the grid rather than a fixed
// scale: a quiet month and a currency crisis both need the full palette.
function cellStyle(value, peak) {
  if (value == null) return { background: "var(--chip-bg)" };
  const weight = peak > 0 ? Math.min(Math.abs(value) / peak, 1) : 0;
  const alpha = 0.1 + weight * 0.55;
  return {
    background:
      value >= 0 ? `rgba(34,197,94,${alpha.toFixed(3)})` : `rgba(246,53,56,${alpha.toFixed(3)})`,
  };
}

export default function CurrencyMatrix({ range }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/currency-matrix?range=${range}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("bad"))))
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setError(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setData(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  const fresh = data?.range === range ? data : null;
  const peak = fresh
    ? Math.max(...fresh.rows.flatMap((r) => r.cells.filter((c) => c != null).map(Math.abs)), 0)
    : 0;

  return (
    <section className="cmp-chart-card fx-matrix-card" aria-label="Currency performance">
      <h2>Currency performance</h2>
      <p className="fx-matrix-note">
        Row currency measured against the column currency, over the window the chart is set to.
      </p>

      {error ? (
        <div className="stock-chart-empty">Currency data unavailable.</div>
      ) : !fresh ? (
        <div className="stock-chart-empty">Loading rates…</div>
      ) : (
        <div className="fx-matrix-scroll">
          <table className="fx-matrix">
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">Currency</span>
                </th>
                {fresh.codes.map((c) => (
                  <th key={c} scope="col">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fresh.rows.map((row) => (
                <tr key={row.code}>
                  <th scope="row">{row.code}</th>
                  {row.cells.map((value, i) => (
                    <td key={fresh.codes[i]} style={cellStyle(value, peak)}>
                      {value == null ? "" : `${value >= 0 ? "" : "-"}${Math.abs(value).toFixed(1)}%`}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
