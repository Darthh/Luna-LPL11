import { filingStore } from "./filingStore.js";
// Quarterly 13F holdings for the largest hedge funds and trading firms, read
// from the SEC's own EDGAR archive.
//
// EDGAR is the source every 13F aggregator repackages, and it's free, public
// and authoritative: the cover page of a filing carries the manager's name and
// the total value of the table, and the information table carries every
// position. Spot-checked against unusualwhales' institutions page - Susquehanna
// $893.33B, Jane Street $777.22B, Citadel $618.47B - and the figures are the
// same, because they're the same filings.
import { ETF_CUSIPS } from "@/lib/etfCusips";
import { INSTITUTIONS } from "@/lib/institutions";
import { pool, sleep } from "@/lib/pool";
import { managerSlug } from "@/lib/managerSlug";
import { SEC_USER_AGENT } from "@/lib/userAgent";

// A 13F is filed once a quarter and never changes after that, so the only
// thing a short cache would buy is more requests at the SEC.
const REVALIDATE = 86400;
const CONCURRENCY = 5;

// The bar each roster has to clear, applied at request time against the live
// filing rather than baked in - so a firm that falls under it drops off the
// page by itself and one that grows into it appears without a code change.
//
// The two differ sharply because the lists do. $2B admits established smaller
// hedge funds; $2B is a rounding error to an asset manager, and at
// that floor the institutions list fills with custodian arms nobody came to
// read. $100B is where that list starts being the firms people mean.
const MIN_TOTAL_VALUE = 2e9;
const MIN_INSTITUTION_VALUE = 100e9;
export const minValueFor = (roster) =>
  roster === "institutions" ? MIN_INSTITUTION_VALUE : MIN_TOTAL_VALUE;

// Who to look at. EDGAR has no "rank managers by 13F size" query - the totals
// only exist inside the filings - so the candidates are named here and the
// $2B test above decides which of them actually show up. Every CIK was found
// by searching EDGAR for 13F-HR filers and confirmed against its Q1 2026
// filing; the comment is that filing's total.
//
// To add a manager: find its CIK at sec.gov/cgi-bin/browse-edgar?company=<name>
// &type=13F-HR&output=atom and add it here. Under $2B it simply won't render.
//
// Don't rebuild this list by re-running a search and replacing it wholesale.
// EDGAR's company search matches on name and misses firms depending on how the
// query is worded - a sweep that turned up 47 managers over $10B silently
// dropped IMC and D. E. Shaw, both of which were already on the page. Add to
// the list; don't regenerate it.
export const MANAGERS = [
  { cik: "0001446194", name: "Susquehanna International Group, LLP" }, // $893.3B
  { cik: "0001595888", name: "Jane Street Group, LLC" }, // $777.2B
  { cik: "0001423053", name: "Citadel Advisors LLC" }, // $618.5B
  { cik: "0000354204", name: "Dimensional Fund Advisors LP" }, // $481.4B
  { cik: "0001859606", name: "Optiver Holding B.V." }, // $289.5B
  { cik: "0001452861", name: "IMC-Chicago, LLC" }, // $278.4B
  { cik: "0001273087", name: "Millennium Management LLC" }, // $240.3B
  { cik: "0001167557", name: "AQR Capital Management LLC" }, // $218.4B
  { cik: "0001164508", name: "Arrowstreet Capital, LP" }, // $184.8B
  { cik: "0001009207", name: "D. E. Shaw & Co., Inc." }, // $166.3B
  { cik: "0001488542", name: "Simplex Trading, LLC" }, // $149.1B
  { cik: "0001179392", name: "Two Sigma Investments, LP" }, // $123.9B
  { cik: "0001318757", name: "Marshall Wace, LLP" }, // $100.4B
  { cik: "0001729829", name: "Qube Research & Technologies Ltd" }, // $89.9B
  { cik: "0001642575", name: "Squarepoint Ops LLC" }, // $85.1B
  { cik: "0001632341", name: "Belvedere Trading LLC" }, // $84.4B
  { cik: "0001603466", name: "Point72 Asset Management, L.P." }, // $78.1B
  { cik: "0001165408", name: "Adage Capital Partners GP, L.L.C." }, // $64.8B
  { cik: "0001037389", name: "Renaissance Technologies LLC" }, // $63.9B
  { cik: "0001637460", name: "Man Group plc" }, // $55.1B
  { cik: "0000923093", name: "Tudor Investment Corp" }, // $53.9B
  { cik: "0000932540", name: "Group One Trading LLC" }, // $52.2B
  { cik: "0001517857", name: "Soroban Capital Partners LP" }, // $51.8B
  { cik: "0001389958", name: "PEAK6 LLC" }, // $42.6B
  { cik: "0001700574", name: "Holocene Advisors, LP" }, // $41.5B
  { cik: "0001103804", name: "Viking Global Investors LP" }, // $35.7B
  { cik: "0001453072", name: "Alyeska Investment Group, L.P." }, // $35.4B
  { cik: "0001135730", name: "Coatue Management LLC" }, // $29.1B
  { cik: "0001393825", name: "Hudson Bay Capital Management LP" }, // $29.0B
  { cik: "0001784547", name: "Woodline Partners LP" }, // $26.5B
  { cik: "0001020066", name: "Sands Capital Management, LLC" }, // $25.5B
  { cik: "0001758720", name: "Walleye Capital LLC" }, // $24.0B
  { cik: "0001167483", name: "Tiger Global Management LLC" }, // $22.8B
  { cik: "0001350694", name: "Bridgewater Associates, LP" }, // $22.4B
  { cik: "0001791786", name: "Elliott Investment Management L.P." }, // $20.1B
  { cik: "0001592643", name: "Select Equity Group, L.P." }, // $19.5B
  { cik: "0000909661", name: "Farallon Capital Management LLC" }, // $17.5B
  { cik: "0001454027", name: "Verition Fund Management LLC" }, // $15.4B
  { cik: "0001665241", name: "Schonfeld Strategic Advisors LLC" }, // $14.2B
  { cik: "0002007591", name: "Freestone Grove Partners LP" }, // $14.2B
  { cik: "0001557017", name: "Capula Management Ltd" }, // $14.1B
  { cik: "0001336528", name: "Pershing Square Capital Management, L.P." }, // $13.7B
  // Files under two CIKs for the same book - 0002038540, "Situational Awareness
  // Partners LP", reports the identical $13.68B across the identical 42
  // positions. This one is kept because it's the one with filing history; the
  // other has a single quarter, so every change column would read "new".
  { cik: "0002045724", name: "Situational Awareness LP" }, // $13.7B
  { cik: "0001666335", name: "Rokos Capital Management LLP" }, // $13.2B
  { cik: "0001061165", name: "Lone Pine Capital LLC" }, // $12.5B
  { cik: "0001736225", name: "ExodusPoint Capital Management, LP" }, // $12.4B
  { cik: "0001512857", name: "Brevan Howard Capital Management LP" }, // $11.3B
  { cik: "0001279891", name: "Wolverine Asset Management LLC" }, // $10.4B
  { cik: "0001647251", name: "TCI Fund Management Ltd" }, // $52.8B
  { cik: "0001387322", name: "Whale Rock Capital Management LLC" }, // $12.5B
  { cik: "0000934639", name: "Maverick Capital Ltd" }, // $11.3B
  { cik: "0000921669", name: "Icahn Capital LP" }, // $8.3B
  { cik: "0001029160", name: "Soros Fund Management LLC" }, // $8.1B
  { cik: "0001656456", name: "Appaloosa LP" }, // $7.7B
  { cik: "0001040273", name: "Third Point LLC" }, // $4.7B
  { cik: "0001535472", name: "Corvex Management LP" }, // $3.3B
];

// The two rosters the page can show. Same filings, same code, different lists:
// see lib/institutions.js for why a firm sits on one side rather than the other.
export const ROSTERS = { hedgefunds: MANAGERS, institutions: INSTITUTIONS };
export const isRoster = (name) => Object.hasOwn(ROSTERS, name);
export const rosterOf = (name) => ROSTERS[name] ?? MANAGERS;

// Lookups span both rosters. A CIK is a CIK - a fund page has to resolve
// whichever list its manager came from, and the detail route has no business
// knowing which tab the visitor clicked from.
const MANAGER_BY_CIK = new Map(
  [...MANAGERS, ...INSTITUTIONS].map((m) => [m.cik, m])
);
export const isKnownManager = (cik) => MANAGER_BY_CIK.has(cik);

// The firm behind a CIK, from whichever roster it is on. The detail page needs
// this for its title; it used to search MANAGERS alone, so every institution
// 404'd on click even though the API served its book perfectly well.
export const managerByCik = (cik) => MANAGER_BY_CIK.get(cik) ?? null;

export { managerSlug };

// Slug -> manager, matched case-insensitively so a hand-typed or lowercased
// link still resolves. Two firms can slug the same once suffixes are stripped
// (a management arm and its holding company); first roster entry wins, and the
// other keeps working under its CIK.
const MANAGER_BY_SLUG = new Map();
for (const m of [...MANAGERS, ...INSTITUTIONS]) {
  const slug = managerSlug(m.name).toLowerCase();
  if (slug && !MANAGER_BY_SLUG.has(slug)) MANAGER_BY_SLUG.set(slug, m);
}

// Resolves either form, so every /hedge-funds/<cik> link ever shared keeps
// working. A CIK is all digits; anything else is treated as a slug.
export function managerByCikOrSlug(value) {
  if (!value) return null;
  const decoded = decodeURIComponent(value);
  return MANAGER_BY_CIK.get(decoded) ?? MANAGER_BY_SLUG.get(decoded.toLowerCase()) ?? null;
}

// EDGAR's fair-access policy is ten requests a second, and it answers 429 once
// you pass it - for a while, not just for the request that went over. Reading
// forty-eight managers is a couple of hundred requests, so every call books a
// slot through one gate rather than each caller being trusted to behave. The
// gate is per server instance, which is the same granularity as the IP the
// limit is applied to.
const MIN_REQUEST_GAP = 110;
let nextSlot = 0;

function bookSlot() {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + MIN_REQUEST_GAP;
  return at - now;
}

// `store` is off for the information tables. They run to several megabytes -
// Citadel's Q1 filing is 7.5MB across 15,589 positions - which is past what
// Next's data cache will hold, so those are cached by the route instead.
async function edgar(url, store = true) {
  for (let attempt = 0; ; attempt++) {
    await sleep(bookSlot());
    const res = await fetch(url, {
      headers: { "User-Agent": SEC_USER_AGENT, Accept: "*/*" },
      ...(store ? { next: { revalidate: REVALIDATE } } : { cache: "no-store" }),
    });
    if (res.ok) return res.text();
    // 429 is the rate limiter and 503 is EDGAR shedding load. Neither means the
    // document isn't there, so both are worth waiting out rather than turning
    // into "this manager is unavailable".
    if ((res.status === 429 || res.status === 503) && attempt < 3) {
      await sleep(1200 * (attempt + 1));
      continue;
    }
    throw new Error(`EDGAR HTTP ${res.status} for ${url}`);
  }
}

const ENTITIES = { "&amp;": "&", "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">", "&#39;": "'" };
const decode = (s) => s.replace(/&amp;|&quot;|&apos;|&lt;|&gt;|&#39;/g, (m) => ENTITIES[m]);

// These documents are flat and machine-generated, with no attributes and no
// repeated tags inside a record, so one regex per field beats pulling in an XML
// parser for them.
//
// The optional prefix is not optional in practice: about half these filers
// namespace every element ("<ns1:value>"), the other half don't ("<value>"),
// and which one you get is down to the filing agent. A parser that only knows
// the bare form reads those filings as empty rather than failing.
const TAG = (name) => new RegExp(`<(?:\\w+:)?${name}>([^<]*)</(?:\\w+:)?${name}>`);

function tagValue(xml, name) {
  const m = xml.match(TAG(name));
  return m ? decode(m[1]).trim() : null;
}

// A manager's 13F holdings reports, newest period first. Amendments (13F-HR/A)
// are skipped: they restate one part of a filing, so their table total isn't
// the manager's book.
//
// `filings.recent` is already newest-first, but it's ordered by filing date and
// a manager that files two quarters late would put them out of period order, so
// the sort is on the period each one reports.
// Pulls the 13F-HRs out of one submissions page (`filings.recent`, or one of
// the older overflow pages, which carry the same parallel arrays at the top
// level).
function thirteenFsIn(page, out) {
  for (let i = 0; i < (page.form?.length ?? 0); i++) {
    if (page.form[i] !== "13F-HR") continue;
    out.push({
      period: page.reportDate[i],
      filed: page.filingDate[i],
      // The archive path drops the dashes the JSON keeps.
      accession: page.accessionNumber[i].replace(/-/g, ""),
    });
  }
  return out;
}

async function filingHistory(cik) {
  const sub = JSON.parse(await edgar(`https://data.sec.gov/submissions/CIK${cik}.json`));
  const recent = sub.filings?.recent;
  if (!recent) throw new Error(`No filings for CIK ${cik}`);
  const out = thirteenFsIn(recent, []);

  // `filings.recent` holds only the most recent ~1000 submissions of any form,
  // and the biggest institutions file thousands - Morgan Stanley's last 1000
  // forms span seven weeks. That leaves 4-5 quarters of 13F-HR here and the
  // rest in the dated overflow pages, which is why their pages showed missing
  // quarters and could not reach a year back to compute YoY. Overflow pages
  // are newest-first, so this stops as soon as it has the span the page
  // offers, rather than reading all 44 of them.
  for (const file of sub.filings?.files ?? []) {
    if (out.length >= HISTORY_QUARTERS + 1) break;
    try {
      thirteenFsIn(JSON.parse(await edgar(`https://data.sec.gov/submissions/${file.name}`)), out);
    } catch {
      // A page that won't load costs the quarters it held, not the manager.
      break;
    }
  }

  if (!out.length) throw new Error(`No 13F-HR for CIK ${cik}`);
  return out.sort((a, b) => b.period.localeCompare(a.period));
}

// A manager that simply didn't file for the quarter being asked for. Kept
// apart from the errors that mean EDGAR is having a bad day, because the honest
// answer is "there is no filing", not "try again in a moment".
export class NoFilingError extends Error {}

// How many quarters back the page will look. Fourteen quarter ends reach Q1
// 2023 from Q2 2026, which is the span the page offers.
//
// Every quarter offered is another information table per manager to read, so
// this is a cost as well as a span - which is why the lists at each quarter
// are precomputed into lib/hedgeFundQuarters.js rather than built on demand.
// See scripts/build-hedge-quarters.mjs.
export const HISTORY_QUARTERS = 14;

// A period is a quarter end off a filing, and it reaches EDGAR as nothing at
// all - it's only ever matched against the history - but it arrives from a
// query string, so it's checked before it's used as a cache key.
export const isPeriod = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

// Where a quarter sits in a manager's history. Without one, the newest filing;
// with one, that exact quarter or nothing. Deliberately not "the closest
// filing" - a manager that skipped the quarter being looked at has no book for
// it, and showing the neighbouring quarter under that heading would be
// answering a question nobody asked.
function filingAt(history, period) {
  return period ? (history.find((f) => f.period === period) ?? null) : history[0];
}

const archive = (cik, accession, file) =>
  `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession}/${file}`;

// Which file in a filing is the information table.
//
// There is no standard name for it. Citadel files "infotable.xml", Susquehanna
// files "file.XML", Renaissance files "renaissance13Fq12026_holding.xml" - the
// filer agent picks, and it changes between quarters. So the filing's own
// directory gets read and the table identified by what it is: the XML document
// that isn't the cover page. Where a filer splits the table across several
// documents, the largest is the holdings.
async function infoTableFile(cik, accession) {
  const index = JSON.parse(await edgar(archive(cik, accession, "index.json")));
  const table = (index.directory?.item ?? [])
    .filter(
      (f) => /\.xml$/i.test(f.name) && f.name.toLowerCase() !== "primary_doc.xml"
    )
    .sort((a, b) => Number(b.size) - Number(a.size))[0];
  if (!table) throw new Error(`No information table in ${accession}`);
  return table.name;
}

// Name, period and table total, all from the cover page - 2KB rather than the
// megabytes of positions behind it. This is what ranks the list.
//
// Takes the history rather than reading it: the quarter being summarised can
// only be decided once every manager's history is known, so the list below
// reads them all first and hands each one back here.
async function fundSummary(cik, history, period) {
  const filing = filingAt(history, period);
  // No filing for that quarter, so no book - the $10B test drops it from that
  // quarter's list.
  if (!filing) return { cik, totalValue: 0 };
  const doc = await edgar(archive(cik, filing.accession, "primary_doc.xml"));
  return {
    cik,
    // The name on the filing itself, falling back to our own label if a cover
    // page ever omits it.
    name: doc.match(/<filingManager>\s*<name>([^<]*)<\/name>/)?.[1]?.trim()
      ? decode(doc.match(/<filingManager>\s*<name>([^<]*)<\/name>/)[1].trim())
      : MANAGER_BY_CIK.get(cik)?.name ?? cik,
    period: filing.period,
    filed: filing.filed,
    totalValue: Number(tagValue(doc, "tableValueTotal")) || 0,
    positions: Number(tagValue(doc, "tableEntryTotal")) || 0,
  };
}

// Every manager that cleared the bar in the quarter being looked at, biggest
// book first, plus the quarters that can be looked at. A manager whose filing
// can't be read is left out rather than shown as a blank row.
//
// The $10B test is applied to the selected quarter's filing rather than to the
// newest one, so each quarter's list is the list as it stood then - a manager
// that has since grown into the bar isn't back-filled into quarters where it
// was under it.
export async function fundList(period, roster = MANAGERS, floor = MIN_TOTAL_VALUE) {
  // Histories first, for every manager, because which quarter the list is for
  // is a fact about all of them together rather than about any one.
  const settled = await pool(roster, CONCURRENCY, (m) =>
    filingHistory(m.cik)
      .then((history) => ({ cik: m.cik, history }))
      .catch(() => null)
  );
  const read = settled.filter(Boolean);

  // The quarters on offer: newest first, and only ones some manager filed for.
  const periods = [
    ...new Set(read.flatMap((f) => f.history.slice(0, HISTORY_QUARTERS).map((x) => x.period))),
  ]
    .sort()
    .reverse()
    .slice(0, HISTORY_QUARTERS);

  // No quarter asked for means the newest quarter there is - a real one, not
  // "whatever each manager happened to file last". Those are different lists
  // whenever a manager is late, and if the default were the second of them,
  // the newest quarter would be the one entry in the picker that meant
  // something other than what it says.
  const at = period ?? periods[0] ?? null;

  const summaries = await pool(read, CONCURRENCY, (f) =>
    fundSummary(f.cik, f.history, at).catch(() => null)
  );

  return {
    funds: summaries
      .filter((f) => f && f.totalValue >= floor)
      .sort((a, b) => b.totalValue - a.totalValue),
    periods,
    // Which quarter this list is, named rather than inferred - the caller asked
    // for "the newest" and is owed the answer.
    asOf: at,
  };
}

// ---------------------------------------------------------------------------
// Issuer name → ticker
//
// A 13F identifies a holding by CUSIP, and CUSIP-to-ticker is licensed data we
// don't have. The issuer name is right there in the filing though, and EDGAR's
// own ticker directory names companies in the same house style, so the two sides
// match once both are normalised. Everything that doesn't match keeps its issuer
// name - that's most ETFs and trusts, which have no operating-company CIK to be
// listed under.

// EDGAR abbreviates inside issuer names; the directory writes them out.
const ABBREVIATIONS = {
  intl: "international", grp: "group", cos: "companies", tech: "technologies",
  hldgs: "holdings", hldg: "holdings", indl: "industrial", indls: "industries",
  southn: "southern", northn: "northern", amer: "america", svcs: "services",
  sys: "systems", fin: "financial", res: "resources", pptys: "properties",
  enrgy: "energy", elec: "electric", mtrs: "motors", labs: "laboratories",
};
// Legal forms, share-class markers and the state-of-incorporation tags EDGAR
// hangs off the end ("BERKSHIRE HATHAWAY INC DEL"). None of them identifies a
// company, and only one side ever carries them.
const NOISE = new Set([
  "the", "inc", "incorporated", "corp", "corporation", "co", "company", "companies",
  "plc", "ltd", "limited", "llc", "lp", "sa", "nv", "ag", "se", "class", "cl", "com",
  "new", "adr", "ads", "spons", "sponsored", "del", "md", "ny", "reit", "holdings",
  "holding", "group", "tr", "trust",
]);

const NOISE_LIST = [...NOISE];

// Some filers tag the listing country onto the issuer name - Tudor reports
// "Microsoft Corp - US" and "State Street SPDR S&P 500 ETF Trust - US ETP".
// The trailing all-caps segment is about the line, not the company.
const COUNTRY_TAG = /\s+-\s+[A-Z]{2,4}(\s+[A-Z]{2,4})?$/;

function issuerKey(name) {
  const words = decode(name ?? "")
    .replace(COUNTRY_TAG, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((w) => ABBREVIATIONS[w] ?? w)
    .filter(Boolean);
  // EDGAR truncates the issuer name to a fixed width, which regularly cuts a
  // trailing legal form in half - "CREDO TECHNOLOGY GROUP HOLDI". A last word
  // that can only be the start of a word we'd have dropped anyway goes too.
  const last = words[words.length - 1];
  if (last && last.length >= 3 && !NOISE.has(last) && NOISE_LIST.some((n) => n.startsWith(last))) {
    words.pop();
  }
  return words.filter((w) => !NOISE.has(w)).join(" ");
}

let directory = null;
async function tickerDirectory() {
  if (directory) return directory;
  const json = JSON.parse(await edgar("https://www.sec.gov/files/company_tickers.json"));
  const exact = new Map();
  // The file is ordered by size, so on a collision the bigger company wins.
  for (const row of Object.values(json)) {
    const key = issuerKey(row.title);
    if (key && !exact.has(key)) exact.set(key, row.ticker);
  }
  directory = { exact, keys: [...exact.keys()] };
  return directory;
}

// The prefix branch below scans every company in the directory, and a book runs
// to thousands of positions with the same CUSIPs turning up in fund after fund.
// The answer only depends on the CUSIP, so it's worth keeping.
const tickerByCusip = new Map();
function lookupTicker(dir, name, cusip) {
  if (tickerByCusip.has(cusip)) return tickerByCusip.get(cusip);
  const ticker = resolveTicker(dir, name, cusip);
  tickerByCusip.set(cusip, ticker);
  return ticker;
}

// ETFs and trusts come first, by CUSIP, because their name in a filing is the
// trust's rather than the fund's - every iShares ETF on earth files as
// "ISHARES TR", so there is nothing in the name to match on.
function resolveTicker(dir, name, cusip) {
  const etf = ETF_CUSIPS[cusip];
  if (etf) return etf;
  const key = issuerKey(name);
  if (!key) return null;
  const hit = dir.exact.get(key);
  if (hit) return hit;
  // EDGAR truncates long issuer names ("TAIWAN SEMICONDUCTOR MANUFAC"). A long
  // enough prefix is accepted, but only when exactly one company starts with it
  // - otherwise "APPLE" would claim whichever Apple-something came first.
  if (key.length < 12) return null;
  const matches = dir.keys.filter((k) => k.startsWith(key));
  return matches.length === 1 ? dir.exact.get(matches[0]) : null;
}

// ---------------------------------------------------------------------------

// How many holdings the donut names before the rest becomes one "Other" slice.
//
// Twenty is far past the point where color alone can tell slices apart, so the
// chart doesn't ask it to: every slice is named in the legend beside it, with
// a gap between arcs and the full table underneath. See the palette note in
// components/HedgeFundDetail.jsx.
//
// Ten named plus the collapsed "Other" is 11, which the ring legend lays out
// as three columns of four.
const DONUT_SLICES = 10;

// One manager's book, read into two sets of positions: the shares and the
// options, each largest first.
//
// They stay apart rather than being added together. A 13F reports an option at
// the notional value of the shares underneath it, so for a firm like Citadel
// they're most of the table - $618B of "holdings" against a $139B stock book -
// and one chart over both would be showing option exposure labelled as
// ownership. Two rings say what a single one can't.
//
// Positions are keyed on all nine characters of the CUSIP, not the six that
// identify the issuer: the last three are the security, and collapsing them
// would merge things that are not each other. Alphabet's two share classes are
// two lines in every filing and two rows on every 13F site, and - worse - the
// entire iShares family files under one issuer, so a CUSIP6 key turns forty
// different ETFs into a single "ISHARES TR" holding worth the sum of all of
// them.
function readTable(table, tableFile, cik) {
  const positions = new Map();
  const options = new Map();
  let stockValue = 0;
  let optionValue = 0;
  let entries = 0;

  for (const record of table.split(/<(?:\w+:)?infoTable>/).slice(1)) {
    const value = Number(tagValue(record, "value"));
    if (!Number.isFinite(value) || value <= 0) continue;
    entries++;

    const putCall = tagValue(record, "putCall");
    // PRN entries are debt reported by principal amount, not a shareholding.
    // Only shares are filtered this way: an option line reports the shares
    // underneath it and is a position either way.
    if (!putCall && tagValue(record, "sshPrnamtType") !== "SH") continue;

    const cusip = (tagValue(record, "cusip") ?? "").trim().toUpperCase();
    const shares = Number(tagValue(record, "sshPrnamt")) || 0;
    const side = putCall ? (/^p/i.test(putCall) ? "Put" : "Call") : null;
    // A put and a call on the same issuer are opposite bets, so they're two
    // positions sharing a CUSIP rather than one position. Adding them would
    // report a manager who is long and short the same name as holding neither.
    const key = (cusip || tagValue(record, "nameOfIssuer") || String(entries)) + (side ? `:${side}` : "");

    const into = putCall ? options : positions;
    if (putCall) optionValue += value;
    else stockValue += value;

    // A manager files one line per internal book, so the same security can
    // appear several times and the lines add up to the position.
    const held = into.get(key);
    if (held) {
      held.value += value;
      held.shares += shares;
    } else {
      into.set(key, {
        // Same country tag stripped off the display name, not just the one
        // used for matching - it's noise in a table either way.
        name: (tagValue(record, "nameOfIssuer") ?? key).replace(COUNTRY_TAG, ""),
        // The key identifies the row; the CUSIP alone is what a ticker is
        // looked up by, so the two can't be the same field once a key carries
        // a put/call side.
        key,
        cusip: cusip || key,
        value,
        shares,
        ...(side ? { side } : {}),
      });
    }
  }

  // Nothing parsed out of a document that had rows in it is a table this
  // reader didn't understand - fail, rather than return an empty chart that
  // would look like an answer.
  //
  // A table with no rows at all is a different thing, and a real one: a filer
  // that reported no holdings for the quarter. Norges Bank's Q3 2024 filing is
  // a single placeholder line - CUSIP 000000000, zero shares, zero value - and
  // that is what its 13F says. Treating it as a fault told the reader to try
  // again in a moment for a filing that will read the same way forever.
  if (!entries) {
    throw new NoFilingError(`CIK ${cik} reported no holdings in ${tableFile}`);
  }
  if (!positions.size && !options.size) {
    throw new Error(`Read no holdings out of ${tableFile} for CIK ${cik}`);
  }
  return { positions, options, stockValue, optionValue, entries };
}

// A filed 13F never changes, so a parsed information table is correct forever.
// Fetching and parsing one is the expensive half of every page in this section
// - the largest run to 21,000 positions, and a cost basis walks fourteen of
// them - and the in-process memo the route keeps dies with the Worker isolate,
// so in production almost every click paid for it again.
//
// Hence S3: written once, never expiring, keyed by the accession number that
// identifies the filing. Only the fields the filing itself carries are stored;
// everything else on a holdings row (ticker, percentages, change columns, cost
// basis) is derived at read time and would only go stale here.
//
// The store is optional. Outside Lambda - the build scripts, `next dev` - no
// bucket is configured, and every read falls through to EDGAR exactly as before.

// Maps don't survive JSON, so the two books travel as arrays and are rebuilt
// on the way out. The key is already on every row.
const packFiling = ({ positions, options, stockValue, optionValue, entries }) =>
  JSON.stringify({
    p: [...positions.values()],
    o: [...options.values()],
    sv: stockValue,
    ov: optionValue,
    n: entries,
  });

const unpackFiling = (raw) => ({
  positions: new Map(raw.p.map((h) => [h.key, h])),
  options: new Map(raw.o.map((h) => [h.key, h])),
  stockValue: raw.sv,
  optionValue: raw.ov,
  entries: raw.n,
});

async function readFiling(cik, filing) {
  const store = await filingStore();
  const key = `f:${cik}:${filing.accession}`;

  if (store) {
    // A store that errors or holds something unreadable must not take the page
    // down - it is a cache in front of EDGAR, which is still there.
    const hit = await store.get(key).catch(() => null);
    if (hit?.p) return unpackFiling(hit);
  }

  const file = await infoTableFile(cik, filing.accession);
  const read = readTable(await edgar(archive(cik, filing.accession, file), false), file, cik);

  // Written after the reader already has their answer, and never allowed to
  // fail the request: a failed write just means the next read goes to EDGAR.
  if (store) {
    try {
      await store.put(key, packFiling(read));
    } catch {
      /* the read stands on its own */
    }
  }
  return read;
}

export async function fundHoldings(cik, period) {
  const [history, dir] = await Promise.all([filingHistory(cik), tickerDirectory()]);
  const filing = filingAt(history, period);
  if (!filing) throw new NoFilingError(`CIK ${cik} filed no 13F for ${period}`);
  // The quarter before the one being read, which for an older quarter is the
  // one before that - not the newest filing. The change columns have to be
  // against what the reader is looking at.
  const previous = history[history.indexOf(filing) + 1] ?? null;

  const [doc, current, prior] = await Promise.all([
    edgar(archive(cik, filing.accession, "primary_doc.xml")),
    readFiling(cik, filing),
    // The quarter before, for the change columns. A manager whose first filing
    // this is has nothing to compare against, and one bad prior filing
    // shouldn't cost the current one - the columns just read "new" instead.
    previous ? readFiling(cik, previous).catch(() => null) : Promise.resolve(null),
  ]);

  const { positions, options, stockValue, optionValue, entries } = current;

  const rank = (map) => [...map.values()].sort((a, b) => b.value - a.value);
  const ranked = rank(positions);
  const rankedOptions = rank(options);

  // Shares and options are each a whole book, so each is measured against its
  // own total. An option position as a percentage of the stock book would read
  // in the hundreds for the market makers on this list.
  const share = (total) => (v) => (total ? (v / total) * 100 : 0);
  const pct = share(stockValue);
  const optionPct = share(optionValue);

  // The whole book, not a top slice of it: the detail page pages through all of
  // it, and the market-wide aggregates below add up every position a manager
  // reports rather than the handful that fit on a screen.
  const readBook = (rows, priorMap, pctOf) =>
    rows.map((h) => {
      const before = priorMap?.get(h.key)?.shares ?? null;
      return {
        ...h,
        ticker: lookupTicker(dir, h.name, h.cusip),
        pct: pctOf(h.value),
        // What a 13F reports is the value of the position and the share count on
        // the same date, so this is the price the filing implies at quarter end.
        // It is NOT an average cost - nothing in a 13F says what was paid. On an
        // option line it's the price of the shares underneath, not the premium.
        price: h.shares > 0 ? h.value / h.shares : null,
        // Against the quarter before. `null` where there's no prior filing to
        // compare with at all; a position the manager didn't hold last quarter
        // reports its whole size as the change and no percentage, because a
        // percentage of nothing isn't a number.
        sharesPrev: before,
        sharesChange: prior ? h.shares - (before ?? 0) : null,
        sharesChangePct: before ? ((h.shares - before) / before) * 100 : null,
        isNew: prior ? before == null : false,
      };
    });

  const holdings = readBook(ranked, prior?.positions, pct);
  const optionHoldings = readBook(rankedOptions, prior?.options, optionPct);

  // A ring's slices, with everything past the cut collapsed into one, so it
  // always adds up to its whole book rather than to the top twenty.
  const donut = (rows, pctOf) => {
    const named = rows.slice(0, DONUT_SLICES);
    const restValue = rows.slice(DONUT_SLICES).reduce((a, h) => a + h.value, 0);
    const slices = named.map((h) => {
      const ticker = lookupTicker(dir, h.name, h.cusip);
      return {
        // On the options ring the side is part of the name: two slices of the
        // same issuer that aren't the same bet have to read as two things.
        label: [ticker ?? h.name, h.side].filter(Boolean).join(" "),
        // The bare symbol, kept beside the label so the legend can show a
        // logo. `label` carries the option side too ("SPY Put"), and where no
        // symbol resolved it is the issuer's name - neither is a logo lookup.
        ticker: ticker ?? null,
        // The issuer's name alongside the symbol, so a legend row says both
        // rather than making the reader know every ticker. Only carried when
        // the symbol resolved and reads differently from the name - otherwise
        // `label` is already the name and repeating it says nothing.
        issuer: ticker && ticker !== h.name ? h.name : null,
        value: h.value,
        pct: pctOf(h.value),
      };
    });
    if (restValue > 0) {
      slices.push({
        label: "Other",
        value: restValue,
        pct: pctOf(restValue),
        rest: rows.length - named.length,
      });
    }
    return slices;
  };

  return {
    cik,
    name: doc.match(/<filingManager>\s*<name>([^<]*)<\/name>/)?.[1]
      ? decode(doc.match(/<filingManager>\s*<name>([^<]*)<\/name>/)[1].trim())
      : MANAGER_BY_CIK.get(cik)?.name ?? cik,
    period: filing.period,
    filed: filing.filed,
    // Which quarters this manager can be shown at, for the picker on its page.
    periods: history.slice(0, HISTORY_QUARTERS).map((f) => f.period),
    // The quarter the change columns are measured against, so the table can
    // say which one rather than assuming the reader knows.
    priorPeriod: prior ? previous.period : null,
    totalValue: Number(tagValue(doc, "tableValueTotal")) || stockValue + optionValue,
    stockValue,
    optionValue,
    positions: entries,
    issuers: ranked.length,
    optionIssuers: rankedOptions.length,
    holdings,
    optionHoldings,
    slices: donut(ranked, pct),
    optionSlices: donut(rankedOptions, optionPct),
  };
}

// ---------------------------------------------------------------------------
// Across every manager on the list
//
// What one fund bought is a fund's decision; what forty-eight of them bought
// the same quarter is the crowd. Both answers below are the same reduce over
// every book, so they're built together from one pass.

// One manager's book cut down to what an aggregate needs. Only positions that
// resolved to a ticker are kept: the aggregate groups by symbol, and a holding
// with no symbol has nothing to group with.
// The last few quarters of one manager's share book, newest first, for the
// charts on its page.
//
// What each quarter's 13F reported the whole table to be worth, newest first.
//
// Off the cover pages alone - `tableValueTotal` is the number the filing puts
// on itself, and it is the same figure the list page ranks managers by, so the
// chart and the list agree. A cover page is a couple of kilobytes against the
// megabytes of positions behind it, which is what makes fourteen quarters of
// this cheap where fourteen information tables would not be.
//
// A quarter whose cover page will not read is left out rather than charted as
// a zero, which would draw a manager falling to nothing and recovering.
export async function fundValueHistory(cik, quarters = HISTORY_QUARTERS) {
  const history = await filingHistory(cik);
  const wanted = history.slice(0, quarters);
  const read = await pool(wanted, CONCURRENCY, (filing) =>
    edgar(archive(cik, filing.accession, "primary_doc.xml"))
      .then((doc) => ({
        period: filing.period,
        filed: filing.filed,
        totalValue: Number(tagValue(doc, "tableValueTotal")) || 0,
        positions: Number(tagValue(doc, "tableEntryTotal")) || 0,
      }))
      .catch(() => null)
  );
  return read.filter((q) => q && q.totalValue > 0);
}

// The same quarter one year earlier: Q2 2026 pairs with Q2 2025, never with
// the three quarters in between. Comparing a book against the adjacent quarter
// measures a single quarter's drift; comparing it against its own quarter a
// year back is the like-for-like the number is meant to express.
//
// Matched on the year and month rather than by counting four filings back - a
// manager that missed a quarter would put the fourth row at the wrong date,
// and a comparison against the wrong period is worse than no comparison.
export function priorYearQuarter(history, period) {
  const [y, m] = period.split("-");
  const target = `${Number(y) - 1}-${m}`;
  return history.find((q) => q.period.startsWith(target)) ?? null;
}

// How the whole reported book changed against the same quarter a year ago, as
// a percentage of the earlier figure.
//
// This is the change in reported 13F value, which is not a return: it moves
// with the market, but also with money coming in or going out, with positions
// entering and leaving 13F reportability, and with the manager simply buying
// and selling. Labelled accordingly wherever it is shown.
export function valueChangeYoy(history, period) {
  const now = history.find((q) => q.period === period);
  const then = priorYearQuarter(history, period);
  if (!now || !then || !then.totalValue) return null;
  return {
    current: now.totalValue,
    prior: then.totalValue,
    priorPeriod: then.period,
    percent: ((now.totalValue - then.totalValue) / then.totalValue) * 100,
  };
}

// Reads only the filings themselves. `fundHoldings` also reads the quarter
// before each one to fill in change columns, and nothing on those charts is a
// change - so this parses five tables where going through that would parse
// ten, which for a manager reporting fifteen thousand positions is the
// difference between slow and unusable.
//
// One at a time for the same reason the build script is: the parse is the slow
// part and it's single-threaded anyway, and holding one table rather than five
// is what keeps the peak memory in megabytes.
export async function fundQuarterBooks(cik, quarters = HISTORY_QUARTERS) {
  const [history, dir] = await Promise.all([filingHistory(cik), tickerDirectory()]);
  const books = [];
  for (const filing of history.slice(0, quarters)) {
    // A quarter that won't parse is left out rather than charted as a gap in
    // the middle of a line, which would read as the manager holding nothing.
    const read = await readFiling(cik, filing).catch(() => null);
    if (!read) continue;
    books.push({
      period: filing.period,
      filed: filing.filed,
      stockValue: read.stockValue,
      // Only what resolved to a ticker: everything here groups by symbol, and
      // a holding without one has nothing to group with or price against.
      rows: [...read.positions.values()]
        .map((h) => ({ ticker: lookupTicker(dir, h.name, h.cusip), name: h.name, value: h.value }))
        .filter((h) => h.ticker)
        .sort((a, b) => b.value - a.value),
    });
  }
  return books;
}

// Average cost and unrealised P/L, reconstructed from the filings themselves.
//
// A 13F never says what was paid. What it does say, every quarter, is how many
// shares were held and what they were worth on the reporting date - so the
// price each quarter implies is value/shares. Walking the filings forward and
// charging every share ADDED at the price its own quarter implies gives a
// weighted-average cost that is a real estimate rather than a guess.
//
// What this is not: an actual cost basis. The manager traded at whatever prices
// the quarter held, not at its closing mark, and anything bought and sold
// entirely between two filings never appears at all. Treat it as the cost of
// having accumulated the position at quarter-end marks, and nothing more.
//
// Sales are charged against the average rather than re-basing it, which is the
// standard weighted-average convention: selling does not change what the
// remaining shares cost.
//
// `books` runs oldest-first and each row needs `shares` as well as `value`,
// which is why this takes positions rather than the ticker rows the charts use.
export function costBasis(books) {
  const cost = new Map();
  for (const book of books) {
    for (const [key, h] of book.positions) {
      if (!(h.shares > 0) || !(h.value > 0)) continue;
      const price = h.value / h.shares;
      const held = cost.get(key);
      if (!held) {
        cost.set(key, { shares: h.shares, spent: h.shares * price, first: book.period });
        continue;
      }
      const added = h.shares - held.shares;
      if (added > 0) {
        held.spent += added * price;
      } else if (added < 0) {
        // Sold: retire those shares at the average they carry, so the average
        // itself is untouched.
        held.spent += added * (held.spent / held.shares);
      }
      held.shares = h.shares;
    }
  }
  const out = new Map();
  for (const [key, held] of cost) {
    if (!(held.shares > 0) || !(held.spent > 0)) continue;
    out.set(key, { avgPrice: held.spent / held.shares, spent: held.spent, since: held.first });
  }
  return out;
}

// The positions of each quarter, oldest first, for costBasis above. Reads the
// same filings the charts do; kept separate because this one needs share counts
// and both books, where the charts only ever wanted value by ticker.
export async function fundPositionHistory(cik, quarters = HISTORY_QUARTERS) {
  const history = await filingHistory(cik);
  const books = [];
  for (const filing of history.slice(0, quarters)) {
    const read = await readFiling(cik, filing).catch(() => null);
    if (!read) continue;
    books.push({ period: filing.period, positions: read.positions, options: read.options });
  }
  // filingHistory is newest-first; a cost basis has to accumulate forward.
  return books.reverse();
}

export async function fundTickerRows(cik, period) {
  const fund = await fundHoldings(cik, period);
  return fund.holdings
    .filter((h) => h.ticker)
    .map((h) => ({
      ticker: h.ticker,
      name: h.name,
      value: h.value,
      // A 13F says how many shares changed hands, never at what price. The
      // quarter-end price the filing implies is the only one it offers, so
      // that's what the added shares are valued at.
      added: h.sharesChange > 0 && h.price ? h.sharesChange * h.price : 0,
      reduced: h.sharesChange < 0,
      isNew: h.isNew,
    }));
}
