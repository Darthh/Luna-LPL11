// The tickers the GEX heatmap and 0DTE history are offered for. Everything
// that gates a symbol - both API routes and the RsiLE button row - reads this
// list, so adding a ticker is one edit here.
export const GEX_SYMBOLS = ["SPY", "QQQ", "SOXX", "DRAM"];

export function netGexPercentChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / Math.abs(previous) * 100;
}

const SQRT_TWO_PI = Math.sqrt(2 * Math.PI);
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

function normalDensity(value) {
  return Math.exp(-0.5 * value * value) / SQRT_TWO_PI;
}

function optionGamma({ spot, strike, volatility, expiresAt, now = Date.now() / 1000, rate = 0.043 }) {
  if (!(spot > 0) || !(strike > 0) || !(volatility > 0)) return 0;
  // Yahoo expiration timestamps point to the start of the expiration date.
  // Adding twenty hours approximates the US market close without introducing
  // a timezone dependency into this small calculation.
  const years = Math.max((expiresAt + 20 * 3600 - now) / SECONDS_PER_YEAR, 1 / (365 * 24));
  const rootTime = Math.sqrt(years);
  const d1 = (Math.log(spot / strike) + (rate + 0.5 * volatility ** 2) * years) / (volatility * rootTime);
  return normalDensity(d1) / (spot * volatility * rootTime);
}

export function buildGexRows({ calls = [], puts = [], spot, expiresAt, now }) {
  const byStrike = new Map();
  const add = (contract, side) => {
    const strike = Number(contract.strike);
    if (!(strike > 0)) return;
    const row = byStrike.get(strike) || {
      strike,
      callGex: 0,
      putGex: 0,
      callVolume: 0,
      putVolume: 0,
      callOpenInterest: 0,
      putOpenInterest: 0,
    };
    const openInterest = Math.max(0, Number(contract.openInterest) || 0);
    const volume = Math.max(0, Number(contract.volume) || 0);
    const gamma = optionGamma({
      spot,
      strike,
      volatility: Number(contract.impliedVolatility) || 0,
      expiresAt,
      now,
    });
    // Dollar gamma for a 1% move: gamma × contracts × multiplier × S² × 1%.
    const exposure = gamma * openInterest * 100 * spot * spot * 0.01;
    row[`${side}Gex`] += exposure;
    row[`${side}Volume`] += volume;
    row[`${side}OpenInterest`] += openInterest;
    byStrike.set(strike, row);
  };
  calls.forEach((contract) => add(contract, "call"));
  puts.forEach((contract) => add(contract, "put"));

  return [...byStrike.values()]
    .map((row) => ({
      ...row,
      netGex: row.callGex - row.putGex,
      totalVolume: row.callVolume + row.putVolume,
      totalOpenInterest: row.callOpenInterest + row.putOpenInterest,
    }))
    .sort((a, b) => b.strike - a.strike);
}
