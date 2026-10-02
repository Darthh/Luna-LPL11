import { TICKER_TAPE_INSTRUMENTS } from "@/lib/tickerTapeInstruments";
import { simulatedQuote } from "@/lib/tickerTapeDemo";
import { fetchYahooQuote } from "@/lib/yahooQuote";

export const revalidate = 60;

async function fetchQuote(inst) {
  const quote = await fetchYahooQuote(inst.symbol);
  if (quote) {
    return {
      key: inst.key,
      symbol: inst.symbol,
      label: inst.label,
      price: quote.price,
      changePct: quote.changePct,
      live: true,
    };
  }
  const { price, changePct } = simulatedQuote(inst.key);
  return { key: inst.key, symbol: inst.symbol, label: inst.label, price, changePct, live: false };
}

export async function GET() {
  const quotes = await Promise.all(TICKER_TAPE_INSTRUMENTS.map(fetchQuote));
  const isDemo = quotes.every((q) => !q.live);
  return Response.json(
    { quotes, isDemo },
    // Demo output is a fallback for a failed upstream - caching it would pin
    // fake quotes at the edge long after the feed recovers.
    { headers: { "Cache-Control": isDemo ? "no-store" : "public, s-maxage=60, stale-while-revalidate=300" } }
  );
}
