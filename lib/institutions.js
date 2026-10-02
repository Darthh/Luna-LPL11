// The other half of the 13F universe: asset managers, custodian banks, wirehouse
// brokers and sovereign funds, as opposed to the trading firms and hedge funds
// in MANAGERS (lib/thirteenF.js).
//
// The split is by what a firm is, not by what it files - both file the same
// Form 13F, and the page reads them through exactly the same code. BlackRock
// running index funds and Citadel running a book are both "institutions" to the
// SEC, but nobody looking for one wants the other in the same list.
//
// Firms that appear on both sides of that line are kept where they were first:
// Susquehanna, Citadel, Jane Street, Dimensional, IMC and Optiver are trading
// firms that unusualwhales lists among institutions, and they stay under
// Hedgefunds so no firm shows up under both tabs.
//
// Sourced from unusualwhales.com/institutions and confirmed against each CIK's
// own Q2 2026 filing; the comment is that filing's reported total. Add to this
// list the same way as MANAGERS - by CIK, never by regenerating it wholesale.
export const INSTITUTIONS = [
  { cik: "0002012383", name: "BlackRock, Inc." }, // $6.73T
  { cik: "0002100119", name: "Vanguard Capital Management LLC" }, // $4.68T
  { cik: "0000093751", name: "State Street Corp" }, // $3.37T
  { cik: "0000315066", name: "FMR LLC (Fidelity)" }, // $2.30T
  { cik: "0002100121", name: "Vanguard Portfolio Management LLC" }, // $2.22T
  { cik: "0000895421", name: "Morgan Stanley" }, // $1.89T
  { cik: "0001214717", name: "Geode Capital Management, LLC" }, // $1.88T
  { cik: "0000019617", name: "JPMorgan Chase & Co" }, // $1.81T
  { cik: "0000070858", name: "Bank of America Corp" }, // $1.55T
  { cik: "0000914208", name: "Invesco Ltd." }, // $1.26T
  { cik: "0000886982", name: "Goldman Sachs Group Inc" }, // $1.15T
  { cik: "0001374170", name: "Norges Bank" }, // $1.00T
  { cik: "0000080255", name: "T. Rowe Price Associates Inc" }, // $999.1B
  { cik: "0000073124", name: "Northern Trust Corp" }, // $859.8B
  { cik: "0001422849", name: "Capital World Investors" }, // $846.4B
  { cik: "0001610520", name: "UBS Group AG" }, // $786.0B
  { cik: "0000884546", name: "Charles Schwab Investment Management Inc" }, // $751.3B
  { cik: "0001793755", name: "Banque Cantonale Vaudoise" }, // $721.7B
  { cik: "0001422848", name: "Capital Research Global Investors" }, // $716.9B
  { cik: "0001000275", name: "Royal Bank of Canada" }, // $671.5B
  { cik: "0000072971", name: "Wells Fargo & Company" }, // $617.4B
  { cik: "0001390777", name: "Bank of New York Mellon Corp" }, // $609.4B
  { cik: "0000902219", name: "Wellington Management Group LLP" }, // $580.2B
  { cik: "0000861177", name: "UBS Asset Management Americas LLC" }, // $550.1B
  { cik: "0000312069", name: "Barclays PLC" }, // $520.8B
  { cik: "0000820027", name: "Ameriprise Financial Inc" }, // $494.7B
  { cik: "0001562230", name: "Capital International Investors" }, // $483.6B
  { cik: "0000764068", name: "Legal & General Group PLC" }, // $479.6B
  { cik: "0000038777", name: "Franklin Resources Inc" }, // $461.9B
  { cik: "0000933478", name: "Vanguard Fiduciary Trust Co" }, // $454.4B
  { cik: "0001403438", name: "LPL Financial LLC" }, // $445.1B
  { cik: "0001407543", name: "Envestnet Asset Management Inc" }, // $423.6B
  { cik: "0001871926", name: "Nuveen, LLC" }, // $419.2B
  { cik: "0001330387", name: "Amundi" }, // $415.7B
  { cik: "0000720005", name: "Raymond James Financial Inc" }, // $368.9B
  { cik: "0000948046", name: "Deutsche Bank AG" }, // $344.4B
  { cik: "0000850529", name: "Fisher Asset Management, LLC" }, // $335.8B
  { cik: "0001445893", name: "CTC LLC" }, // $316.2B
  { cik: "0000912938", name: "Massachusetts Financial Services Co" }, // $315.2B
  { cik: "0000927971", name: "Bank of Montreal" }, // $303.7B
  { cik: "0000831001", name: "Citigroup Inc" }, // $302.7B
  { cik: "0001109448", name: "AllianceBernstein L.P." }, // $302.3B
  { cik: "0001067983", name: "Berkshire Hathaway Inc" }, // $299.3B
  { cik: "0001166588", name: "BNP Paribas Financial Markets" }, // $288.9B
];

// The listed parent behind a filer's CIK, for the manager logo on its page and
// in the lists. Only firms whose own shares trade are here: a logo comes from
// the ticker, and most managers on both rosters are private partnerships
// (Citadel, Geode, Bridgewater) or state funds (Norges Bank) with no ticker to
// look up. Those fall through to the letter tile /api/logo draws from the
// name, which is why this map is a lookup rather than a requirement.
//
// A subsidiary maps to the parent whose stock trades - Vanguard's several
// filing entities are all private, while UBS Asset Management Americas is the
// listed UBS Group.
export const MANAGER_TICKERS = {
  "0002012383": "BLK", // BlackRock, Inc.
  "0000093751": "STT", // State Street Corp
  "0000895421": "MS", // Morgan Stanley
  "0000019617": "JPM", // JPMorgan Chase & Co
  "0000070858": "BAC", // Bank of America Corp
  "0000914208": "IVZ", // Invesco Ltd.
  "0000886982": "GS", // Goldman Sachs Group Inc
  "0000080255": "TROW", // T. Rowe Price Associates Inc
  "0000073124": "NTRS", // Northern Trust Corp
  "0001610520": "UBS", // UBS Group AG
  "0000861177": "UBS", // UBS Asset Management Americas LLC
  "0000884546": "SCHW", // Charles Schwab Investment Management Inc
  "0001000275": "RY", // Royal Bank of Canada
  "0000072971": "WFC", // Wells Fargo & Company
  "0001390777": "BK", // Bank of New York Mellon Corp
  "0000312069": "BCS", // Barclays PLC
  "0000820027": "AMP", // Ameriprise Financial Inc
  "0000764068": "LGEN.L", // Legal & General Group PLC
  "0000038777": "BEN", // Franklin Resources Inc
  "0001403438": "LPLA", // LPL Financial LLC
  "0000720005": "RJF", // Raymond James Financial Inc
  "0000948046": "DB", // Deutsche Bank AG
  "0000927971": "BMO", // Bank of Montreal
  "0000831001": "C", // Citigroup Inc
  "0001067983": "BRK-B", // Berkshire Hathaway Inc
  "0001166588": "BNP.PA", // BNP Paribas Financial Markets
  "0001330387": "AMUN.PA", // Amundi
  "0001637460": "EMG.L", // Man Group plc
};
