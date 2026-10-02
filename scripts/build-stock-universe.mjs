// Builds lib/stockMapData.js: index constituents + sector/industry + market-cap snapshot.
import { writeFileSync } from "node:fs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\[\d+\]/g, "")
    .trim();
}

// Extract rows of the first wikitable whose header row contains headerHint.
function parseTable(html, headerHint) {
  const tables = [...html.matchAll(/<table[^>]*>[\s\S]*?<\/table>/g)].map((m) => m[0]);
  for (const table of tables) {
    const rows = table
      .split(/<tr[^>]*>/)
      .slice(1)
      .map((row) =>
        [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => stripTags(m[1]))
      )
      .filter((cells) => cells.length > 0);
    if (rows.length > 5 && rows[0].some((c) => c.toLowerCase().includes(headerHint))) {
      return rows;
    }
  }
  throw new Error(`table with header "${headerHint}" not found`);
}

const SECTOR_MAP = {
  "Information Technology": "Technology",
  "Communication Services": "Communication Services",
  "Consumer Discretionary": "Consumer Cyclical",
  "Health Care": "Healthcare",
  Financials: "Financial",
  Industrials: "Industrials",
  "Consumer Staples": "Consumer Defensive",
  Energy: "Energy",
  Utilities: "Utilities",
  "Real Estate": "Real Estate",
  Materials: "Basic Materials",
};

const yahooSymbol = (s) => s.replace(/\./g, "-");

async function main() {
  const stocks = new Map(); // symbol -> {symbol,name,sector,industry,indexes:Set}

  function add(symbol, name, sector, industry, index) {
    symbol = yahooSymbol(symbol);
    if (!stocks.has(symbol)) {
      stocks.set(symbol, { symbol, name, sector, industry, indexes: new Set() });
    }
    const s = stocks.get(symbol);
    if (sector && !s.sector) s.sector = sector;
    if (industry && !s.industry) s.industry = industry;
    if (name && !s.name) s.name = name;
    s.indexes.add(index);
  }

  // --- S&P 500 ---
  const sp = parseTable(
    await fetchText("https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"), "symbol"
  );
  for (const cells of sp) {
    if (cells.length < 4 || cells[0] === "Symbol") continue;
    const [symbol, name, sector, industry] = cells;
    add(symbol, name, SECTOR_MAP[sector] ?? sector, industry, "sp500");
  }
  console.log("S&P 500:", [...stocks.values()].filter((s) => s.indexes.has("sp500")).length);

  // --- Nasdaq 100 (official Nasdaq API) ---
  const ndxJson = JSON.parse(
    await fetchText("https://api.nasdaq.com/api/quote/list-type/nasdaq100")
  );
  for (const row of ndxJson?.data?.data?.rows ?? []) {
    const name = row.companyName
      ?.replace(/ (Common Stock|Class [A-C] Common Stock|Ordinary Shares.*|American Depositary Shares.*|Common Shares.*)$/i, "")
      .trim();
    add(row.symbol, name, null, null, "ndx100");
  }
  console.log("NDX100:", [...stocks.values()].filter((s) => s.indexes.has("ndx100")).length);

  // --- Dow 30 ---
  const dow = parseTable(
    await fetchText("https://en.wikipedia.org/wiki/Dow_Jones_Industrial_Average"), "exchange"
  );
  for (const cells of dow) {
    if (cells.length < 4 || cells[0] === "Company") continue;
    // Columns: Company | Exchange | Symbol | Industry | ...
    const name = cells[0];
    const symbol = cells[2].replace(/^NYSE:\s*|^NASDAQ:\s*/i, "");
    if (!/^[A-Z.]{1,6}$/.test(symbol)) continue;
    add(symbol, name, null, null, "dow30");
  }
  console.log("Dow30:", [...stocks.values()].filter((s) => s.indexes.has("dow30")).length);

  // --- Russell 1000 ---
  // The broad-market list: the S&P 500 plus roughly as many again below it.
  // The supply-chain map reads this tag, so a mid-cap supplier is a company
  // there rather than a name the graph has to skip. Industry is left for the
  // Yahoo profile pass - Wikipedia's GICS sub-industry is a different taxonomy
  // from the one the rest of the app groups by.
  const r1000 = parseTable(
    await fetchText("https://en.wikipedia.org/wiki/Russell_1000_Index"), "gics sub-industry"
  );
  for (const cells of r1000) {
    if (cells.length < 3 || cells[1] === "Symbol") continue;
    const [name, symbol, sector] = cells;
    if (!/^[A-Z.]{1,6}$/.test(symbol)) continue;
    add(symbol, name, SECTOR_MAP[sector] ?? sector, null, "russell1000");
  }
  console.log("Russell 1000:", [...stocks.values()].filter((s) => s.indexes.has("russell1000")).length);

  // --- SOXX (iShares Semiconductor ETF holdings, curated) ---
  const soxx = [
    "NVDA", "AVGO", "AMD", "TSM", "QCOM", "TXN", "INTC", "MU", "KLAC", "LRCX",
    "AMAT", "ASML", "MRVL", "ADI", "NXPI", "MCHP", "ON", "MPWR", "TER", "SWKS",
    "QRVO", "ENTG", "LSCC", "RMBS", "STM", "GFS", "UMC", "ASX", "ALAB", "CRDO",
  ];
  for (const s of soxx) add(s, null, "Technology", "Semiconductors", "soxx");

  // --- DRAM / memory & storage, curated ---
  const dram = ["MU", "SNDK", "WDC", "STX", "SIMO", "RMBS", "NTAP"];
  for (const s of dram) add(s, null, "Technology", "Memory & Storage", "dram");

  // Non-S&P names need metadata filled in.
  const extraMeta = {
    TSM: ["Taiwan Semiconductor", "Technology", "Semiconductors"],
    ASML: ["ASML Holding", "Technology", "Semiconductor Equipment"],
    STM: ["STMicroelectronics", "Technology", "Semiconductors"],
    GFS: ["GlobalFoundries", "Technology", "Semiconductors"],
    UMC: ["United Microelectronics", "Technology", "Semiconductors"],
    ASX: ["ASE Technology", "Technology", "Semiconductor Packaging"],
    ALAB: ["Astera Labs", "Technology", "Semiconductors"],
    CRDO: ["Credo Technology", "Technology", "Semiconductors"],
    SNDK: ["Sandisk", "Technology", "Memory & Storage"],
    SIMO: ["Silicon Motion", "Technology", "Memory & Storage"],
    RMBS: ["Rambus", "Technology", "Memory & Storage"],
    MSTR: ["Strategy", "Technology", "Software - Application"],
    ALNY: ["Alnylam Pharmaceuticals", "Healthcare", "Biotechnology"],
    MELI: ["MercadoLibre", "Consumer Cyclical", "Internet Retail"],
    NBIS: ["Nebius Group", "Technology", "AI Infrastructure"],
    SHOP: ["Shopify", "Technology", "Software - Application"],
    CCEP: ["Coca-Cola Europacific", "Consumer Defensive", "Beverages - Non-Alcoholic"],
    PDD: ["PDD Holdings", "Consumer Cyclical", "Internet Retail"],
    RKLB: ["Rocket Lab", "Industrials", "Aerospace & Defense"],
    ARM: ["Arm Holdings", "Technology", "Semiconductors"],
    TRI: ["Thomson Reuters", "Industrials", "Specialty Business Services"],
    FER: ["Ferrovial", "Industrials", "Infrastructure Operations"],
    CRWV: ["CoreWeave", "Technology", "AI Infrastructure"],
    SPCX: ["SpaceX", "Industrials", "Aerospace & Defense"],
  };
  for (const [sym, [name, sector, industry]] of Object.entries(extraMeta)) {
    const s = stocks.get(sym);
    if (s) {
      s.name = name; // curated names beat the exchange's verbose legal names
      if (!s.sector) s.sector = sector;
      if (!s.industry) s.industry = industry;
    }
  }

  // --- Market caps via Yahoo quote (cookie + crumb) ---
  const cookieRes = await fetch("https://fc.yahoo.com", {
    headers: { "User-Agent": UA },
    redirect: "manual",
  });
  const cookie = cookieRes.headers.get("set-cookie")?.split(";")[0];
  const crumb = await (
    await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": UA, Cookie: cookie },
    })
  ).text();
  console.log("crumb:", crumb);

  const symbols = [...stocks.keys()];
  for (let i = 0; i < symbols.length; i += 100) {
    const batch = symbols.slice(i, i + 100);
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${batch.join(",")}&fields=marketCap,shortName&crumb=${encodeURIComponent(crumb)}`;
    const json = await (
      await fetch(url, { headers: { "User-Agent": UA, Cookie: cookie } })
    ).json();
    for (const q of json?.quoteResponse?.result ?? []) {
      const s = stocks.get(q.symbol);
      if (s) {
        s.cap = q.marketCap ?? null;
        if (q.shortName && !s.name) s.name = q.shortName;
      }
    }
    console.log(`caps batch ${i / 100 + 1}: ok`);
  }

  // --- Sector/industry from Yahoo assetProfile (Morningstar-style taxonomy,
  // matches Finviz's map groupings, e.g. AAPL → "Consumer Electronics"). This
  // overrides the coarser GICS labels scraped from Wikipedia.
  const profileSymbols = [...stocks.keys()];
  let profileDone = 0;
  let cursor = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (cursor < profileSymbols.length) {
        const symbol = profileSymbols[cursor++];
        // One retry: a thousand-symbol run trips Yahoo's rate limiter often
        // enough that a single miss would leave real companies filed under
        // "Other", which is a group the map cannot colour meaningfully.
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=assetProfile&crumb=${encodeURIComponent(crumb)}`;
            const json = await (
              await fetch(url, { headers: { "User-Agent": UA, Cookie: cookie } })
            ).json();
            const profile = json?.quoteSummary?.result?.[0]?.assetProfile;
            if (profile?.sector && profile?.industry) {
              const s = stocks.get(symbol);
              s.sector = profile.sector;
              s.industry = profile.industry.replace(/—/g, " - ").replace(/&amp;/g, "&");
              break;
            }
          } catch {}
          await new Promise((r) => setTimeout(r, 400));
        }
        profileDone++;
        if (profileDone % 100 === 0) console.log(`profiles: ${profileDone}/${profileSymbols.length}`);
      }
    })
  );

  // Secondary share classes Finviz's map omits - keep one tile per company.
  // The Russell list carries both classes of a dozen more names; a second
  // class is the same company twice, which on a treemap is a duplicate tile
  // and on the supply-chain map is a second dot with the same relationships.
  for (const dupe of [
    "GOOG", "FOX", "NWS", "HEI-A", "LEN-B", "UHAL-B", "ZG", "LBRDA", "LBTYA",
    "FWONA", "LLYVA", "GLIBA", "UA", "BF-A",
  ]) {
    stocks.delete(dupe);
  }

  // Align stragglers whose profile fetch failed with Yahoo's sector name.
  for (const s of stocks.values()) {
    if (s.sector === "Financial") s.sector = "Financial Services";
  }

  const missingCap = [...stocks.values()].filter((s) => !s.cap);
  console.log("missing caps:", missingCap.map((s) => s.symbol).join(",") || "none");
  const missingMeta = [...stocks.values()].filter((s) => !s.sector || !s.name);
  console.log("missing meta:", missingMeta.map((s) => s.symbol).join(",") || "none");

  const out = [...stocks.values()]
    .filter((s) => s.cap && s.sector)
    .sort((a, b) => b.cap - a.cap)
    .map((s) => ({
      symbol: s.symbol,
      name: s.name,
      sector: s.sector,
      industry: s.industry ?? "Other",
      cap: s.cap,
      indexes: [...s.indexes],
    }));

  const file = `// Generated ${new Date().toISOString().slice(0, 10)} from Wikipedia index
// constituent lists + a Yahoo Finance market-cap snapshot. Market caps are a
// static snapshot used only for treemap tile sizing; performance data is live.
// Regenerate with scripts/build-stock-universe.mjs if constituents drift.

export const STOCK_UNIVERSE = ${JSON.stringify(out, null, 1)};
`;
  writeFileSync(new URL("../lib/stockMapData.js", import.meta.url), file);
  console.log("wrote", out.length, "stocks");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
