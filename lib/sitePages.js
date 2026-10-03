// The retrieval corpus for Lilo AI: every place on the site worth sending
// someone, with the words they would actually use to ask for it.
//
// Twenty-odd documents do not need embeddings or a vector store. Keyword
// overlap over a hand-written `terms` list scores them well enough, runs in
// microseconds with no network call, and stays editable by whoever adds the
// next page - which an embedding index is not.
export const SITE_PAGES = [
  {
    path: "/",
    title: "Dashboard",
    blurb:
      "The home dashboard: live market sentiment, upcoming events, popular stocks, and customizable research widgets.",
    terms: "home dashboard market sentiment gauge today overview main page start",
  },
  {
    path: "/#compare-vs",
    title: "Market sentiment chart",
    blurb:
      "Chart market sentiment alongside a stock or ETF to add market context to price research.",
    terms: "market sentiment overlay stock etf ticker price context chart",
  },
  {
    // A symbol is required - "/stock" on its own is not a route, so this entry
    // carries the template and the model fills the ticker in.
    path: "/stock/AAPL",
    template: "/stock/{SYMBOL}",
    title: "Stock pages",
    blurb:
      "Price chart, profile and technicals for one company. Replace the ticker in the path with the symbol being asked about.",
    terms: "stock symbol ticker quote price chart company profile individual share",
  },
  {
    path: "/screener",
    title: "Stock screener",
    blurb: "Filter stocks by market cap, valuation, performance and technical metrics.",
    terms: "screener screen filter stocks criteria valuation scan",
  },
  {
    path: "/maps",
    title: "Stock maps",
    blurb: "Treemap and force-layout maps of the market, sized and coloured by performance.",
    terms: "map maps treemap heatmap visual market sectors performance grid",
  },
  {
    path: "/market-cap",
    title: "Companies by market cap",
    blurb: "The largest companies ranked by market capitalisation.",
    terms: "market cap capitalisation largest biggest ranking companies list top size",
  },
  {
    path: "/earnings-calendar",
    title: "Earnings calendar",
    blurb: "Which companies report earnings on which day, with implied move.",
    terms: "earnings calendar report reports date schedule upcoming quarter results implied move",
  },
  {
    path: "/13Filings",
    title: "13F Filings",
    blurb: "What institutions and hedge funds hold, quarter by quarter, from their 13F filings.",
    terms: "hedge fund funds 13f filings institutional holdings whales positions berkshire managers",
  },
  {
    path: "/supply-chain",
    title: "Supply chain",
    blurb: "Who supplies whom - a company's suppliers and customers as a flow diagram.",
    terms: "supply chain suppliers customers vendors dependencies flow partners upstream downstream",
  },
  {
    path: "/chart-metrics",
    title: "Chart metrics",
    blurb: "Plot any two fundamental metrics against each other across the market.",
    terms: "metrics scatter plot fundamentals axes valuation relationship",
  },
  {
    path: "/regression-analysis",
    title: "Regression analysis",
    blurb: "Fit a regression between sentiment, price and other series.",
    terms: "regression statistics fit correlation squared model analysis linear",
  },
  {
    path: "/portfolio-comparison",
    title: "Portfolio comparison",
    blurb: "Compare the growth of several portfolios or tickers side by side.",
    terms: "portfolio comparison growth backtest allocation returns side performance",
  },
  {
    path: "/company-world-map",
    title: "Company world map",
    blurb: "Where companies are headquartered, on a world map.",
    terms: "world map global country headquarters location geography based international",
  },
  {
    path: "/global-markets",
    title: "Global markets",
    blurb: "Live prices and normalized performance for major world indexes, volatility and commodities.",
    terms: "global markets index indexes indices prices commodities gold oil vix asia europe americas performance",
  },
  {
    path: "/rsi-le",
    title: "GEX and RSI levels",
    blurb: "Gamma exposure levels and RSI technicals for index options.",
    terms: "gex gamma exposure rsi technicals options levels strikes dealer",
  },
  {
    path: "/watchlist",
    title: "Watchlist",
    blurb: "Save the tickers you follow and get alerts on them.",
    terms: "watchlist watch save follow track list favourites",
  },
  {
    path: "/alerts",
    title: "Alerts",
    blurb: "Get notified when the index or a ticker crosses a level you set.",
    terms: "alert alerts notify notification email threshold trigger crosses level warn",
  },
];

// Words that match nearly every page carry no signal, and letting them score
// means "how is the index calculated" ranks the screener as highly as the
// methodology page.
const STOP = new Set(
  "the a an and or of to in on for is are was how what where when which do does i my me you it its with about at from by can show find get see there".split(
    " "
  )
);

const tokens = (s) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));

// How many pages each term appears on, computed once. "index" is on nearly
// every page of a financial terminal and so tells us almost nothing about which
// one to send someone to, while "13f" points at exactly one. Weighting by
// rarity (plain IDF) is what separates them; without it, a common word sitting
// in a title outvotes the rare word that actually identifies the page.
const DOC_TERMS = SITE_PAGES.map((p) => ({
  title: new Set(tokens(p.title)),
  body: new Set(tokens(`${p.terms} ${p.blurb}`)),
}));

const DF = new Map();
for (const { title, body } of DOC_TERMS) {
  for (const t of new Set([...title, ...body])) DF.set(t, (DF.get(t) || 0) + 1);
}

// Prefix match rather than equality, so "filings" finds "filing" and "charts"
// finds "chart" without dragging in a stemmer.
function weight(word) {
  let df = 0;
  for (const [term, count] of DF) {
    if (term.startsWith(word) || word.startsWith(term)) df += count;
  }
  return df ? Math.log(1 + SITE_PAGES.length / df) : 0;
}

// Scores every page against the query and returns the best few. A hit in the
// title counts double - a page named "Watchlist" should outrank one that only
// mentions watchlists in its blurb.
export function findPages(query, limit = 3) {
  const words = [...new Set(tokens(query || ""))];
  if (!words.length) return [];
  return SITE_PAGES.map((page, i) => {
    const { title, body } = DOC_TERMS[i];
    let score = 0;
    for (const w of words) {
      const hit = (set) => [...set].some((t) => t.startsWith(w) || w.startsWith(t));
      const idf = weight(w);
      if (hit(title)) score += 2 * idf;
      if (hit(body)) score += idf;
    }
    return { page, score };
  })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ page, score }) => ({
      path: page.template ?? page.path,
      title: page.title,
      blurb: page.blurb,
      score: +score.toFixed(2),
    }));
}
