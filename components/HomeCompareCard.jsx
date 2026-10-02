"use client";

import TickerInput from "@/components/TickerInput";
import { hideBrokenLogo, logoUrl } from "@/lib/companyLogo";
import { PRESETS } from "@/lib/whatIf";

// The home chart places one price series beside market sentiment, so presets that
// resolve to one tradable symbol, matching the Portfolio comparison sidebar.
const HOME_PRESETS = PRESETS.filter((preset) => preset.tickers.length === 1);

export default function HomeCompareCard({ value, activeTicker, onChange, onSubmit, error }) {
  function submit(event) {
    event.preventDefault();
    onSubmit(value);
  }

  return (
    <section className="whatif-card home-compare-card" aria-labelledby="home-compare-title">
      <div className="whatif-card-head">
        <h2 id="home-compare-title">Choose a market</h2>
      </div>

      {/* Same box the Portfolio comparison page uses: typing a letter opens the search
          suggestions, and picking one loads it straight onto the chart. */}
      <form className="whatif-custom home-compare-form" onSubmit={submit}>
        <TickerInput
          value={value}
          index={-1}
          label="Compare an index or stock"
          placeholder="Compare a index or stock."
          onChange={onChange}
          onPick={onSubmit}
        />
        <button type="submit" className="whatif-custom-add home-compare-add">
          Add
        </button>
      </form>

      {error && <p className="ticker-error">{error}</p>}

      <h3 className="whatif-subhead">Presets</h3>
      <div className="whatif-presets">
        {HOME_PRESETS.map((preset) => {
          const symbol = preset.tickers[0];
          const active = symbol === activeTicker;
          return (
            <button
              type="button"
              key={preset.label}
              className={active ? "whatif-preset on" : "whatif-preset"}
              aria-pressed={active}
              onClick={() => onSubmit(symbol)}
            >
              {/* Not every symbol resolves on the logo CDN (broad ETFs
                  especially), so a miss drops the image and the label slides
                  over rather than holding an empty square. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="home-compare-logo"
                src={logoUrl(symbol, 48)}
                alt=""
                onError={hideBrokenLogo}
              />
              <span>{preset.label}</span>
              <small>{active ? "on the chart" : preset.note}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}
