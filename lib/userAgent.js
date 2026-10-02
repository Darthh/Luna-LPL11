// The two User-Agent strings this app sends upstream. Both used to be pasted
// into every file that fetched something - eight copies of two strings.
//
// There are two rather than one because the upstreams disagree about what a
// browser looks like. Yahoo's and ApeWisdom's JSON endpoints only care that
// the UA isn't a bare fetch() default (they answer that with a 429), so the
// short form is enough. The pages that get scraped for HTML - stockanalysis,
// MarketBeat, Nasdaq, and the issuers' holdings files at BlackRock, iShares
// and Vanguard - check for a full browser UA and serve a shell or a block
// page without one. Don't collapse these into a single constant without
// checking all of those still answer.
export const YAHOO_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// A third, because the SEC asks the opposite of everyone above: EDGAR's access
// policy wants a declared application and a contact address, and throttles or
// blocks requests that arrive wearing a browser string instead.
// https://www.sec.gov/os/webmaster-faq#developers
export const SEC_USER_AGENT = "Luna Terminal lunaterminal.com (contact@lunaterminal.com)";
