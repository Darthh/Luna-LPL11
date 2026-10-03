import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import {
  newReport,
  reportRecord,
  validateReport,
  REPORT_TYPES,
  reportFromItem,
} from "./reportSpec.mjs";
import {
  portfolioSeries,
  seriesMetrics,
  loadReportData,
} from "./reportData.mjs";
import { reportLayout, reportSheets } from "./reportLayout.mjs";
import { documentCsv, documentPdf } from "./workspaceFiles.mjs";
import { validateItem } from "./advisorItems.mjs";
const selection = (id) => ({
  id,
  kind: "model",
  name: id,
  displayName: id,
  symbol: "",
  holdings: [
    { symbol: "AAA", weight: 60 },
    { symbol: "BBB", weight: 40 },
  ],
});
function fixture(type = "standard", count = 2) {
  const r = newReport(type);
  r.portfolios = Array.from({ length: count }, (_, i) =>
    selection(`model-${i}`),
  );
  r.snapshot = {
    capturedAt: new Date().toISOString(),
    portfolios: r.portfolios.map((p) => ({
      id: p.id,
      name: p.name,
      totalCount: 25,
      holdings: Array.from({ length: 25 }, (_, i) => ({
        symbol: `T${i}`,
        name: `Holding ${i}`,
        weight: 4,
        price: 100 + i,
        dividendYield: null,
        sector: "Unclassified",
        country: "Unclassified",
      })),
      chart: [
        { t: 1700000000, value: 100 },
        { t: 1732000000, value: 120 },
      ],
      metrics: { totalReturn: 20, cagr: 20, volatility: 15, maxDrawdown: -10 },
      coverage: "Test dates",
      source: "Synthetic test fixture",
    })),
  };
  return r;
}
test("report selections enforce type limits, distinct portfolios, dates and visible pages", () => {
  for (const t of REPORT_TYPES) {
    assert.doesNotThrow(() => validateReport(fixture(t.id, t.limit)));
    assert.throws(() => validateReport(fixture(t.id, t.limit + 1)), /Too many/);
  }
  const r = fixture();
  r.portfolios[1] = r.portfolios[0];
  assert.throws(() => validateReport(r), /different/);
  const r2 = fixture();
  r2.startDate = r2.endDate;
  assert.throws(() => validateReport(r2), /Start date/);
  const r3 = fixture();
  r3.pages.forEach((p) => (p.visible = false));
  assert.throws(() => validateReport(r3), /at least one/);
});
test("report records retain styles, pages and snapshots; templates strip selected account holdings", () => {
  const r = fixture();
  r.style.color = "#ad42d9";
  r.pages[0].visible = false;
  const saved = validateItem(reportRecord(r), "reports");
  assert.equal(saved.report.style.color, "#ad42d9");
  assert.equal(saved.report.pages[0].visible, false);
  assert.equal(saved.report.snapshot.portfolios[0].holdings.length, 25);
  const template = reportRecord(r, true);
  assert.deepEqual(template.report.portfolios, []);
  assert.equal(template.report.snapshot, null);
  assert.equal(template.isTemplate, true);
  assert.equal(
    template.holdings.length,
    0,
    "templates must not retain private allocations outside the spec",
  );
});
test("invalid snapshot numbers, mismatched identity and unsafe uploaded SVG are rejected", () => {
  const r = fixture();
  r.snapshot.portfolios[0].chart[1].value = "not a number";
  assert.throws(() => validateReport(r), /number/);
  const r2 = fixture();
  r2.snapshot.portfolios[0].id = "other";
  assert.throws(() => validateReport(r2), /data/);
  const r3 = fixture();
  r3.style.logo = "data:image/svg+xml;base64,AAAA";
  assert.throws(() => validateReport(r3), /PNG/);
});
test("daily buy-and-hold series uses complete allocations and selected dates without inventing missing prices", () => {
  const dates = [
    Date.parse("2025-01-02") / 1000,
    Date.parse("2025-01-03") / 1000,
    Date.parse("2025-01-06") / 1000,
  ];
  const data = {
    AAA: dates.map((t, i) => ({ t, c: [100, 110, 120][i] })),
    BBB: dates.map((t, i) => ({ t, c: [100, 100, 90][i] })),
  };
  const s = portfolioSeries(
    selection("a").holdings,
    data,
    "2025-01-01",
    "2025-01-06",
  );
  assert.equal(s[0].value, 100);
  assert.ok(Math.abs(s.at(-1).value - 108) < 1e-9);
  assert.deepEqual(
    portfolioSeries(
      selection("a").holdings,
      { ...data, BBB: [] },
      "2025-01-01",
      "2025-01-06",
    ),
    [],
  );
  assert.deepEqual(
    portfolioSeries(selection("a").holdings, data, "2024-01-01", "2025-01-06"),
    [],
  );
  const risk = seriesMetrics([
    { t: dates[0], value: 100 },
    { t: dates[1], value: 120 },
    { t: dates[2], value: 90 },
  ]);
  assert.equal(risk.maxDrawdown, -25);
  assert.equal(risk.cagr, null);
});
test("fund performance uses the fund series, not its partial constituent feed; upstream failures remain unavailable", async () => {
  const r = newReport("one-pager");
  r.startDate = "2025-01-01";
  r.endDate = "2025-01-10";
  r.portfolios = [
    {
      id: "fund:SPY",
      kind: "fund",
      symbol: "SPY",
      name: "SPY",
      displayName: "SPY",
      holdings: [],
    },
  ];
  const paths = [];
  const fetcher = async (path) => {
    paths.push(path);
    return {
      ok: true,
      json: async () =>
        path.includes("etf-holdings")
          ? {
              totalCount: 500,
              holdings: [{ symbol: "AAA", name: "AAA", percent: 8 }],
            }
          : path.includes("stock-chart")
            ? {
                points: [
                  { t: Date.parse("2025-01-02") / 1000, c: 100 },
                  { t: Date.parse("2025-01-03") / 1000, c: 105 },
                ],
              }
            : {},
    };
  };
  const data = await loadReportData(r, { fetcher });
  assert.equal(data.portfolios[0].totalCount, 500);
  assert.ok(Math.abs(data.portfolios[0].metrics.totalReturn - 5) < 1e-8);
  assert.ok(!paths.some((p) => p.includes("stock-chart?symbol=AAA")));
  const unavailable = await loadReportData(r, {
    fetcher: async () => ({ ok: false }),
  });
  assert.equal(unavailable.portfolios[0].metrics.totalReturn, null);
});
test("PDF follows visible page order and continuation pages; all report types export real landscape documents", async () => {
  for (const t of REPORT_TYPES) {
    const r = fixture(t.id, t.limit),
      item = reportRecord(r);
    const pdf = await PDFDocument.load(await documentPdf(item));
    assert.equal(pdf.getPageCount(), reportSheets(r).length);
    assert.equal(pdf.getPages()[0].getWidth(), 792);
    assert.equal(pdf.getPages()[0].getHeight(), 612);
    assert.ok(documentCsv(item).includes("Holding 24"));
  }
  const r = fixture();
  r.pages = [
    r.pages.find((p) => p.name === "Holdings Table"),
    r.pages.find((p) => p.name === "Cover"),
  ];
  const sheets = reportSheets(r);
  assert.equal(sheets.length, 3);
  assert.equal(sheets[1].part, 1);
  assert.equal(sheets[2].page.name, "Cover");
  const last = reportLayout(r, sheets[1], 2)
    .filter((c) => c.type === "text")
    .map((c) => c.value)
    .join(" ");
  assert.match(last, /Holding 24/);
});
test("New Chat table imports and long custom text export without truncating rows or executing spreadsheet formulas", async () => {
  const r = newReport("standard", "blank");
  r.pages = [
    {
      id: "custom",
      custom: true,
      name: "Research notes",
      layout: "Text only",
      visible: true,
      text: "",
      table: {
        columns: ["Ticker", "Comment"],
        rows: Array.from({ length: 44 }, (_, i) => [
          `T${i}`,
          i === 43 ? "=1+1" : "Text",
        ]),
      },
    },
  ];
  const item = validateItem(reportRecord(r), "reports");
  assert.equal(reportSheets(item.report).length, 3);
  assert.ok(documentCsv(item).includes("'=1+1"));
  assert.equal(
    (await PDFDocument.load(await documentPdf(item))).getPageCount(),
    3,
  );
  r.pages[0].table = undefined;
  r.pages[0].text = Array.from({ length: 80 }, (_, i) => `Line ${i}`).join(
    "\n",
  );
  assert.equal(reportSheets(r).length, 3);
  assert.ok(
    reportLayout(r, reportSheets(r).at(-1), 3).some(
      (c) => c.value === "Line 79",
    ),
  );
});

test("page headings, exhibits and metric selections change the actual exported layout", () => {
  const r = fixture();
  const page = r.pages.find((p) => p.name === "Risk");
  page.displayTitle = "Portfolio Risk Review";
  page.metrics = ["Max Drawdown"];
  const clean = validateReport(r);
  const selected = clean.pages.find((p) => p.name === "Risk");
  const texts = reportLayout(clean, { page: selected, part: 0, count: 1 })
    .filter((c) => c.type === "text")
    .map((c) => c.value);
  assert.ok(texts.includes("Portfolio Risk Review"));
  assert.ok(texts.includes("Max Drawdown"));
  assert.ok(!texts.includes("Annualized Return"));
  selected.exhibits = { Risk: false };
  const hidden = reportLayout(clean, { page: selected, part: 0, count: 1 })
    .filter((c) => c.type === "text")
    .map((c) => c.value);
  assert.ok(!hidden.includes("Max Drawdown"));
});


test('opening a New Chat report preserves original allocations and tables when saved in the builder', () => {
  const item = { id: 'chat-document', name: 'Allocation report', holdings: [{ symbol: 'SPY', weight: 100 }], content: 'Review these holdings.', table: { columns: ['Symbol', 'Weight'], rows: [['SPY', 100]] } };
  const report = reportFromItem(item); const saved = validateItem(reportRecord(report), 'reports');
  assert.deepEqual(saved.holdings, item.holdings); assert.deepEqual(saved.report.pages[0].table, item.table); assert.ok(saved.content.includes(item.content));
});
