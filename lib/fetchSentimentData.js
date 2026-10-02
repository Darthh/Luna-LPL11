import demo from "./demoData";
import { joinByDate } from "./joinByDate";

async function demoFallback(ticker) {
  const [fgRes, pxRes] = await Promise.all([demo.fearGreed(), demo.prices(ticker)]);
  return {
    dates: fgRes.dates,
    fg: fgRes.values,
    closes: pxRes.closes,
    pxDates: pxRes.dates,
    pxCloses: pxRes.closes,
    isDemo: true,
    tickerError: null,
    asOf: null,
    indicators: null,
  };
}

export async function loadSentimentData(ticker) {
  let fgRes, pxRes;
  try {
    [fgRes, pxRes] = await Promise.all([
      fetch("/api/fear-greed").then((r) => r.json()),
      fetch(`/api/prices?ticker=${encodeURIComponent(ticker)}`).then((r) => r.json()),
    ]);
  } catch {
    return demoFallback(ticker);
  }

  if (pxRes?.error) {
    // Identified bad-ticker case: fall back to demo for both series, but
    // surface the reason so the user understands why. Plan-restricted
    // symbols (e.g. indices needing a paid Twelve Data tier) aren't
    // something the user can fix by typing a different ticker, so those
    // fall back silently instead of showing the upstream message.
    const fallback = await demoFallback(ticker);
    return { ...fallback, tickerError: pxRes.planRestricted ? null : pxRes.error };
  }

  if (fgRes?.error || !fgRes?.dates?.length || !pxRes?.dates?.length) {
    return demoFallback(ticker);
  }

  const { dates, fg, closes } = joinByDate(fgRes.dates, fgRes.values, pxRes.dates, pxRes.closes);
  if (!dates.length) {
    return demoFallback(ticker);
  }
  return {
    dates,
    fg,
    closes,
    pxDates: pxRes.dates,
    pxCloses: pxRes.closes,
    isDemo: false,
    tickerError: null,
    asOf: fgRes.asOf ?? null,
    indicators: fgRes.indicators ?? null,
  };
}
