import { zoneColor, zoneOf, ZONES } from "@/lib/zone";
import { formatLongDate, headlineSentence } from "@/lib/fearGreedFacts";

// Server-rendered, no "use client": these numbers must exist in the initial
// HTML. Crawlers and AI fetchers read the response before any JS runs, and a
// page that says "n/a" until hydration is a page with nothing to quote or
// index. The interactive gauge and chart hydrate on top of this.
export default function SentimentSummary({ facts, heading, intro, children }) {
  if (!facts) {
    return (
      <section className="fg-summary">
        <h2>{heading}</h2>
        <p className="fg-summary-lede">
          The market sentiment reading is temporarily unavailable. Live data returns as soon as
          the upstream source responds.
        </p>
      </section>
    );
  }

  const asOfLong = formatLongDate(facts.lastDate);

  return (
    <section className="fg-summary">
      <h2>{heading}</h2>

      {/* The quotable sentence. Flat and declarative on purpose - this is the
          line an assistant lifts verbatim when asked for today's reading. */}
      <p className="fg-summary-lede">{headlineSentence(facts)}</p>

      <div className="fg-summary-reading">
        <span className="fg-summary-value" style={{ color: zoneColor(facts.current) }}>
          {facts.rounded}
        </span>
        <span className="fg-summary-zone">{facts.zone}</span>
        <span className="fg-summary-asof">as of {asOfLong}</span>
      </div>

      {intro ? <p className="fg-summary-intro">{intro}</p> : null}

      <table className="fg-summary-table">
        <caption>Recent market sentiment readings (0-100 scale)</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">Reading</th>
            <th scope="col">Sentiment</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Latest ({asOfLong})</th>
            <td>{facts.rounded}</td>
            <td>{facts.zone}</td>
          </tr>
          {facts.items.map((item) =>
            item.value == null ? null : (
              <tr key={item.label}>
                <th scope="row">{item.label}</th>
                <td>{Math.round(item.value)}</td>
                <td>{zoneOf(item.value)}</td>
              </tr>
            ),
          )}
        </tbody>
      </table>

      <p className="fg-summary-scale">
        The index runs from 0 to 100.{" "}
        {ZONES.map((z, i) => {
          const low = i === 0 ? 0 : ZONES[i - 1].max;
          return `${low}-${z.max} is ${z.label}`;
        }).join(", ")}
        .
      </p>

      {children}
    </section>
  );
}
