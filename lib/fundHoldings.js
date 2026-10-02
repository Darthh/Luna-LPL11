// Complete constituent lists for the fund-backed stock maps.
//
// stockanalysis (lib/etfHoldings) only publishes each fund's top 25, which is
// nowhere near a map of an index. These come from the issuers' own daily
// holdings files instead, which carry every position plus its sector and
// listing exchange. BlackRock's US site serves its HTML shell to anything
// without a browser session, so the two MSCI funds are read from the same
// index at BlackRock's Canadian site, where the files are public: XEC tracks
// MSCI EM IMI (IEMG's benchmark) and XEF tracks MSCI EAFE IMI (IEFA's).
//
// EM used to come from iShares UK's EIMI, on the same index. That site was
// rebuilt and now answers the .ajax file URL with the product page, at HTTP
// 200 under a text/html content type, so there was nothing to notice but an
// empty map. If a file here ever starts arriving as markup again, that's the
// same failure and the fix is another issuer site serving the same index.
import { STOCK_UNIVERSE } from "@/lib/stockMapData";
import { BROWSER_USER_AGENT } from "@/lib/userAgent";

// Holdings files change once a day; the maps refresh far more often than that.
const REVALIDATE = 21600;

const IEMG_INDEX_FILE =
  "https://www.blackrock.com/ca/investors/en/products/251423/ishares-msci-emerging-markets-imi-index-etf/1464253357814.ajax?fileType=csv&fileName=XEC_holdings&dataType=fund";
const IEFA_INDEX_FILE =
  "https://www.blackrock.com/ca/investors/en/products/251421/ishares-msci-eafe-imi-index-etf/1464253357814.ajax?fileType=csv&fileName=XEF_holdings&dataType=fund";
// US total market, used only as a ticker → sector lookup for the Russell map:
// Vanguard's holdings feed doesn't carry sectors.
const US_SECTOR_FILE =
  "https://www.blackrock.com/ca/investors/en/products/310717/ishares-core-s-p-u-s-total-market-index-etf/1464253357814.ajax?fileType=csv&fileName=XUU_U_holdings&dataType=fund";

export const FUND_MAPS = {
  r1000: { label: "Russell 1000", fund: "VONV", note: "Russell 1000 Value (VONV)" },
  em: { label: "Emerging Markets", fund: "IEMG", note: "MSCI Emerging Markets IMI - IEMG's index" },
  eafe: { label: "Europe, Aust. & Far East", fund: "IEFA", note: "MSCI EAFE IMI - IEFA's index" },
};

// BlackRock's exchange names → Yahoo's ticker suffix. Everything not listed
// is a market Yahoo indexes under a different code (Bursa Malaysia numbers
// its listings) or doesn't carry at all (the Gulf exchanges, Moscow); those
// holdings are dropped rather than shown as tiles that can't be priced.
const EXCHANGE_SUFFIX = {
  "Tokyo Stock Exchange": "T", "London Stock Exchange": "L", "Asx - All Markets": "AX",
  Xetra: "DE", "Deutsche Boerse Xetra": "DE", "Nyse Euronext - Euronext Paris": "PA",
  "SIX Swiss Exchange": "SW", "Tel Aviv Stock Exchange": "TA", "Borsa Italiana": "MI",
  "Hong Kong Exchanges And Clearing Ltd": "HK", "Singapore Exchange": "SI",
  "Euronext Amsterdam": "AS", "Oslo Bors Asa": "OL", "Bolsa De Madrid": "MC",
  "Omx Nordic Exchange Copenhagen A/S": "CO", "Nyse Euronext - Euronext Brussels": "BR",
  "Nasdaq Omx Helsinki Ltd.": "HE", "Wiener Boerse Ag": "VI", "New Zealand Exchange Ltd": "NZ",
  "Nyse Euronext - Euronext Lisbon": "LS", "Irish Stock Exchange - All Market": "IR",
  "National Stock Exchange Of India": "NS", "Bse Ltd": "BO", "Taiwan Stock Exchange": "TW",
  "Gretai Securities Market": "TWO", "Shanghai Stock Exchange": "SS",
  "Shenzhen Stock Exchange": "SZ", "Korea Exchange (Stock Market)": "KS",
  "Korea Exchange (Kosdaq)": "KQ", "Saudi Stock Exchange": "SR", XBSP: "SA",
  "Stock Exchange Of Thailand": "BK", "Johannesburg Stock Exchange": "JO",
  "Istanbul Stock Exchange": "IS", "Indonesia Stock Exchange": "JK",
  "Bolsa Mexicana De Valores": "MX", "Warsaw Stock Exchange/Equities/Main Market": "WA",
  "Philippine Stock Exchange Inc.": "PS", "Santiago Stock Exchange": "SN",
  "Athens Exchange S.A. Cash Market": "AT", "Qatar Exchange": "QA",
  "Egyptian Exchange": "CA", "Budapest Stock Exchange": "BD", "Prague Stock Exchange": "PR",
  "Bolsa De Valores De Colombia": "CL", "New York Stock Exchange Inc.": "", NASDAQ: "",
  "Cboe BZX": "",
};
// One name covers four countries on the Nordic exchange.
const NORDIC_SUFFIX = { Sweden: "ST", Finland: "HE", Denmark: "CO", Norway: "OL", Iceland: "IC" };

// The issuers label sectors in GICS; the preset maps use Yahoo's names. Map
// them so every map on the page speaks one vocabulary.
const SECTOR_ALIASES = {
  "Information Technology": "Technology",
  "Health Care": "Healthcare",
  "Consumer Discretionary": "Consumer Cyclical",
  "Consumer Staples": "Consumer Defensive",
  Financials: "Financial Services",
  Materials: "Basic Materials",
  Communication: "Communication Services",
  "Communication Services": "Communication Services",
};
const sectorName = (raw) => SECTOR_ALIASES[raw?.trim()] ?? (raw?.trim() || "Other");

function splitCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else cell += ch;
  }
  cells.push(cell.trim());
  return cells;
}

// The files open with a couple of preamble lines before the real header.
function parseHoldingsCsv(text) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.startsWith("Ticker,"));
  if (headerIdx === -1) throw new Error("No holdings header");
  const cols = splitCsvLine(lines[headerIdx]);
  const rows = [];
  for (const line of lines.slice(headerIdx + 1)) {
    if (!line.trim()) continue;
    const cells = splitCsvLine(line);
    if (cells.length < cols.length - 2) continue;
    const row = {};
    cols.forEach((c, i) => (row[c] = cells[i] ?? ""));
    rows.push(row);
  }
  return rows;
}

const toNumber = (v) => {
  const n = Number(String(v ?? "").replace(/[,"]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

function yahooSymbol(ticker, exchange, location) {
  const raw = ticker?.trim().toUpperCase();
  if (!raw) return null;
  const suffix = exchange === "Nasdaq Omx Nordic" ? NORDIC_SUFFIX[location] : EXCHANGE_SUFFIX[exchange];
  if (suffix === undefined) return null;
  // Share classes are dotted in the files and dashed at Yahoo; Hong Kong pads
  // its codes to four digits.
  const base = raw.replace(/[.\s]/g, "-");
  if (!suffix) return base;
  return `${suffix === "HK" ? base.replace(/^0+/, "").padStart(4, "0") : base}.${suffix}`;
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": BROWSER_USER_AGENT }, next: { revalidate: REVALIDATE } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  // BlackRock's US site answers data URLs with the product page; the regional
  // ones serve the file. Catch a page served under a CSV content type.
  if (text.trimStart().startsWith("<")) throw new Error("Got a page, not a file");
  return text;
}

// Weights come from market value rather than the file's own weight column,
// which is rounded to two decimals and so reads 0.00 for a third of an
// index-tracking fund's tail.
function weighted(rows) {
  // A fund can report one holding on several lines - Vanguard files 15 of the
  // Russell's names twice - and two rows with one ticker are one company with
  // its position split, not two tiles. Left unmerged they collide on the map's
  // React key, which drops the duplicate and sizes the survivor by half its
  // real weight.
  const merged = new Map();
  for (const row of rows) {
    const hit = merged.get(row.symbol);
    if (hit) hit.value += row.value;
    else merged.set(row.symbol, { ...row });
  }
  const holdings = [...merged.values()];
  const total = holdings.reduce((a, r) => a + r.value, 0);
  if (!total) throw new Error("No market value");
  return holdings.map(({ value, ...rest }) => ({ ...rest, weight: (value / total) * 100 }));
}

async function fetchBlackRockFund(url) {
  const rows = parseHoldingsCsv(await fetchText(url));
  const holdings = [];
  for (const row of rows) {
    if (row["Asset Class"] !== "Equity") continue;
    // Both Canadian funds park a few percent in their US sibling - XEC holds
    // IEMG, XEF holds IEFA - and the file files those as ordinary equity, in
    // Financials. That's a fund, not a constituent, and it would tile as one
    // of the ten largest companies in the index.
    if (/^ISHARES\b/i.test(row.Name ?? "")) continue;
    const symbol = yahooSymbol(row.Ticker, row.Exchange, row.Location);
    const value = toNumber(row["Market Value"]);
    if (!symbol || value <= 0) continue;
    holdings.push({ symbol, name: row.Name || symbol, sector: sectorName(row.Sector), value });
  }
  if (!holdings.length) throw new Error("No equity holdings");
  return weighted(holdings);
}

async function fetchVanguardFund(fund) {
  const rows = [];
  let size = Infinity;
  for (let start = 1; start <= 5000 && rows.length < size; start += 500) {
    const url = `https://investor.vanguard.com/investment-products/etfs/profile/api/${fund.toLowerCase()}/portfolio-holding/stock?start=${start}&count=500`;
    const res = await fetch(url, { headers: { "User-Agent": BROWSER_USER_AGENT }, next: { revalidate: REVALIDATE } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    size = json?.size ?? rows.length;
    const page = json?.fund?.entity ?? [];
    if (!page.length) break;
    rows.push(...page);
  }
  if (!rows.length) throw new Error("No Vanguard holdings");
  return rows;
}

// Ticker → sector for US listings, from the total-market fund's file.
async function fetchUsSectors() {
  const sectors = new Map();
  try {
    for (const row of parseHoldingsCsv(await fetchText(US_SECTOR_FILE))) {
      if (row["Asset Class"] !== "Equity" || !row.Ticker) continue;
      sectors.set(row.Ticker.trim().replace(/\./g, "-"), sectorName(row.Sector));
    }
  } catch {
    /* the static universe still covers the large caps */
  }
  return sectors;
}

const UNIVERSE_SECTORS = new Map(STOCK_UNIVERSE.map((s) => [s.symbol, s]));

async function buildRussellMap(fund) {
  const [rows, usSectors] = await Promise.all([fetchVanguardFund(fund), fetchUsSectors()]);
  const holdings = [];
  for (const row of rows) {
    const symbol = row.ticker?.trim().toUpperCase().replace(/\./g, "-");
    const value = Number(row.marketValue);
    if (!symbol || !Number.isFinite(value) || value <= 0) continue;
    const known = UNIVERSE_SECTORS.get(symbol);
    holdings.push({
      symbol,
      name: row.longName || row.shortName || symbol,
      sector: usSectors.get(symbol) ?? known?.sector ?? "Other",
      industry: known?.industry ?? null,
      cap: known?.cap ?? null,
      value,
    });
  }
  if (!holdings.length) throw new Error("No Vanguard equity holdings");
  return weighted(holdings);
}

// Every constituent of the named map's index, weighted by position size.
export async function fetchFundMap(key) {
  if (key === "r1000") return buildRussellMap(FUND_MAPS[key].fund);
  if (key === "em") return fetchBlackRockFund(IEMG_INDEX_FILE);
  if (key === "eafe") return fetchBlackRockFund(IEFA_INDEX_FILE);
  throw new Error("Unknown fund map");
}
