import { rsi } from "./indicators.js";

// Mirrors TradingView's built-in "RSI Strategy", the script whose order ids
// are RsiLE (long entry) and RsiSE (short entry):
//
//   length = input(14), overSold = input(30), overBought = input(70)
//   vrsi = ta.rsi(close, length)
//   if ta.crossover(vrsi, overSold)   -> strategy.entry("RsiLE", strategy.long)
//   if ta.crossunder(vrsi, overBought) -> strategy.entry("RsiSE", strategy.short)
//
// The crossing creates a market-order request at the signal bar's close.
// TradingView's default broker emulator fills it at the next bar's open.
// Default pyramiding is zero, so another entry in the current direction is
// ignored. Reversing a one-unit position trades two units, which is why the
// chart markers read +2 RsiLE and -2 RsiSE.
export const RSI_LE_LENGTH = 14;
export const RSI_LE_OVERSOLD = 30;
export const RSI_LE_OVERBOUGHT = 70;

export function rsiLeOrderRequests(closes) {
  const values = rsi(closes, RSI_LE_LENGTH);
  const requests = new Array(values.length).fill(null);

  for (let index = 1; index < values.length; index++) {
    const value = values[index];
    const previous = values[index - 1];
    // ta.crossover/ta.crossunder need two comparable bars; the RSI warm-up
    // leaves nulls that must not be read as a crossing off zero.
    if (value == null || previous == null) continue;

    if (previous <= RSI_LE_OVERSOLD && value > RSI_LE_OVERSOLD) requests[index] = 1;
    else if (previous >= RSI_LE_OVERBOUGHT && value < RSI_LE_OVERBOUGHT) requests[index] = -1;
  }

  return requests;
}

export function rsiLeSignals(closes) {
  const requests = rsiLeOrderRequests(closes);
  const fills = new Array(requests.length).fill(null);
  let position = 0;

  // A request on the final, still-open bar has no next-bar fill yet. The first
  // accepted order establishes a one-unit position and is intentionally not a
  // +/-2 reversal marker. Every later accepted opposite entry closes that one
  // unit and opens one the other way, producing TradingView's +/-2 marker.
  for (let index = 0; index < requests.length - 1; index++) {
    const direction = requests[index];
    if (!direction || direction === position) continue;

    if (position !== 0) fills[index + 1] = direction * 2;
    position = direction;
  }

  return fills;
}
