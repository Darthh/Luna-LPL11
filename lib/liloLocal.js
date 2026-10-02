// Lilo's local brain: answers built from this site's own data, with no API key
// and no model behind them.
//
// This is the whole assistant by default. The Claude route is an optional
// upgrade layered on top (see app/api/ai-chat/route.js) - when no key is
// configured, or the key is rejected, everything here still works, because
// none of it depends on that call.
//
// What it can do is deliberately narrow: point at the right page, read out the
// current sentiment reading, and quote a ticker. Those are the three things
// people actually ask a widget in the corner, and all three are answerable
// from data the site already serves.
import { fetchFearGreed } from "@/lib/fearGreed";
import { fetchYahooQuotes } from "@/lib/yahooQuote";
import { nearestValue, daysAgoIso, yearsAgoIso, zoneOf } from "@/lib/zone";
import { findPages } from "@/lib/sitePages";
import { extractSymbols, renderAnswer } from "@/lib/liloText";

export { extractSymbols, renderAnswer };

const SENTIMENT = /\b(fear|greed|sentiment|index|mood|nervous|panic|bullish|bearish)\b/i;
const PRICE = /\b(price|quote|trading|worth|cost|value|at now|how much|doing|up|down)\b/i;

// "Where/how do I..." is a navigation question even when it also names a
// ticker, because the answer is a link either way.
const NAVIGATION = /\b(where|how do i|how can i|find|show me|take me|navigate|page|section|tool|link)\b/i;

function pctWord(now, then) {
  if (then == null) return null;
  const diff = now - then;
  if (Math.abs(diff) < 1) return "about the same as";
  return `${Math.abs(Math.round(diff))} points ${diff > 0 ? "higher" : "lower"} than`;
}

async function sentimentAnswer() {
  const data = await fetchFearGreed().catch(() => null);
  const dates = data?.dates ?? [];
  const values = data?.values ?? [];
  if (!values.length) return null;

  const i = values.length - 1;
  const score = Math.round(values[i]);
  const asOf = dates[i];
  const month = nearestValue(dates, values, daysAgoIso(asOf, 30));
  const year = nearestValue(dates, values, yearsAgoIso(asOf, 1));

  const parts = [
    `The market sentiment reading is **${score} (${zoneOf(score)})** as of ${asOf}.`,
  ];
  const vsMonth = pctWord(score, month?.value);
  const vsYear = pctWord(score, year?.value);
  if (vsMonth) parts.push(`That is ${vsMonth} a month ago (${Math.round(month.value)}).`);
  if (vsYear) parts.push(`A year ago it was ${Math.round(year.value)}.`);

  return {
    text: parts.join(" "),
    pages: findPages("market sentiment today reading dashboard", 2),
  };
}

async function quoteAnswer(symbols) {
  const quotes = await fetchYahooQuotes(symbols).catch(() => []);
  const hits = symbols
    .map((symbol, i) => ({ symbol, q: quotes[i] }))
    .filter(({ q }) => q && Number.isFinite(q.price));
  if (!hits.length) return null;

  const text = hits
    .map(({ symbol, q }) => {
      const move = q.changePct >= 0 ? "up" : "down";
      return `**${q.name || symbol}** (${symbol}) is at ${q.price.toFixed(2)} ${q.currency || ""}`.trim() +
        `, ${move} ${Math.abs(q.changePct).toFixed(2)}% today.`;
    })
    .join(" ");

  // The stock page for the first real symbol is where they can see the chart.
  return { text, pages: [{ path: `/stock/${hits[0].symbol}`, title: `${hits[0].symbol} chart` }] };
}

function navigationAnswer(question) {
  const pages = findPages(question, 3);
  if (!pages.length) return null;
  const [best] = pages;
  // Three links dilute the answer when only the first one fits - a hedge-fund
  // question that also offers the stock game reads like a guess. Anything
  // scoring well below the best match is dropped rather than padded in.
  const strong = pages.filter((p) => p.score >= best.score * 0.6);
  return {
    text: `${best.blurb} You can find it here:`,
    pages: strong,
  };
}

// Answers a question from local data alone. Returns null when nothing here
// applies, which is the signal to fall through to the model (or, with no key,
// to say plainly that it cannot answer rather than inventing something).
export async function answerLocally(question) {
  const q = String(question || "").trim();
  if (!q) return null;

  const wantsNav = NAVIGATION.test(q);
  const symbols = extractSymbols(q);

  // A navigation question is answered with a link even if it mentions a
  // ticker - "where do I see NVDA's chart" wants the page, not the price.
  if (wantsNav) {
    const nav = navigationAnswer(q);
    if (nav) return nav;
  }

  if (SENTIMENT.test(q) && !symbols.length) {
    const sentiment = await sentimentAnswer();
    if (sentiment) return sentiment;
  }

  if (symbols.length && (PRICE.test(q) || !wantsNav)) {
    const quote = await quoteAnswer(symbols);
    if (quote) return quote;
  }

  if (SENTIMENT.test(q)) {
    const sentiment = await sentimentAnswer();
    if (sentiment) return sentiment;
  }

  return navigationAnswer(q);
}
