import { hashCode, mulberry32, gauss } from "./demoData";

// Plausible current-ish levels, only ever used as a per-symbol safety net
// when the live Yahoo Finance fetch fails for that instrument.
const BASE_LEVELS = {
  SPX: 6480,
  NDX: 22900,
  KOSPI: 3250,
  N225: 41500,
  VIX: 15.8,
  TSX: 29000,
  DAX: 24950,
  FTSE: 10550,
  STOXX: 5900,
  CAC: 8200,
  HSI: 24500,
  NIFTY: 26000,
  SHCOMP: 3900,
  TAIEX: 33000,
  GOLD: 3420,
  OIL: 68.5,
};

// Deterministic per-day quote so a simulated instrument doesn't jump
// around on every request, only once a day like a real market would.
export function simulatedQuote(key) {
  const day = new Date().toISOString().slice(0, 10);
  const rng = mulberry32(hashCode(`${key}:${day}`));
  const changePct = gauss(rng) * 0.9;
  const base = BASE_LEVELS[key] ?? 100;
  const price = base * (1 + changePct / 100);
  return { price, changePct };
}
