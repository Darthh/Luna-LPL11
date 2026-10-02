// Yahoo's search ranks on text relevance, so typing "micr" puts an OTC shell
// called MICRON SOLUTIONS above Micron Technology. Nobody searching four
// letters means the shell, so results are re-ordered by where they trade:
// the big boards first, then the smaller ones, then everything else (OTC,
// pink sheets, foreign listings). Order inside a tier is left as Yahoo had
// it, which is still the best relevance signal available here.
const TIERS = [
  ["NasdaqGS", "NYSE", "NYSEArca", "NYSE Arca", "NYSE American", "AMEX", "Cboe BZX", "BATS"],
  ["NasdaqGM", "NasdaqCM", "Nasdaq", "NYSEAmerican"],
];

export function exchangeTier(exchange) {
  const name = (exchange ?? "").trim();
  const index = TIERS.findIndex((tier) => tier.some((e) => e.toLowerCase() === name.toLowerCase()));
  return index === -1 ? TIERS.length : index;
}

// Yahoo has no market cap in the search payload, so "biggest first" is
// approximated from what a quote does carry. Typing "NVDA" pulls in a shelf of
// derivative products - NVDL, NVYY, NVDW, YNVD.NE - that are levered or
// income ETFs written on the company rather than the company. Those lose to
// the operating business on three signals, in order:
//   1. an exact symbol match is what was typed, so it leads;
//   2. a bare symbol outranks a suffixed foreign line (YNVD.NE), which is a
//      cross-listing or a local wrapper either way;
//   3. a plain listing outranks a derivative wrapper on the same name;
//   4. an operating company outranks an ETF written on it - typing "GOOG"
//      should not put a themed basket above Alphabet's own second line.
// Then the exchange tier, then Yahoo's own relevance (its `score` is a
// popularity weight, and the search payload carries no market cap - getting a
// true one would cost a quote call per row on every keystroke).
// Bounded, and deliberately narrow: bare "long"/"short"/"income" appear in
// plenty of operating-company names, so only wrapper-specific wording counts.
const DERIVATIVE =
  /\b(\d+x|inverse|leveraged|yieldboost|yieldmax|weeklypay|autocallable|covered call|daily)\b/i;

function isDerivative(r) {
  return r.type === "ETF" && DERIVATIVE.test(r.name ?? "");
}

// Stable: equal ranks keep the order they came in.
export function rankQuotes(results, query = "") {
  const q = query.trim().toUpperCase();
  return results
    .map((r, i) => ({
      r,
      i,
      exact: q && r.symbol.toUpperCase() === q ? 0 : 1,
      derivative: isDerivative(r) ? 1 : 0,
      fund: r.type === "ETF" ? 1 : 0,
      suffixed: r.symbol.includes(".") ? 1 : 0,
      tier: exchangeTier(r.exchange),
    }))
    .sort(
      (a, b) =>
        a.exact - b.exact ||
        a.suffixed - b.suffixed ||
        a.derivative - b.derivative ||
        a.fund - b.fund ||
        a.tier - b.tier ||
        a.i - b.i
    )
    .map((x) => x.r);
}
