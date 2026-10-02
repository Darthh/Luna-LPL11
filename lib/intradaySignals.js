import { ema, visibleTail } from "./indicators.js";

const FIFTEEN_MINUTES = 15 * 60;

function sessionKey(timestamp) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp * 1000));
}

function nextBarFills(requests) {
  const fills = new Array(requests.length).fill(null);
  for (let index = 0; index < requests.length - 1; index++) {
    if (requests[index]) fills[index + 1] = requests[index] * 2;
  }
  return fills;
}

// Warm-up closes seed the averages; only visible, same-session bars can
// request and receive a marker. A final live candle cannot create a fill.
function intradayCrossFills(points, fast, slow) {
  const fills = new Array(points.length).fill(null);
  const sessions = points.map((point) => sessionKey(point.t));
  for (let index = 1; index < points.length - 1; index++) {
    if (sessions[index - 1] !== sessions[index] || sessions[index] !== sessions[index + 1]) continue;
    if (![fast[index - 1], slow[index - 1], fast[index], slow[index]].every(Number.isFinite)) continue;
    if (fast[index - 1] <= slow[index - 1] && fast[index] > slow[index]) fills[index + 1] = 2;
    else if (fast[index - 1] >= slow[index - 1] && fast[index] < slow[index]) fills[index + 1] = -2;
  }
  return fills;
}

export function emaCrossSignals(points, warmup = []) {
  const closes = [...warmup, ...points.map((point) => point.c)];
  return intradayCrossFills(points, visibleTail(ema(closes, 9), points.length), visibleTail(ema(closes, 21), points.length));
}

export function macdSignals(points, warmup = []) {
  const closes = [...warmup, ...points.map((point) => point.c)];
  const fast = ema(closes, 12);
  const slow = ema(closes, 26);
  const macd = fast.map((value, index) => value == null || slow[index] == null ? null : value - slow[index]);
  return intradayCrossFills(points, visibleTail(macd, points.length), visibleTail(ema(macd, 9), points.length));
}

export function sessionVwap(points) {
  const values = new Array(points.length).fill(null);
  let activeSession = null;
  let priceVolume = 0;
  let volume = 0;

  points.forEach((point, index) => {
    const key = sessionKey(point.t);
    if (key !== activeSession) {
      activeSession = key;
      priceVolume = 0;
      volume = 0;
    }
    const weight = Math.max(0, Number(point.v) || 0);
    const typicalPrice = (point.h + point.l + point.c) / 3;
    priceVolume += typicalPrice * weight;
    volume += weight;
    values[index] = volume > 0 ? priceVolume / volume : point.c;
  });

  return values;
}

export function vwapSignals(points) {
  const vwap = sessionVwap(points);
  const requests = new Array(points.length).fill(null);
  for (let index = 1; index < points.length; index++) {
    if (sessionKey(points[index].t) !== sessionKey(points[index - 1].t)) continue;
    if (points[index - 1].c <= vwap[index - 1] && points[index].c > vwap[index]) requests[index] = 1;
    else if (points[index - 1].c >= vwap[index - 1] && points[index].c < vwap[index]) requests[index] = -1;
  }
  return nextBarFills(requests);
}

export function openingRangeSignals(points) {
  const requests = new Array(points.length).fill(null);
  let activeSession = null;
  let openedAt = null;
  let high = null;
  let low = null;
  let brokeHigh = false;
  let brokeLow = false;

  points.forEach((point, index) => {
    const key = sessionKey(point.t);
    if (key !== activeSession) {
      activeSession = key;
      openedAt = point.t;
      high = point.h;
      low = point.l;
      brokeHigh = false;
      brokeLow = false;
      return;
    }
    if (point.t < openedAt + FIFTEEN_MINUTES) {
      high = Math.max(high, point.h);
      low = Math.min(low, point.l);
      return;
    }
    const previous = points[index - 1];
    if (!brokeHigh && previous.c <= high && point.c > high) {
      requests[index] = 1;
      brokeHigh = true;
    } else if (!brokeLow && previous.c >= low && point.c < low) {
      requests[index] = -1;
      brokeLow = true;
    }
  });

  return nextBarFills(requests);
}
