import assert from "node:assert/strict";
import { emaCrossSignals, macdSignals, openingRangeSignals, sessionVwap, vwapSignals } from "./intradaySignals.js";

const base = Date.parse("2026-09-18T13:30:00Z") / 1000;
const point = (minute, close, { high = close, low = close, volume = 100 } = {}) => ({
  t: base + minute * 60, o: close, h: high, l: low, c: close, v: volume,
});

const vwapPoints = [point(0, 100), point(1, 99), point(2, 101), point(3, 102)];
assert.deepEqual(sessionVwap(vwapPoints).map((value) => Number(value.toFixed(2))), [100, 99.5, 100, 100.5]);
assert.equal(vwapSignals(vwapPoints)[3], 2, "a VWAP reclaim fills long on the next candle");

const orbPoints = [
  point(0, 100, { high: 101, low: 99 }),
  point(5, 100, { high: 102, low: 99.5 }),
  point(10, 101, { high: 101.5, low: 100 }),
  point(15, 103, { high: 103, low: 101 }),
  point(20, 104),
];
assert.equal(openingRangeSignals(orbPoints)[4], 2, "a 15-minute opening-range breakout fills long on the next candle");

console.log("ok - VWAP and 15-minute opening-range signals use next-candle fills");

for (const [name, signal, warmupLength] of [["EMA", emaCrossSignals, 21], ["MACD", macdSignals, 34]]) {
  const warmup = Array(warmupLength).fill(100);
  for (const [price, direction] of [[110, 2], [90, -2]]) {
    const bars = [point(0, 100), point(1, price), point(2, price)];
    assert.deepEqual(signal(bars, warmup), [null, null, direction], `${name}: cross on bar 1 appears only on bar 2`);
    assert.deepEqual(signal(bars.slice(0, 2), warmup), [null, null], `${name}: final live candle has no fill`);
    assert.deepEqual(signal(bars), [null, null, null], `${name}: insufficient history is not a cross`);
    assert.deepEqual(signal([bars[0], bars[1], point(1440, price)], warmup), [null, null, null], `${name}: no overnight fills`);
    assert.deepEqual(signal([bars[0], point(1440, price), point(1441, price)], warmup), [null, null, null], `${name}: overnight price gaps are not intraday crosses`);
  }
  assert.deepEqual(signal([]), [], `${name}: empty input`);
  assert.ok(signal(Array.from({ length: 80 }, (_, i) => point(i, 100))).every((value) => value === null), `${name}: flat prices do not signal`);
  const series = Array.from({ length: 150 }, (_, i) => point(i, 100 + Math.sin(i / 8) * 5));
  const signals = signal(series);
  assert.ok(signals.includes(2) && signals.includes(-2), `${name}: both directions are detected`);
  for (let end = 1; end <= series.length; end++) {
    assert.deepEqual(signal(series.slice(0, end)), signals.slice(0, end), `${name}: later bars cannot rewrite earlier markers`);
  }
  assert.deepEqual(signal(series.slice(60), series.slice(0, 60).map((bar) => bar.c)).slice(2), signals.slice(62), `${name}: warm-up preserves alignment`);
  const gap = [...Array(40).fill(100), null, ...Array(10).fill(100)];
  assert.deepEqual(signal([point(0, 100), point(1, 110), point(2, 110)], gap), [null, null, null], `${name}: missing history requires a fresh seed`);
}
console.log("ok - EMA and MACD warm-up, direction, session boundaries, and no-look-ahead behavior");
