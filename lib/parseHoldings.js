// Turning a pasted or uploaded statement into holdings.
//
// Brokers all export something CSV-shaped and none of them agree on the
// columns, so rather than a schema this looks for the two things every export
// has: a column that looks like a ticker and a column of numbers that is
// either share counts or percentages. Everything else is ignored.
//
// The same scan handles text pulled out of a PDF, which is why this is a line
// scanner rather than a strict CSV parser - a PDF's text layer comes out as
// ragged whitespace-separated lines, not commas.

// A ticker is 1-5 letters, optionally with a class suffix (BRK.B) - loose
// enough for real symbols, tight enough to reject "TOTAL" and "CASH".
const TICKER = /^[A-Z]{1,5}(?:[.\-][A-Z]{1,2})?$/;

// Words that look like tickers but name a row rather than a holding.
const NOT_TICKERS = new Set([
  "TOTAL", "CASH", "SUM", "USD", "NAV", "N", "A", "NA", "TICKER", "SYMBOL",
  "QTY", "SHARES", "UNITS", "VALUE", "PRICE", "COST", "GAIN", "LOSS", "PCT",
  "WEIGHT", "NAME", "ACCOUNT", "DATE", "TYPE", "CUSIP", "CLASS",
]);

// A number with optional thousands separators, currency, percent or
// parenthesised negative - all of which appear in broker exports.
function toNumber(raw) {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;
  const negative = /^\(.*\)$/.test(text);
  const cleaned = text.replace(/[()$,%\s]/g, "");
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

// One line into fields. Commas when the line has them, whitespace otherwise -
// which is what a PDF's text layer gives.
function fields(line) {
  const cells = line.includes(",") ? splitCsvLine(line) : line.trim().split(/\s{2,}|\t+/);
  return cells.map((c) => c.trim().replace(/^"|"$/g, "")).filter(Boolean);
}

// A CSV line respecting quoted fields, since a company name with a comma in it
// ("Alphabet, Inc.") would otherwise shift every column after it.
function splitCsvLine(line) {
  const out = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cell);
      cell = "";
    } else cell += ch;
  }
  out.push(cell);
  return out;
}

// Whether the header row names a percentage column, which decides how the
// numbers are read. Without a header the numbers are treated as shares unless
// they are all small and sum to about 100.
function looksLikeWeightHeader(header) {
  return header.some((h) => /(weight|alloc|percent|%)/i.test(h));
}

/**
 * Parse holdings out of CSV or PDF-extracted text.
 * Returns { holdings: [{symbol, shares, weight}], warnings: [] }.
 */
export function parseHoldings(text) {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const warnings = [];
  if (!lines.length) return { holdings: [], warnings: ["The file was empty."] };

  const header = fields(lines[0]);
  const headerIsLabels = header.every((h) => !TICKER.test(h.toUpperCase()) || NOT_TICKERS.has(h.toUpperCase()));
  const weightMode = headerIsLabels && looksLikeWeightHeader(header);

  const found = new Map();
  for (const line of lines.slice(headerIsLabels ? 1 : 0)) {
    const cells = fields(line);
    if (cells.length < 2) continue;

    const symbol = cells
      .map((c) => c.toUpperCase())
      .find((c) => TICKER.test(c) && !NOT_TICKERS.has(c));
    if (!symbol) continue;

    // The first number on the row that is not the ticker itself. Broker
    // exports put quantity before price and value, so first-number-wins lands
    // on the quantity far more often than not.
    const numbers = cells.map(toNumber).filter((n) => n != null && n > 0);
    if (!numbers.length) continue;
    const amount = numbers[0];

    // Later rows for the same ticker add to it rather than replacing - a
    // statement can list one holding across several lots.
    const prev = found.get(symbol);
    found.set(symbol, (prev ?? 0) + amount);
  }

  if (!found.size) {
    return {
      holdings: [],
      warnings: ["No holdings found. Expected rows with a ticker and a quantity or weight."],
    };
  }

  const entries = [...found.entries()];
  const sum = entries.reduce((a, [, v]) => a + v, 0);
  // Percentages announce themselves: a column of values summing to roughly 100
  // with none above 100 is an allocation, not a pile of share counts.
  const asWeights = weightMode || (sum > 95 && sum < 105 && entries.every(([, v]) => v <= 100));

  const holdings = entries.map(([symbol, value]) =>
    asWeights ? { symbol, shares: null, weight: value } : { symbol, shares: value, weight: null }
  );

  if (asWeights && !weightMode) {
    warnings.push("Read the numbers as percentage weights, since they sum to about 100.");
  }
  return { holdings, warnings };
}

// PDFs are a container, not text. Rather than ship a parser, the text layer is
// pulled out of the raw bytes: a text-based statement (which is what a broker
// generates) stores its strings in content streams as (…) Tj / TJ arrays, and
// those are readable whenever the stream is not compressed. A scanned
// statement is an image and has no text at all - the caller is told to paste
// instead, which is honest about what this does and does not handle.
//
// ponytail: no pdf library. Handles uncompressed text-layer PDFs; if broker
// statements in the wild turn out to be mostly FlateDecode, add pdfjs-dist
// and swap this out.
export function extractPdfText(bytes) {
  const raw = new TextDecoder("latin1").decode(bytes);
  const out = [];

  // (string) Tj  and  [(a) -20 (b)] TJ
  const re = /\((?:\\.|[^\\()])*\)/g;
  const streams = raw.split(/stream\r?\n/).slice(1);
  for (const chunk of streams) {
    const body = chunk.split(/endstream/)[0];
    // A compressed stream is binary noise; skip it rather than emit garbage.
    if (/[\x00-\x08\x0e-\x1f]/.test(body.slice(0, 200))) continue;
    for (const match of body.match(re) ?? []) {
      const text = match
        .slice(1, -1)
        .replace(/\\([()\\])/g, "$1")
        .replace(/\\[rn]/g, " ");
      if (text.trim()) out.push(text);
    }
    out.push("\n");
  }
  return out.join(" ");
}
