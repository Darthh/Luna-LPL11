import { hashCode, mulberry32, gauss } from "./demoData";

// Only ever used as a safety net when the live ApeWisdom fetch fails.
const CANDIDATES = [
  { ticker: "GME", name: "GameStop" },
  { ticker: "TSLA", name: "Tesla" },
  { ticker: "NVDA", name: "NVIDIA" },
  { ticker: "AMD", name: "AMD" },
  { ticker: "AAPL", name: "Apple" },
  { ticker: "PLTR", name: "Palantir Technologies" },
  { ticker: "AMC", name: "AMC Entertainment" },
  { ticker: "SPY", name: "SPDR S&P 500 ETF Trust" },
  { ticker: "SMCI", name: "Super Micro Computer" },
  { ticker: "MSTR", name: "Strategy" },
  { ticker: "COIN", name: "Coinbase" },
  { ticker: "RIVN", name: "Rivian" },
  { ticker: "MSFT", name: "Microsoft" },
  { ticker: "QQQ", name: "Invesco QQQ ETF" },
  { ticker: "META", name: "Meta Platforms" },
  { ticker: "NFLX", name: "Netflix" },
  { ticker: "SOFI", name: "SoFi Technologies" },
  { ticker: "HOOD", name: "Robinhood Markets" },
  { ticker: "NIO", name: "NIO" },
  { ticker: "BBAI", name: "BigBear.ai" },
];

// Deterministic per-day ranking so it doesn't reshuffle on every request,
// only once a day like a real "this week" tracker would settle.
export function simulatedPopularStocks() {
  const day = new Date().toISOString().slice(0, 10);
  const shuffleRng = mulberry32(hashCode(`popular-stocks:${day}`));
  const pool = CANDIDATES.map((c) => ({ ...c, sortKey: shuffleRng() })).sort((a, b) => b.sortKey - a.sortKey);
  const top = pool.slice(0, 20);

  return top.map((c, i) => {
    const rng = mulberry32(hashCode(`${c.ticker}:${day}`));
    const mentions = Math.round(60 + rng() * 700);
    const mentionChange = Math.round(gauss(rng) * 120);
    const upvotes = Math.round(mentions * (2 + rng() * 3));
    return { rank: i + 1, ticker: c.ticker, name: c.name, mentions, upvotes, mentionChange };
  });
}
