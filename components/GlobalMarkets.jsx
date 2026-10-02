"use client";

import { useEffect, useState } from "react";
import { TICKER_TAPE_INSTRUMENTS } from "@/lib/tickerTapeInstruments";
import { useLanguage } from "./LanguageProvider";

// Global markets and commodities as a live table. The full Global Markets
// page reuses this beside its normalized performance comparison.
//
// The same /api/ticker-tape feed the marquee uses. Sections come from each
// instrument's `kind`, so adding one to lib/tickerTapeInstruments.js puts it in
// the right block with no change here.
const SECTIONS = [
  ["index", "Global Markets"],
  ["commodity", "Commodities"],
];

// Matches the route's own cache, so asking more often re-reads the same numbers.
const REFRESH_MS = 60_000;

const fmtPrice = (n) =>
  typeof n === "number"
    ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";

const fmtPct = (n) => (typeof n === "number" ? `${n >= 0 ? "+" : ""}${n.toFixed(2)}%` : "—");

export default function GlobalMarkets() {
  const { t } = useLanguage();
  const [quotes, setQuotes] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/ticker-tape");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setQuotes(data.quotes ?? []);
      } catch {
        // A failed refresh leaves the last good numbers on screen rather than
        // blanking the table - stale quotes beat no quotes.
      }
    }

    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Rendered from the static instrument list before the first fetch lands, so
  // the table has its labels and full height immediately and only the numbers
  // fill in.
  const byKey = new Map((quotes ?? []).map((q) => [q.key, q]));

  return (
    <div className="gmkt">
      {SECTIONS.map(([kind, title]) => {
        const rows = TICKER_TAPE_INSTRUMENTS.filter((i) => i.kind === kind);
        if (!rows.length) return null;
        return (
          <section key={kind}>
            <h3>{t(title)}</h3>
            <table className="gmkt-table">
              <thead>
                <tr>
                  <th scope="col">{t("Name")}</th>
                  <th scope="col" className="num">
                    {t("Price")}
                  </th>
                  <th scope="col" className="num">
                    %
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((inst) => {
                  const q = byKey.get(inst.key);
                  // Sign drives the colour, and zero is neither - a flat market
                  // painted green reads as a gain that did not happen.
                  const dir = !q ? "" : q.changePct > 0 ? "up" : q.changePct < 0 ? "down" : "flat";
                  return (
                    <tr key={inst.key}>
                      <th scope="row">
                        {inst.flagCode ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`https://flagcdn.com/w20/${inst.flagCode}.png`}
                            alt=""
                            width="16"
                            height="12"
                            loading="lazy"
                          />
                        ) : (
                          <span className="gmkt-emoji" aria-hidden="true">
                            {inst.emoji}
                          </span>
                        )}
                        <span>{inst.label}</span>
                      </th>
                      <td className="num">{fmtPrice(q?.price)}</td>
                      <td className={`num ${dir}`}>{fmtPct(q?.changePct)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
