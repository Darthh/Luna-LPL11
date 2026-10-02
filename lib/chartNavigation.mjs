export function priceTickStep(span, pixels) {
  const rough = Math.max(.01, span / Math.max(2, pixels / 38));
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 && magnitude >= .1 ? 2.5 : normalized <= 5 ? 5 : 10;
  // GEX RsiLE ETF prices are quoted in cents, including at maximum magnification.
  return Math.max(.01, Math.ceil(factor * magnitude * 100 - 1e-9) / 100);
}

export function priceBounds(low, high, scale, offset) {
  const rawSpan = Math.max(high - low, .02);
  const span = (rawSpan + Math.max(rawSpan * .14, .02)) * scale;
  const center = (low + high) / 2 + offset;
  return { min: center - span / 2, max: center + span / 2 };
}

export function wheelPixels(delta, mode, height) {
  return delta * (mode === 1 ? 16 : mode === 2 ? height : 1);
}

export function zoomViewport(current, delta, anchor = 1) {
  const count = Math.max(5, Math.min(Math.max(5, current.total * 2), current.count * Math.exp(Math.max(-240, Math.min(240, delta)) * .002)));
  const focus = current.start + anchor * Math.max(current.count - 1, 1);
  return { ...current, count, start: focus - anchor * (count - 1) };
}
