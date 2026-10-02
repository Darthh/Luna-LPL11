// Regenerates lib/etfCusips.js: `node scripts/build-etf-cusips.mjs`.
//
// A 13F names an ETF by its trust ("ISHARES TR"), which identifies the issuer
// and not the fund - hundreds of iShares ETFs share one name and one CUSIP6.
// The only thing that tells IVV from IWM from TLT is the full nine-character
// CUSIP, and CUSIP-to-ticker is licensed data.
//
// iShares publishes the mapping for its own funds, which is the largest family
// in these filings by a distance, so that part is pulled straight from source.
// Everything else is listed below with the lookup that confirmed it - none of
// these are written from memory, because a misremembered CUSIP doesn't fail,
// it silently labels someone's holding as the wrong fund.
import { writeFileSync } from "node:fs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

const ISHARES =
  "https://www.ishares.com/us/product-screener/product-screener-v3.1.jsn" +
  "?dcrPath=/templatedata/config/product-screener-v3/data/en/us-ishares/ishares-product-screener-backend-config" +
  "&siteEntryPassthrough=true";

// Verified one at a time against 13f.info/cusip/<cusip>, which resolves the
// CUSIP a 13F actually carries. Ordered by how much of these filings they are.
const VERIFIED = {
  "78462F103": "SPY", // SPDR S&P 500 ETF Trust
  "46090E103": "QQQ", // Invesco QQQ Trust
  "78467X109": "DIA", // SPDR Dow Jones Industrial Average ETF
  "78463V107": "GLD", // SPDR Gold Shares
  "81369Y605": "XLF", // SPDR Financial Select Sector
  "81369Y506": "XLE", // SPDR Energy Select Sector
  "81369Y308": "XLP", // SPDR Consumer Staples Select Sector
  "78464A698": "KRE", // SPDR S&P Regional Banking
  "922908363": "VOO", // Vanguard S&P 500 ETF
  "92189F106": "GDX", // VanEck Gold Miners

  // Dual-class companies. Both classes file under one name, so matching on the
  // name gives them the same ticker and the table shows "GOOGL" twice for two
  // genuinely different securities. Only the CUSIP separates them. These four
  // are the collisions that actually turn up in the managers on this page -
  // rerun the duplicate scan if the roster changes.
  "02079K305": "GOOGL", // Alphabet Class A
  "02079K107": "GOOG", // Alphabet Class C
  "084670702": "BRK-B", // Berkshire Hathaway Class B
  "084670108": "BRK-A", // Berkshire Hathaway Class A
};

const res = await fetch(ISHARES, { headers: { "User-Agent": UA } });
if (!res.ok) throw new Error(`iShares screener HTTP ${res.status}`);
const funds = await res.json();

const map = {};
for (const fund of Object.values(funds)) {
  // The screener lists BlackRock's mutual funds alongside the ETFs, and a
  // mutual fund never appears in a 13F information table - it isn't a listed
  // security. `productView` is how the feed itself tells them apart.
  if (!(fund.productView ?? []).includes("etf")) continue;
  const cusip = String(fund.cusip ?? "").trim();
  const ticker = String(fund.localExchangeTicker ?? "").trim();
  if (/^[0-9A-Z]{9}$/.test(cusip) && /^[A-Z]{1,5}$/.test(ticker)) map[cusip] = ticker;
}
const fromIssuer = Object.keys(map).length;
Object.assign(map, VERIFIED);

const sorted = Object.keys(map).sort();
const body = sorted.map((c) => `  "${c}": "${map[c]}",`).join("\n");

writeFileSync(
  new URL("../lib/etfCusips.js", import.meta.url),
  `// Generated ${new Date().toISOString().slice(0, 10)} from the iShares US product\n` +
    `// screener plus a hand-verified list. Regenerate with\n` +
    `// scripts/build-etf-cusips.mjs - see that file for why this can't be typed\n` +
    `// out by hand.\n` +
    `//\n` +
    `// A 13F identifies an ETF only by its full CUSIP; the name it carries is the\n` +
    `// trust's ("ISHARES TR"), which every fund in the family shares.\n` +
    `export const ETF_CUSIPS = {\n${body}\n};\n`
);

console.log(`wrote lib/etfCusips.js: ${sorted.length} CUSIPs (${fromIssuer} from iShares, ${Object.keys(VERIFIED).length} verified by hand)`);
