export function hashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h >>> 0;
}

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gauss(rng) {
  return (rng() + rng() + rng() + rng() - 2) / 2;
}

const TOTAL_DAYS = 1900; // ~5 years of calendar days, before weekends are filtered out

const demo = (() => {
  // one shared market sentiment series
  const fgRng = mulberry32(20260711);
  const dates = [];
  const fg = [];
  const today = new Date();
  let x = 62;
  for (let i = TOTAL_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (d.getDay() === 0 || d.getDay() === 6) continue; // trading days only
    // mean-reverting walk with occasional regime shocks
    x += 0.06 * (52 - x) + gauss(fgRng) * 4.2;
    if (fgRng() < 0.012) x += (fgRng() < 0.5 ? -1 : 1) * (12 + fgRng() * 14);
    x = Math.max(2, Math.min(97, x));
    dates.push(d.toISOString().slice(0, 10));
    fg.push(Math.round(x * 10) / 10);
  }

  const priceCache = {};
  function buildPrices(ticker) {
    const seed = hashCode(ticker.toUpperCase());
    const rng = mulberry32(seed);
    const base =
      { SPY: 610, QQQ: 540, AAPL: 235, NVDA: 145, MU: 100, AMZN: 230 }[
        ticker.toUpperCase()
      ] ?? 40 + rng() * 400;
    const vol =
      { SPY: 0.009, QQQ: 0.012, MU: 0.024 }[ticker.toUpperCase()] ?? 0.014 + rng() * 0.012;
    const drift = 0.00025 + rng() * 0.0006;
    const beta = 0.25 + rng() * 0.5; // sensitivity to sentiment swings
    let p = base * (0.82 + rng() * 0.1);
    const closes = [];
    for (let i = 0; i < fg.length; i++) {
      const fgDelta = i > 0 ? (fg[i] - fg[i - 1]) / 100 : 0;
      p *= 1 + drift + vol * gauss(rng) + beta * fgDelta * 0.6;
      closes.push(Math.round(p * 100) / 100);
    }
    return closes;
  }

  return {
    fearGreed: async () => ({ dates: [...dates], values: [...fg] }),
    prices: async (ticker) => {
      const key = ticker.toUpperCase();
      priceCache[key] ??= buildPrices(key);
      return { dates: [...dates], closes: [...priceCache[key]] };
    },
  };
})();

export default demo;
