// ETF constituent list, shared by the holdings wheel on the stock page and by
// the fund-backed stock maps. Primary source is stockanalysis.com's holdings
// table (top 25 by weight, embedded in the page as a JS literal); falls back
// to Yahoo's topHoldings module (top 10) when that scrape fails.
import { yahooSession } from "./symbolProfile";
import { BROWSER_USER_AGENT } from "./userAgent";
import { indexHoldingTracker } from "./indexHoldings";

// stockanalysis writes US tickers as "$AAPL" and every foreign listing as
// "!exchange/code" (e.g. "!tpe/2330"), which is meaningless to Yahoo and to
// the logo CDN - international funds used to render a column of unusable
// "!krx/005930" strings with no logo. These are the Yahoo suffixes for the
// exchanges that show up across the big international funds; anything not
// listed here (Bursa Malaysia and Abu Dhabi are the notable ones, which Yahoo
// indexes by a different code entirely) keeps its bare code and stays
// unlinked rather than pointing at a ticker that doesn't resolve.
const YAHOO_SUFFIX = {
  ams: "AS", asx: "AX", bit: "MI", bkk: "BK", bme: "MC", bmv: "MX", bom: "BO",
  bvmf: "SA", cph: "CO", ebr: "BR", eli: "LS", epa: "PA", etr: "DE", hel: "HE",
  hkg: "HK", idx: "JK", ist: "IS", jse: "JO", krx: "KS", lon: "L", nse: "NS",
  nze: "NZ", osl: "OL", qse: "QA", sgx: "SI", sha: "SS", she: "SZ", snse: "SN",
  sto: "ST", swx: "SW", tadawul: "SR", tlv: "TA", tpe: "TW", tpex: "TWO",
  tsx: "TO", tsxv: "V", tyo: "T", vie: "VI", wse: "WA", otc: "",
};

// → { symbol, code }: `symbol` is a Yahoo-resolvable ticker (null when the
// exchange isn't mapped), `code` is what to print in the ticker column.
function normalizeHoldingSymbol(raw) {
  const foreign = /^!([a-z0-9]+)\/(.+)$/.exec(raw);
  if (!foreign) {
    // A "$" marks a US ticker, whose share classes are dotted here and dashed
    // at Yahoo (BRK.B → BRK-B; neither Yahoo nor the logo CDN answers to the
    // dotted form). Rows written without either marker are already in Yahoo's
    // own notation, suffix and all, so they're left alone.
    const us = raw.startsWith("$");
    const plain = raw.slice(us ? 1 : 0).toUpperCase() || null;
    const symbol = us && plain ? plain.replace(/\./g, "-") : plain;
    return { symbol, code: symbol };
  }
  const [, exchange, rawCode] = foreign;
  const suffix = YAHOO_SUFFIX[exchange];
  // Share classes are dotted at the source (VOLV.B) and dashed at Yahoo
  // (VOLV-B.ST); Hong Kong pads its board lots out to four digits.
  let code = rawCode.toUpperCase().replace(/\./g, "-");
  if (exchange === "hkg") code = code.replace(/^0+/, "").padStart(4, "0");
  if (suffix === undefined) return { symbol: null, code };
  return { symbol: suffix ? `${code}.${suffix}` : code, code };
}

async function fetchStockAnalysisHoldings(symbol) {
  const res = await fetch(`https://stockanalysis.com/etf/${symbol.toLowerCase()}/holdings/`, {
    headers: { "User-Agent": BROWSER_USER_AGENT },
    next: { revalidate: 21600 },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const holdings = [];
  const re = /\{no:(\d+),n:"([^"]*)",s:"([^"]*)",as:"([^"]*)",sh:"([^"]*)"\}/g;
  let m;
  while ((m = re.exec(html))) {
    const percent = parseFloat(m[4]);
    const { symbol: mapped, code } = normalizeHoldingSymbol(m[3]);
    holdings.push({
      symbol: mapped,
      code,
      name: m[2],
      percent: Number.isFinite(percent) ? percent : null,
      shares: m[5] ? Number(m[5].replace(/,/g, "")) : null,
    });
  }
  if (!holdings.length) throw new Error("No holdings table");

  const countMatch = /total of ([\d,]+) individual holdings/.exec(html);
  const totalCount = countMatch ? Number(countMatch[1].replace(/,/g, "")) : holdings.length;
  return { holdings, totalCount };
}

async function fetchYahooHoldings(symbol) {
  const session = await yahooSession();
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=topHoldings&crumb=${encodeURIComponent(session.crumb)}`;
  const json = await (
    await fetch(url, {
      headers: { "User-Agent": BROWSER_USER_AGENT, Cookie: session.cookie },
      next: { revalidate: 21600 },
    })
  ).json();
  const rows = json?.quoteSummary?.result?.[0]?.topHoldings?.holdings ?? [];
  const holdings = rows
    .filter((r) => r?.symbol)
    .map((r) => ({
      symbol: r.symbol,
      code: r.symbol,
      name: r.holdingName ?? r.symbol,
      percent: typeof r.holdingPercent?.raw === "number" ? r.holdingPercent.raw * 100 : null,
      shares: null,
    }));
  if (!holdings.length) throw new Error("No Yahoo holdings");
  return { holdings, totalCount: holdings.length };
}

// Throws when neither source has anything for the symbol.
export async function fetchEtfHoldings(symbol) {
  const tracker = indexHoldingTracker(symbol);
  const sourceSymbol = tracker?.symbol ?? symbol;
  const data = await fetchStockAnalysisHoldings(sourceSymbol).catch(() => fetchYahooHoldings(sourceSymbol));
  return {
    ...data,
    displaySymbol: tracker?.label ?? symbol,
    tracker: tracker ? { symbol: tracker.symbol, name: tracker.name, exact: tracker.exact } : null,
  };
}
