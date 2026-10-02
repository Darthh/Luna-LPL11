// Yahoo reports the listing tier - "NasdaqGS", "NasdaqCM", "NYSEArca" - which
// is more than a screen needs; the market is the part anyone reads.
//
// Matching is by prefix because the tier suffix is open-ended, and the first
// match wins, so the longer names have to come before the ones they start
// with. NYSE last of the NYSEs, or NYSE Arca rows read "NYSE".
import { clamp } from "./num.js";

const MARKETS = [
  ["NYSEArca", "NYSE Arca"],
  ["NYSEAmerican", "NYSE American"],
  ["NYSE", "NYSE"],
  ["Nasdaq", "Nasdaq"],
  ["NASDAQ", "Nasdaq"],
  ["BATS", "Cboe BZX"],
  ["Cboe", "Cboe BZX"],
  ["OTC", "OTC"],
  ["Pink", "OTC"],
];

// Unrecognised names pass through rather than being dropped: a market this
// list hasn't met is still worth showing.
export function marketOf(exchange) {
  if (!exchange) return null;
  return MARKETS.find(([prefix]) => exchange.startsWith(prefix))?.[1] ?? exchange;
}

// Yahoo's short exchange code → the flagcdn country code for that market.
// Shared by the stock page header and the screener's Exchange column so the
// two can't end up flying different flags for the same listing.
export const EXCHANGE_FLAGS = {
  NMS: "us", NYQ: "us", NGM: "us", NCM: "us", PCX: "us", ASE: "us", BTS: "us",
  PNK: "us", OQX: "us", OQB: "us", OID: "us", NEO: "ca", TOR: "ca", VAN: "ca",
  LSE: "gb", IOB: "gb", GER: "de", FRA: "de", BER: "de", STU: "de",
  PAR: "fr", AMS: "nl", EBS: "ch", MIL: "it", MCE: "es", STO: "se",
  JPX: "jp", TYO: "jp", HKG: "hk", ASX: "au", NSI: "in", BSE: "in",
  KSC: "kr", KOE: "kr", TAI: "tw", TWO: "tw", SAO: "br", MEX: "mx", SES: "sg",
};

// Yahoo's assetProfile gives a company's home country as a name; the table
// needs a flagcdn code for it. Intl.DisplayNames can turn a code into a name
// but not the reverse, so the index is built once by walking every ISO alpha-2
// code and asking for its English name - no country table to hand-maintain.
//
// SHORT_LABELS is only about how the column reads: the canonical names are
// long enough to wrap the cell, and "USA" is what the rest of the site says.
const SHORT_LABELS = new Map([
  ["United States", "USA"],
  ["United Kingdom", "UK"],
  ["United Arab Emirates", "UAE"],
]);

const A = 65;
const regionNames =
  typeof Intl !== "undefined" && Intl.DisplayNames
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

const FLAG_BY_COUNTRY = (() => {
  const map = new Map();
  if (!regionNames) return map;
  // The exchange codes are the ones the site already flies flags for, so they
  // seed the index and win any collision below.
  for (const code of new Set(Object.values(EXCHANGE_FLAGS))) {
    const name = regionNames.of(code.toUpperCase());
    if (name) map.set(name.toLowerCase(), code);
  }
  for (let i = A; i < A + 26; i++) {
    for (let j = A; j < A + 26; j++) {
      const code = String.fromCharCode(i, j);
      let name;
      try {
        name = regionNames.of(code);
      } catch {
        continue;
      }
      // Unassigned codes come back as the code itself.
      if (!name || name === code) continue;
      // Several names carry more than one code - UK beside GB, the withdrawn
      // DD beside DE - so an existing entry is never overwritten and the
      // explicit list below settles the rest.
      const key = name.toLowerCase();
      if (!map.has(key)) map.set(key, code.toLowerCase());
    }
  }
  // Names Yahoo uses that CLDR spells differently, plus current ISO codes for
  // the few names the sweep reaches by a withdrawn code first. These are set
  // last so they win outright.
  for (const [name, code] of [
    ["germany", "de"],
    ["united kingdom", "gb"],
    ["france", "fr"],
    ["hong kong", "hk"],
    ["macau", "mo"],
    ["czech republic", "cz"],
    ["turkey", "tr"],
    ["ivory coast", "ci"],
    ["cape verde", "cv"],
    ["palestine", "ps"],
    ["myanmar", "mm"],
    ["swaziland", "sz"],
  ])
    map.set(name, code);
  return map;
})();

// → { country, flag } for a company's home country name, or nulls when Yahoo
// gave nothing. An unrecognised name still shows, just without a flag.
export function countryLabel(name) {
  if (!name) return { country: null, flag: null };
  return {
    country: SHORT_LABELS.get(name) ?? name,
    flag: FLAG_BY_COUNTRY.get(name.toLowerCase()) ?? null,
  };
}

// The over-the-counter tiers. An OTC code means the quote is a foreign
// company's unlisted US line (TOYOF), not a listing on a US exchange (TM).
const OTC_CODES = new Set(["PNK", "OQX", "OQB", "OID", "OTC"]);
const isOtcExchange = (code) => OTC_CODES.has(code);

// Two lines of one company differ in punctuation and legal suffix - "Toyota
// Motor Corporation" against "Toyota Motor Corp" - so they're matched on the
// words left once those are gone.
const NOISE =
  /\b(the|inc|incorporated|corp|corporation|co|company|plc|ltd|limited|ag|sa|nv|group|holding|holdings)\b/g;
const nameKey = (name) =>
  (name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();

// Yahoo's "US region" screen returns both a foreign company's real US listing
// and its over-the-counter line. TM and TOYOF are the same Toyota carrying the
// same fundamentals, so the OTC row spends a slot to say nothing new.
//
// An OTC row is dropped only when that company also has a listed one. Where it
// doesn't - Roche, Nestlé, and everything else that never listed here - the OTC
// row is the only way to screen the company at all and stays. Pairs that really
// are two securities (GOOG/GOOGL, BRK-A/BRK-B) are never touched either, since
// neither side of them is the OTC one.
//
// Rows carry `name` and `exchangeCode`; input order is preserved.
export function dropOtcDuplicates(rows) {
  const listed = new Set(
    rows.filter((r) => !isOtcExchange(r.exchangeCode)).map((r) => nameKey(r.name))
  );
  return rows.filter(
    (r) => !isOtcExchange(r.exchangeCode) || !listed.has(nameKey(r.name))
  );
}

export function filterByMarketCapFloor(rows, floor) {
  return rows.filter((row) => Number.isFinite(row.marketCap) && row.marketCap >= floor);
}

export function formatUsdPrice(value) {
  return value == null
    ? "n/a"
    : `$${value.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
}

export function rankMarketRows(rows, metric) {
  return [...rows]
    .sort((a, b) => {
      const av = a[metric];
      const bv = b[metric];
      if (!Number.isFinite(av) && !Number.isFinite(bv)) return 0;
      if (!Number.isFinite(av)) return 1;
      if (!Number.isFinite(bv)) return -1;
      return bv - av;
    })
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function paginateMarketRows(rows, requestedPage, pageSize = 100) {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = clamp(Number(requestedPage) || 1, 1, pageCount);
  const start = (page - 1) * pageSize;
  return { page, pageCount, rows: rows.slice(start, start + pageSize) };
}
