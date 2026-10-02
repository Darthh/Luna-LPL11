// The pure half of Lilo's local answers: recognising a ticker in a sentence
// and turning a finished answer into Markdown. Split from liloLocal.js purely
// so it can be unit-tested - everything here is string in, string out, with no
// feed to fetch and no "@/lib" alias in its import chain for node to trip on.

// Tickers are recognised by shape, then confirmed against the quote feed by
// the caller. A bare uppercase word is a weak signal - "CEO" and "ETF" look
// exactly like symbols - so nothing is claimed until a real price comes back.
const CASHTAG = /\$([A-Za-z][A-Za-z.\-]{0,9})\b/g;
// Two letters minimum. One-letter tickers are real (F, T, X) but a bare "P" or
// "E" is far more often a word fragment - "what is a P/E ratio" quoted Everpure
// and Eni before this lower bound existed. A cashtag still reaches them,
// because "$F" is unambiguous about what it means.
const BARE = /\b([A-Z]{2,5})\b/g;

// Words that are shaped like tickers but are almost never meant as one here.
const NOT_TICKERS = new Set(
  "A I AI THE AND FOR ARE HOW WHAT WHERE WHEN WHY CEO ETF IPO GDP CPI FED SEC EPS PE ROI YTD USD EU US UK AM PM OK NO YES ALL ANY NEW TOP BUY SELL RSI GEX API CSV JSON URL FAQ VS".split(
    " "
  )
);

export function extractSymbols(text, limit = 3) {
  const found = [];
  // A cashtag is explicit - the user typed the $, so case does not matter and
  // the stop list does not apply.
  for (const m of String(text).matchAll(CASHTAG)) found.push(m[1].toUpperCase());
  for (const m of String(text).matchAll(BARE)) {
    if (!NOT_TICKERS.has(m[1])) found.push(m[1]);
  }
  return [...new Set(found)].slice(0, limit);
}

// Renders an answer as the Markdown the widget already knows how to display.
export function renderAnswer(answer) {
  if (!answer) return "";
  const links = (answer.pages ?? [])
    // An unfilled template would render as a link to a literal "{SYMBOL}".
    .filter((p) => !p.path.includes("{"))
    .map((p) => `[${p.title}](${p.path})`);
  return links.length ? `${answer.text}\n\n${links.join(" · ")}` : answer.text;
}
