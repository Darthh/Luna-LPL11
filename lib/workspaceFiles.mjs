import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { reportLayout, reportSheets } from './reportLayout.mjs';

export function documentTable(item) {
  if (item.report) {
    const table = item.report.pages.find(p => p.custom && p.table)?.table;
    if (!item.report.snapshot?.portfolios?.length && table) return table;
    if (!item.report.snapshot?.portfolios?.length) return { columns: ['Page', 'Content'], rows: item.report.pages.filter(p => p.visible).map(p => [p.name, p.text || '']) };
    return { columns: ['Portfolio', 'Ticker', 'Name', 'Weight (%)', 'Last Price', 'Sector', 'Country'], rows: (item.report.snapshot?.portfolios || []).flatMap(p => (p.holdings || []).map(h => [p.name, h.symbol, h.name, h.weight ?? '', h.price ?? '', h.sector ?? '', h.country ?? ''])) };
  }
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
  if (item.report) {
    const color = hex => { const s = /^#[a-f0-9]{6}$/i.test(hex) ? hex : '#283441'; return rgb(...[1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16) / 255)); };
    const images = new Map();
    for (const [index, sheet] of reportSheets(item.report).entries()) {
      const p = doc.addPage([792, 612]);
      for (const command of reportLayout(item.report, sheet, index + 1)) {
        const c = command;
        if (c.type === 'text') p.drawText(c.value.replace(/[\u0000-\u0008\u000b-\u001f]/g, ''), { x: c.x, y: 612 - c.y, size: c.size, font, color: color(c.fill) });
        if (c.type === 'rect') p.drawRectangle({ x: c.x, y: 612 - c.y - c.height, width: c.width, height: c.height, color: color(c.fill), ...(c.stroke !== 'none' ? { borderColor: color(c.stroke), borderWidth: .5 } : {}) });
        if (c.type === 'line') p.drawLine({ start: { x: c.x1, y: 612 - c.y1 }, end: { x: c.x2, y: 612 - c.y2 }, color: color(c.stroke), thickness: c.width });
        if (c.type === 'polyline') for (let j = 1; j < c.points.length; j++) p.drawLine({ start: { x: c.points[j - 1][0], y: 612 - c.points[j - 1][1] }, end: { x: c.points[j][0], y: 612 - c.points[j][1] }, color: color(c.stroke), thickness: c.width });
        if (c.type === 'polygon') p.drawSvgPath(c.points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ') + ' Z', { x: 0, y: 612, color: color(c.fill), opacity: c.opacity ?? 1 });
        if (c.type === 'image') {
          if (!images.has(c.src)) images.set(c.src, c.src.startsWith('data:image/png') ? await doc.embedPng(c.src) : await doc.embedJpg(c.src));
          const img = images.get(c.src), fit = img.scaleToFit(c.width, c.height);
          p.drawImage(img, { x: c.x + (c.width - fit.width) / 2, y: 612 - c.y - c.height + (c.height - fit.height) / 2, ...fit });
        }
      }
    }
    return doc.save();
  }
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
