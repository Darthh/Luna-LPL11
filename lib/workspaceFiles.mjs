import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import path from "node:path";

export function documentTable(item) {
  if (item.table) return item.table;
  if (item.holdings?.length) return { columns: ["Symbol", "Shares", "Weight (%)"], rows: item.holdings.map(h => [h.symbol, h.shares ?? "", h.weight ?? ""]) };
  return { columns: ["Title", "Content"], rows: [[item.name, item.content || ""]] };
}

export function documentCsv(item) {
  const table = documentTable(item);
  const cell = value => {
    const string = String(value ?? "");
    // Quoting alone does not prevent spreadsheet formulas from executing.
    const safe = /^[\s]*[=+@-]/.test(string) && typeof value !== "number" ? "'" + string : string;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return "\uFEFF" + [table.columns, ...table.rows].map(row => row.map(cell).join(",")).join("\r\n");
}

let fontBytes;
export async function documentPdf(item) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  fontBytes ??= readFile(path.join(process.cwd(), "assets/fonts/NotoSans-Regular.ttf"));
  // Keep the complete font: subsetting this Noto build loses glyphs in some
  // readers even though the PDF remains structurally valid.
  const font = await doc.embedFont(await fontBytes);
  doc.setTitle(item.name);
  doc.setCreator("Luna Terminal");
  let page, y;
  const fresh = () => {
    page = doc.addPage([612, 792]); y = 728;
    page.drawText("LUNA TERMINAL", { x: 48, y: 758, size: 9, font, color: rgb(0.3, 0.35, 0.4) });
  };
  fresh();
  const write = (text, size = 11, space = 6) => {
    for (const paragraph of String(text).replace(/[\u0000-\u0008\u000b-\u001f]/g, "").split("\n")) {
      let line = "";
      const flush = () => {
          if (y < 58) fresh();
          if (line) page.drawText(line.trimEnd(), { x: 48, y, size, font });
          y -= size + 5; line = "";
      };
      for (const token of paragraph.replace(/\t/g, "    ").match(/\S+|\s+/g) || []) {
        if (font.widthOfTextAtSize(line + token, size) > 516 && line) flush();
        if (!line && !token.trim()) continue;
        if (font.widthOfTextAtSize(token, size) <= 516) line += token;
        else for (const char of token) {
          if (font.widthOfTextAtSize(line + char, size) > 516 && line) flush();
          line += char;
        }
      }
      flush(); y -= space;
    }
  };
  write(item.name, 19, 10);
  if (item.client) write(`Client: ${item.client}`);
  if (item.preparedBy) write(`Prepared by: ${item.preparedBy}`);
  if (item.blurb) write(item.blurb);
  if (item.content) write(item.content);
  if (item.table || item.holdings?.length) {
    const table = documentTable(item);
    write("Data", 14);
    for (const row of table.rows) write(row.map((cell, i) => `${table.columns[i]}: ${cell ?? ""}`).join("    |    "), 10, 3);
  }
  for (const [i, p] of doc.getPages().entries()) p.drawText(`${i + 1} / ${doc.getPageCount()}`, { x: 520, y: 28, size: 9, font });
  return doc.save();
}
