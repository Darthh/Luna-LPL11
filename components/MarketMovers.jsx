"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "./LanguageProvider";
import { MoverList } from "./MoverRows";
import "./MarketMovers.css";

const INDEXES = [
  { symbol: "SPY", label: "S&P 500" },
  { symbol: "QQQ", label: "Nasdaq 100" },
  { symbol: "SOXX", label: "Semiconductors" },
];
const REFRESH_MS = 60000;

// The rail's movers panel: pick an index, see the six biggest gainers and the
// six biggest losers among its constituents.
export default function MarketMovers() {
  const { t } = useLanguage();
  const [index, setIndex] = useState("SPY");
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    function load() {
      fetch(`/api/index-movers?index=${index}`)
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error("bad"))))
        .then((json) => {
          if (!cancelled) setData(json);
        })
        .catch(() => {
          if (!cancelled) setError(true);
        });
    }
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [index]);

  return (
    <div className="mover-groups market-movers-card">
      <div className="mover-tabs" role="tablist">
        {INDEXES.map(({ symbol, label }) => (
          <button
            key={symbol}
            type="button"
            role="tab"
            aria-selected={index === symbol}
            className={index === symbol ? "mover-tab active" : "mover-tab"}
            onClick={() => {
              // Cleared here rather than in the effect, so switching index
              // shows the loading line instead of the previous index's rows.
              setData(null);
              setError(false);
              setIndex(symbol);
            }}
          >
            {symbol}
            <span>{t(label)}</span>
          </button>
        ))}
      </div>

      {error && <p className="trail-empty">{t("No data")}</p>}
      {!error && !data && <p className="trail-empty">{t("Loading")}…</p>}
      {data && (
        <>
          <h3 className="mover-head up">{t("Gainers")}</h3>
          <MoverList rows={data.gainers ?? []} empty={t("No data")} showLogos />
          <h3 className="mover-head down">{t("Losers")}</h3>
          <MoverList rows={data.losers ?? []} empty={t("No data")} showLogos />
        </>
      )}
    </div>
  );
}
