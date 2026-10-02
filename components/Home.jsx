"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DataPanel from "@/components/DataPanel";
import AddWidget from "@/components/AddWidget";
import { MAX_WIDGETS, WIDGETS } from "@/lib/dashboardWidgets";
import { useDashboard } from "@/components/DashboardProvider";
import HomeCompareCard from "@/components/HomeCompareCard";
import ChartPanel from "@/components/ChartPanel";
import FearGreedGauge from "@/components/FearGreedGauge";
import FearGreedIndicators from "@/components/FearGreedIndicators";
import FearGreedAlertButton from "@/components/FearGreedAlertButton";
import { useTheme } from "@/components/PageChrome";
import { loadSentimentData } from "@/lib/fetchSentimentData";
import { rangeStartIndex } from "@/lib/zone";
import { fearGreedFacts } from "@/lib/fearGreedFacts";
import { joinByDate } from "@/lib/joinByDate";
import { CHART_METRICS } from "@/lib/chartMetrics";
import { computeRSI } from "@/lib/rsi";
import AIWorkspace from "@/components/AIWorkspace";

// `initialFg` is the index series the server already fetched and rendered. It
// seeds the state so the gauge paints a real number in the server HTML instead
// of "n/a"; the effect below still refreshes prices (and the index) on mount.
// `defaultTicker` lets the per-ticker comparison pages open on their own symbol.
export default function Home({ initialFg = null, defaultTicker = "SPY" }) {
  const theme = useTheme();
  const [ticker, setTicker] = useState(defaultTicker);
  const [tickerInputValue, setTickerInputValue] = useState(defaultTicker);
  const [range, setRange] = useState("1y");
  const [dates, setDates] = useState(initialFg?.dates ?? []);
  const [fg, setFg] = useState(initialFg?.values ?? []);
  const [closes, setCloses] = useState([]);
  const [pxRaw, setPxRaw] = useState({ dates: [], closes: [] });
  const [loading, setLoading] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [tickerError, setTickerError] = useState(null);
  const [asOf, setAsOf] = useState(initialFg?.asOf ?? null);
  const [indicators, setIndicators] = useState(initialFg?.indicators ?? null);
  const [metric, setMetric] = useState("fg");

  const handleLoad = useCallback(async (t) => {
    const nextTicker = t.trim().toUpperCase();
    if (!nextTicker) return;
    setTickerInputValue(nextTicker);
    setLoading(true);
    try {
      const result = await loadSentimentData(nextTicker);
      setDates(result.dates);
      setFg(result.fg);
      setCloses(result.closes);
      setIsDemo(result.isDemo);
      setTickerError(result.tickerError);
      setAsOf(result.asOf);
      setIndicators(result.indicators);
      setPxRaw({ dates: result.pxDates ?? [], closes: result.pxCloses ?? [] });
      setTicker(nextTicker);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    handleLoad(defaultTicker);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sub-indicator series aren't available in demo mode; fall back to the
  // composite index without persisting over the user's actual selection.
  // RSI is computed from the loaded ticker's own price history (not an index
  // sub-indicator), so it's exempt from that fallback.
  const effectiveMetric = indicators || metric === "fg" || metric === "rsi_14" ? metric : "fg";

  const { visibleDates, visibleFg, visiblePx } = useMemo(() => {
    const i0 = rangeStartIndex(dates, range);
    const visibleDates = dates.slice(i0);
    const visibleFg = fg.slice(i0);
    const visiblePx = closes.slice(i0);
    return {
      visibleDates,
      visibleFg,
      visiblePx,
    };
  }, [dates, fg, closes, range]);

  // The main chart can plot any sub-indicator instead of the composite
  // index; those series aren't pre-joined against price like fg/closes are,
  // so re-join the selected one against the raw (unjoined) price series.
  const { chartDates, chartMetricValues, chartPx } = useMemo(() => {
    if (effectiveMetric === "fg") {
      return { chartDates: visibleDates, chartMetricValues: visibleFg, chartPx: visiblePx };
    }
    if (effectiveMetric === "rsi_14") {
      // RSI needs ~14 days of prior closes to warm up, so compute it over the
      // full unfiltered price history before slicing to the visible range.
      const rsiValues = computeRSI(pxRaw.closes, 14);
      const i0 = rangeStartIndex(pxRaw.dates, range);
      return {
        chartDates: pxRaw.dates.slice(i0),
        chartMetricValues: rsiValues.slice(i0),
        chartPx: pxRaw.closes.slice(i0),
      };
    }
    const active = indicators?.[effectiveMetric];
    if (!active?.dates?.length) {
      return { chartDates: [], chartMetricValues: [], chartPx: [] };
    }
    const joined = joinByDate(active.dates, active.values, pxRaw.dates, pxRaw.closes);
    const i0 = rangeStartIndex(joined.dates, range);
    return {
      chartDates: joined.dates.slice(i0),
      chartMetricValues: joined.fg.slice(i0),
      chartPx: joined.closes.slice(i0),
    };
  }, [effectiveMetric, indicators, pxRaw, range, visibleDates, visibleFg, visiblePx]);

  // Same derivation the server-rendered summary uses, so the gauge and the
  // indexable text on the page can never quote different numbers.
  const gaugeHistory = useMemo(
    () => fearGreedFacts(dates, fg) ?? { current: null, delta: null, lastDate: null, items: [] },
    [dates, fg],
  );

  // The arrangement lives in DashboardProvider, because the navigation rail
  // toggles panels too and two copies of this state would let the rail
  // highlight what the dashboard is not showing.
  const { layout, add, remove, resize } = useDashboard();

  // The four widgets fed by this page's own state rather than fetching for
  // themselves. Built here so the panel wrapper below is the same for every
  // widget, local or dynamic.
  const localWidgets = {
    gauge: (
      <div className="gauge-wrap" id="fear-greed">
        <FearGreedGauge
          value={gaugeHistory.current}
          delta={gaugeHistory.delta}
          asOf={asOf}
          fallbackDate={gaugeHistory.lastDate}
          history={gaugeHistory.items}
        />
      </div>
    ),
    chart: (
      <div className="chart-with-compare">
        {/* The picker sits beside the chart it feeds rather than in a panel of
            its own: choosing a ticker only means anything as a change to this
            chart, and the chart is what you were reading when you decided to
            change it. */}
        <HomeCompareCard
          value={tickerInputValue}
          onChange={setTickerInputValue}
          activeTicker={ticker}
          onSubmit={handleLoad}
          error={tickerError}
        />
        <ChartPanel
          labels={chartDates}
          fgData={chartMetricValues}
          pxData={chartPx}
          metrics={CHART_METRICS}
          activeMetric={effectiveMetric}
          onMetricChange={setMetric}
          metricsEnabled={!!indicators}
          ticker={ticker}
          tickerName={ticker}
          range={range}
          onRangeChange={setRange}
          fill={false}
          logScale={false}
          showStock
          loading={loading}
          isDemo={isDemo}
          theme={theme}
        />
      </div>
    ),
    indicators: <FearGreedIndicators indicators={indicators} theme={theme} />,
  };

  return (
    <>
      <div className="dash-bar">
        <AddWidget layout={layout} onAdd={add} />
        <span className="dash-count">
          {layout.length} / {MAX_WIDGETS}
        </span>
      </div>

      <div className="dgrid home-grid">
        {layout.map(({ id, span, rows }) => {
          const widget = WIDGETS[id];
          if (!widget) return null;
          const { Component } = widget;
          return (
            <DataPanel
              key={id}
              id={`home-${id}`}
              title={id === "chart" ? `Market sentiment and ${ticker}` : widget.label}
              span={span}
              actions={id === "chart" ? <FearGreedAlertButton /> : null}
              rows={rows ?? 1}
              onResize={(size) => resize(id, size)}
              onClose={() => remove(id)}
            >
              {Component ? <Component /> : localWidgets[id]}
            </DataPanel>
          );
        })}

        {layout.length === 0 && (
          <AIWorkspace />
        )}
      </div>
    </>
  );
}
