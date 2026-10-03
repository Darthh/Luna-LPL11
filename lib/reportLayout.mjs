import { DISCLOSURES } from "./reportSpec.mjs";
export const REPORT_SIZE = [792, 612];
const palette = [
  "#168dbe",
  "#fa9873",
  "#8b7cdb",
  "#5fbd9f",
  "#e4b650",
  "#6a9bd4",
];
const pct = (v) =>
  typeof v === "number" && Number.isFinite(v) ? `${v.toFixed(2)}%` : "—";
const money = (v) =>
  typeof v === "number" && Number.isFinite(v)
    ? `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
    : "—";
const trim = (s, n) =>
  String(s ?? "—").length > n
    ? String(s).slice(0, n - 1) + "…"
    : String(s ?? "—");
const dateLabel = (s) =>
  new Date(`${s}T12:00:00`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
export function reportSheets(report) {
  const sheets = [];
  for (const page of report.pages.filter((p) => p.visible)) {
    let count = 1;
    if (page.name === "Holdings Table")
      count = Math.max(
        1,
        Math.ceil(
          Math.max(
            0,
            ...(report.snapshot?.portfolios || []).map(
              (p) => p.holdings?.length || 0,
            ),
          ) / 23,
        ),
      );
    if (page.custom && page.table)
      count = Math.max(1, Math.ceil(page.table.rows.length / 20));
    // Long editorial text is continued rather than cut off in the PDF.
    if (page.custom && page.layout === "Text only")
      count = Math.max(count, Math.ceil(wrapText(page.text, 110).length / 34));
    for (let part = 0; part < count; part++) sheets.push({ page, part, count });
  }
  return sheets;
}
export function wrapText(text, length) {
  const lines = [];
  for (const paragraph of String(text || "").split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      if (line && line.length + word.length + 1 > length) {
        lines.push(line);
        line = "";
      }
      if (word.length > length) {
        if (line) {
          lines.push(line);
          line = "";
        }
        for (let i = 0; i < word.length; i += length)
          lines.push(word.slice(i, i + length));
      } else line += (line ? " " : "") + word;
    }
    lines.push(line);
  }
  return lines;
}
// Top-left coordinates for both SVG and PDF. Every visual uses these commands.
export function reportLayout(report, sheet, pageNumber = 1) {
  const out = [],
    page = sheet.page,
    color = report.style.color;
  const datasets = report.portfolios.map((p, i) => ({
    name: p.displayName,
    holdings: [],
    metrics: {},
    chart: [],
    ...(report.snapshot?.portfolios?.[i] || {}),
  }));
  const primary = datasets[0] || {
    name: "Select a portfolio or fund",
    holdings: [],
    metrics: {},
    chart: [],
  };
  const text = (value, x, y, size = 9, fill = "#283441", bold = false) =>
    out.push({
      type: "text",
      value: String(value ?? "—"),
      x,
      y,
      size,
      fill,
      bold,
    });
  const rect = (x, y, width, height, fill = "#ffffff", stroke = "#d9dde3") =>
    out.push({ type: "rect", x, y, width, height, fill, stroke });
  const line = (x1, y1, x2, y2, stroke = "#d9dde3", width = 0.6) =>
    out.push({ type: "line", x1, y1, x2, y2, stroke, width });
  const paragraph = (value, x, y, width, maxLines = 34, size = 10) =>
    wrapText(value, Math.max(10, Math.floor(width / (size * 0.53))))
      .slice(0, maxLines)
      .forEach((v, i) => text(v, x, y + i * (size + 6), size));
  const panel = (title, x, y, w, h, subtitle = "") => {
    rect(x, y, w, h);
    rect(x, y, w, 30, "#f3f4f7", "#f3f4f7");
    text(title, x + 9, y + 19, 10, "#172d40", true);
    if (subtitle) text(trim(subtitle, 26), x + w - 110, y + 19, 7, "#73808e");
  };
  const empty = (x, y, width, message = "No relevant data available.") =>
    paragraph(message, x, y, width, 8, 10);
  const table = (
    title,
    columns,
    rows,
    x,
    y,
    w,
    h,
    subtitle = "",
    widths = null,
  ) => {
    if (page.exhibits?.[title] === false) return;
    panel(title, x, y, w, h, subtitle);
    const sizes = widths || columns.map(() => 1 / columns.length);
    let offset = x;
    columns.forEach((c, i) => {
      text(
        trim(c, Math.floor((w * sizes[i]) / 4)),
        offset + 7,
        y + 46,
        7,
        "#7a828c",
      );
      offset += w * sizes[i];
    });
    line(x, y + 54, x + w, y + 54);
    const rowHeight = Math.min(21, (h - 58) / Math.max(1, rows.length));
    rows.forEach((r, ri) => {
      let left = x;
      r.forEach((v, ci) => {
        text(
          trim(v, Math.max(3, Math.floor((w * sizes[ci] - 14) / 4.4))),
          left + 7,
          y + 68 + ri * rowHeight,
          7,
        );
        left += w * sizes[ci];
      });
      line(x, y + 75 + ri * rowHeight, x + w, y + 75 + ri * rowHeight);
    });
    if (!rows.length) empty(x + 10, y + 82, w - 20);
  };
  const bars = (title, rows, x, y, w, h, subtitle = "") => {
    if (page.exhibits?.[title] === false) return;
    panel(title, x, y, w, h, subtitle);
    if (!rows.length) {
      empty(x + 10, y + 70, w - 20);
      return;
    }
    const max = Math.max(1, ...rows.map((r) => Math.abs(r[1] || 0))),
      rh = Math.min(25, (h - 40) / rows.length);
    rows.forEach(([label, value], i) => {
      const yy = y + 45 + i * rh;
      text(trim(label, 21), x + 9, yy + 7, 7);
      if (value != null)
        rect(
          x + w * 0.34,
          yy,
          Math.max(0.5, (Math.abs(value) / max) * w * 0.5),
          6,
          value < 0 ? "#dd6774" : color,
          "none",
        );
      text(pct(value), x + w * 0.86, yy + 7, 6.5);
      line(x, yy + rh - 5, x + w, yy + rh - 5);
    });
  };
  const donut = (title, rows, x, y, w, h) => {
    if (page.exhibits?.[title] === false) return;
    panel(title, x, y, w, h);
    const known = rows.filter((r) => r[1] > 0);
    if (!known.length) {
      empty(x + 10, y + 68, w - 20);
      return;
    }
    let offset = -Math.PI / 2;
    const total = known.reduce((a, r) => a + r[1], 0),
      compact = w < 240,
      cx = x + w * (compact ? 0.5 : 0.28),
      cy = y + (compact ? 78 : h * 0.57),
      r = compact ? 32 : Math.min(h * 0.27, w * 0.21);
    known.forEach(([label, value], i) => {
      const end = offset + (value / total) * 2 * Math.PI,
        points = [];
      for (let a = offset; a <= end; a += 0.035)
        points.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      points.push([cx + Math.cos(end) * r, cy + Math.sin(end) * r]);
      for (let a = end; a >= offset; a -= 0.035)
        points.push([cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62]);
      out.push({
        type: "polygon",
        points,
        fill: i ? palette[i % palette.length] : color,
      });
      const lx = compact ? x + 8 : x + w * 0.55,
        ly = compact ? y + 120 + i * 12 : y + 45 + i * 19;
      rect(lx, ly, 6, 6, i ? palette[i % palette.length] : color, "none");
      text(trim(label, compact ? 14 : 24), lx + 12, ly + 6, compact ? 6 : 7);
      text(pct(value), x + w - 42, ly + 6, compact ? 6 : 7);
      offset = end;
    });
  };
  const chart = (title, series, x, y, w, h) => {
    if (page.exhibits?.[title] === false) return;
    panel(title, x, y, w, h);
    const values = series.flatMap((s) =>
      (s.chart || []).map((p) => p.value - 100),
    );
    if (!values.length) {
      empty(
        x + 16,
        y + 80,
        w - 32,
        "Price history unavailable or incomplete for the selected date range.",
      );
      return;
    }
    const low = Math.min(0, ...values),
      high = Math.max(1, ...values),
      maxT = Math.max(...series.flatMap((s) => s.chart.map((p) => p.t))),
      minT = Math.min(...series.flatMap((s) => s.chart.map((p) => p.t)));
    for (let i = 0; i < 5; i++) {
      const yy = y + 48 + (i * (h - 90)) / 4;
      line(x + 40, yy, x + w - 15, yy);
      text(pct(high - (i * (high - low)) / 4), x + 5, yy + 3, 6);
    }
    series.forEach((s, i) => {
      out.push({
        type: "polyline",
        points: s.chart.map((p) => [
          x + 40 + ((p.t - minT) / (maxT - minT || 1)) * (w - 55),
          y + 48 + ((high - (p.value - 100)) / (high - low)) * (h - 90),
        ]),
        stroke: i ? palette[i % palette.length] : color,
        width: 1.6,
      });
      text(
        trim(s.name, 30),
        x + 12 + i * (w / Math.max(1, series.length)),
        y + h - 11,
        7,
        i ? palette[i % palette.length] : color,
      );
    });
    text(
      new Date(minT * 1000).toISOString().slice(0, 10),
      x + 40,
      y + h - 29,
      7,
    );
    text(
      new Date(maxT * 1000).toISOString().slice(0, 10),
      x + w - 82,
      y + h - 29,
      7,
    );
  };
  const grouping = (d, field) => {
    const sums = new Map();
    for (const h of d.holdings) {
      const k = h[field] || "Unclassified";
      if (h.weight != null) sums.set(k, (sums.get(k) || 0) + h.weight);
    }
    return [...sums].sort((a, b) => b[1] - a[1]).slice(0, 12);
  };
  const holdingRows = (d, start = 0, count = page.topCount || 20) =>
    [...d.holdings]
      .sort((a, b) => (b.weight || 0) - (a.weight || 0))
      .slice(start, start + count);
  const field = (h, c) =>
    ({
      Ticker: h.symbol,
      Name: h.name,
      Weight: pct(h.weight),
      "Last Price": money(h.price),
      "Dividend Yield": pct(h.dividendYield),
      "Expense Ratio": pct(h.expenseRatio),
      Sector: h.sector,
      Country: h.country,
    })[c];
  const stats = (d) =>
    [
      ["Total Return (Period)", pct(d.metrics?.totalReturn)],
      ["Annualized Return", pct(d.metrics?.cagr)],
      ["Volatility (annualized)", pct(d.metrics?.volatility)],
      ["Max Drawdown", pct(d.metrics?.maxDrawdown)],
      ["Dividend Yield", pct(d.dividendYield)],
      ["Number of Holdings", d.totalCount ?? d.holdings.length],
      [
        "Top 10 Weight",
        d.holdings.length &&
        holdingRows(d, 0, 10).every((h) => h.weight != null)
          ? pct(holdingRows(d, 0, 10).reduce((n, h) => n + h.weight, 0))
          : "—",
      ],
    ].filter((row) => !page.metrics || page.metrics.includes(row[0]));
  const image = (src, x, y, width, height) => {
    if (src) out.push({ type: "image", src, x, y, width, height });
    else {
      rect(x, y, width, height, "#f3f5f7");
      text(
        "Upload an image in Edit Page",
        x + 15,
        y + height / 2,
        10,
        "#89939c",
      );
    }
  };
  const top = (d, x, y, w, h) => {
    const columns = page.columns?.length
      ? page.columns
      : ["Ticker", "Name", "Weight"];
    table(
      "Top Holdings Table",
      columns,
      holdingRows(d).map((r) => columns.map((c) => field(r, c))),
      x,
      y,
      w,
      h,
      d.name,
      columns.length === 5 ? [0.12, 0.38, 0.16, 0.17, 0.17] : null,
    );
  };
  rect(0, 0, 792, 612, "#ffffff", "none");
  text(
    (page.displayTitle || page.name) +
      (sheet.count > 1 ? ` (${sheet.part + 1}/${sheet.count})` : ""),
    22,
    30,
    8,
  );
  text(trim(report.title, 60), 410, 30, 8, "#747d88");
  text(String(pageNumber).padStart(2, "0"), 752, 30, 8);
  line(22, 565, 770, 565, "#66707c", 0.8);
  text("Prepared By", 410, 581, 7, "#747d88");
  text(report.preparedBy || "—", 410, 594, 8);
  text("Date", 682, 581, 7, "#747d88");
  text(dateLabel(report.endDate), 657, 594, 8);
  if (report.style.logo && page.name !== "Cover")
    image(report.style.logo, 22, 575, 85, 22);
  else text("LUNA TERMINAL", 22, 591, 8, color, true);
  if (page.name === "Cover") {
    if (report.style.cover !== "none") {
      rect(0, 0, 792, 205, color, "none");
      if (report.style.cover === "geometric")
        for (let i = 0; i < 7; i++)
          out.push({
            type: "polygon",
            points: [
              [i * 125, 0],
              [i * 125 + 170, 0],
              [i * 125 + 40, 205],
            ],
            fill: palette[i % palette.length],
            opacity: 0.25,
          });
      else
        for (let i = 0; i < 30; i++) {
          const rgb = [1, 3, 5].map((j) => parseInt(color.slice(j, j + 2), 16));
          const blend =
            "#" +
            rgb
              .map((v) =>
                Math.round(v + (245 - v) * (i / 30) * 0.65)
                  .toString(16)
                  .padStart(2, "0"),
              )
              .join("");
          rect(0, i * 7, 792, Math.min(7, 205 - i * 7), blend, "none");
        }
    }
    if (report.style.logo) image(report.style.logo, 45, 230, 150, 50);
    paragraph(report.title, 45, 330, 690, 3, 31);
    if (report.client) text(`Prepared for ${report.client}`, 47, 420, 14);
    text(
      report.portfolios.map((p) => p.displayName).join("  /  "),
      47,
      455,
      12,
      color,
    );
    text(`Prepared by ${report.preparedBy || "—"}`, 47, 505, 11);
    text(dateLabel(report.endDate), 47, 528, 10, "#747d88");
  } else if (page.custom) {
    const layout = page.layout;
    if (layout === "Text only") {
      if (page.table)
        table(
          page.name,
          page.table.columns,
          page.table.rows.slice(sheet.part * 20, sheet.part * 20 + 20),
          22,
          80,
          748,
          465,
        );
      else
        paragraph(
          wrapText(page.text, 110)
            .slice(sheet.part * 34, sheet.part * 34 + 34)
            .join("\n"),
          32,
          75,
          718,
          34,
          11,
        );
    } else if (layout === "Title")
      paragraph(page.text || page.name, 45, 220, 700, 8, 34);
    else if (layout.includes("graph")) {
      const graphs = page.graphSymbols?.length
        ? page.graphSymbols.map(
            (symbol) =>
              report.snapshot?.graphs?.[symbol] || { name: symbol, chart: [] },
          )
        : datasets;
      if (layout === "Two graphs with text") {
        chart(
          graphs[0]?.name || "Primary Portfolio",
          graphs.slice(0, 1),
          22,
          60,
          365,
          300,
        );
        chart(
          graphs[1]?.name || "Comparison Portfolio",
          graphs.slice(1, 2),
          405,
          60,
          365,
          300,
        );
      } else
        chart(
          "Market Series (indexed to 100)",
          graphs,
          22,
          60,
          748,
          layout === "Full page graph" ? 485 : 315,
        );
      if (layout !== "Full page graph") paragraph(page.text, 32, 405, 718, 8);
    } else if (
      layout.includes("cards") ||
      ["With bios", "Without bios"].includes(layout)
    ) {
      const cards = page.cards?.length
        ? page.cards
        : [
            {
              title: "Edit your content",
              text: "Add feature cards or team members in Edit Page.",
            },
          ];
      const cols = layout.includes("square") ? 3 : 2,
        width = (748 - 14 * (cols - 1)) / cols;
      if (layout.includes("introductory")) paragraph(page.text, 32, 75, 718, 4);
      cards.forEach((c, i) => {
        const x = 22 + (i % cols) * (width + 14),
          y =
            (layout.includes("introductory") ? 140 : 70) +
            Math.floor(i / cols) * 145;
        panel(c.title, x, y, width, 130);
        if (layout !== "Without bios")
          paragraph(c.text, x + 12, y + 52, width - 24, 5);
      });
    } else if (
      layout === "Full width image" ||
      layout === "Full width image with text"
    ) {
      image(
        page.images?.[0],
        22,
        60,
        748,
        layout.endsWith("with text") ? 330 : 485,
      );
      if (layout.endsWith("with text")) paragraph(page.text, 32, 425, 718, 7);
    } else {
      const leftImage = layout.includes("right–left");
      const ix = leftImage ? 22 : 410,
        tx = leftImage ? 420 : 32;
      image(
        page.images?.[0],
        ix,
        60,
        350,
        layout.includes("two images") ? 232 : 485,
      );
      if (layout.includes("two images"))
        image(page.images?.[1], ix, 313, 350, 232);
      paragraph(page.text, tx, 85, 330, 29);
    }
  } else if (page.name === "Disclosures") {
    paragraph(page.text || DISCLOSURES, 40, 90, 710, 30, 12);
  } else if (page.name === "Top Holdings") {
    if (page.showTable && page.showChart) {
      top(primary, 22, 52, 365, 490);
      bars(
        "Holdings Chart",
        holdingRows(primary).map((h) => [h.symbol, h.weight]),
        405,
        52,
        365,
        490,
        primary.name,
      );
    } else if (page.showTable) top(primary, 22, 52, 748, 490);
    else if (page.showChart)
      bars(
        "Holdings Chart",
        holdingRows(primary).map((h) => [h.symbol, h.weight]),
        22,
        52,
        748,
        490,
        primary.name,
      );
  } else if (page.name === "Holdings Table") {
    const cols = page.columns?.length
      ? page.columns
      : ["Ticker", "Name", "Weight", "Last Price"];
    table(
      "Holdings Table",
      cols,
      holdingRows(primary, sheet.part * 23, 23).map((h) =>
        cols.map((c) => field(h, c)),
      ),
      22,
      52,
      748,
      490,
      primary.name,
    );
  } else if (page.name === "Holdings Matrix" || page.name === "Stock X-Ray") {
    const symbols = [
      ...new Set(datasets.flatMap((d) => holdingRows(d).map((h) => h.symbol))),
    ].slice(0, 23);
    table(
      page.name === "Stock X-Ray" ? "Direct Holdings Overlap" : page.name,
      ["Ticker", ...datasets.map((d) => trim(d.name, 20))],
      symbols.map((s) => [
        s,
        ...datasets.map((d) => {
          const h = d.holdings.find((h) => h.symbol === s);
          return h ? pct(h.weight) : "—";
        }),
      ]),
      22,
      52,
      748,
      490,
    );
  } else if (
    page.name === "Holdings Summary" ||
    page.name === "Comparison Summary"
  ) {
    if (report.type === "comparison") {
      const w =
        (748 - (datasets.length - 1) * 10) / Math.max(1, datasets.length);
      datasets.forEach((d, i) => {
        const x = 22 + i * (w + 10);
        donut(
          trim(d.name, 25),
          holdingRows(d, 0, 4).map((h) => [h.symbol, h.weight]),
          x,
          52,
          w,
          177,
        );
        table(
          "Key Stats",
          ["Metric", "Value"],
          stats(d).slice(0, 5),
          x,
          240,
          w,
          185,
        );
        table(
          "Top Holdings",
          ["Ticker", "Weight"],
          holdingRows(d, 0, 5).map((h) => [h.symbol, pct(h.weight)]),
          x,
          435,
          w,
          110,
        );
      });
    } else {
      table(
        "Key Stats",
        ["Metric", ...datasets.map((d) => d.name)],
        stats(primary).map((r, i) => [
          r[0],
          ...datasets.map((d) => stats(d)[i][1]),
        ]),
        22,
        52,
        748,
        235,
      );
      donut(
        "Top Holdings Allocation",
        holdingRows(primary, 0, 6).map((h) => [h.symbol, h.weight]),
        22,
        304,
        365,
        240,
      );
      bars(
        "Holdings Weight",
        holdingRows(primary, 0, 8).map((h) => [h.symbol, h.weight]),
        405,
        304,
        365,
        240,
      );
    }
  } else if (
    page.name === "Equity Exposure" ||
    page.name === "Breakdown Table"
  ) {
    bars(
      "Sector Exposure (available holdings)",
      grouping(primary, "sector"),
      22,
      52,
      365,
      490,
      primary.name,
    );
    bars(
      "Country Exposure (available holdings)",
      grouping(primary, "country"),
      405,
      52,
      365,
      490,
      primary.name,
    );
  } else if (page.name === "Fixed Income Exposure") {
    ["Stylebox", "Maturity", "Sector", "Quality"].forEach((s, i) => {
      const x = i % 2 ? 405 : 22,
        y = i < 2 ? 52 : 307;
      panel(s, x, y, 365, 235, primary.name);
      empty(
        x + 20,
        y + 80,
        325,
        "No relevant data available. Bond duration, maturity and credit quality require a fixed income classification feed.",
      );
    });
  } else if (page.name === "Performance Chart")
    chart("Total Return (Period)", datasets, 22, 52, 748, 490);
  else if (page.name === "Performance") {
    bars(
      "Total Return (Selected Period)",
      datasets.map((d) => [d.name, d.metrics?.totalReturn]),
      22,
      52,
      365,
      235,
    );
    bars(
      "Annualized Return",
      datasets.map((d) => [d.name, d.metrics?.cagr]),
      405,
      52,
      365,
      235,
    );
    chart("Growth of 100 (Price Return)", datasets, 22, 304, 748, 240);
  } else if (page.name === "Risk" || page.name === "Quantitative Metrics") {
    table(
      page.name === "Stock X-Ray" ? "Direct Holdings Overlap" : page.name,
      ["Metric", ...datasets.map((d) => d.name)],
      stats(primary).map((r, i) => [
        r[0],
        ...datasets.map((d) => stats(d)[i][1]),
      ]),
      22,
      52,
      748,
      310,
    );
    panel("Data and Methodology", 22, 382, 748, 162);
    paragraph(
      datasets
        .map((d) => `${d.name}: ${d.coverage || "Not refreshed"}`)
        .join("\n") +
        "\nDaily close volatility uses 252 sessions. No risk-free rate or benchmark is assumed. Unavailable values are shown as a dash.",
      34,
      429,
      720,
      7,
    );
  } else if (page.name === "Fee Comparison Table") {
    table(
      "Fees & Risk Comparison",
      ["Metric", ...datasets.map((d) => d.name)],
      [
        ["Advisor Fees (illustrative)", ...datasets.map(() => pct(page.fee))],
        ["Fund Fees", ...datasets.map(() => "Unavailable")],
        ["Dividend Yield", ...datasets.map((d) => pct(d.dividendYield))],
        ["Max Drawdown", ...datasets.map((d) => pct(d.metrics?.maxDrawdown))],
        ["Volatility", ...datasets.map((d) => pct(d.metrics?.volatility))],
      ],
      22,
      52,
      748,
      380,
    );
    paragraph(
      "Advisor fee is a report input, not an account charge. Fund expense ratios are unavailable from the current data feed.",
      32,
      470,
      718,
      4,
    );
  } else if (
    page.name === "Cash Sensitivity" ||
    page.name === "Fee Sensitivity"
  ) {
    const fees = page.name === "Fee Sensitivity",
      levels = fees
        ? [0, page.fee, page.fee + 0.5, page.fee + 1]
        : [
            0,
            page.cash,
            Math.min(100, page.cash + 10),
            Math.min(100, page.cash + 20),
          ];
    const years = Math.max(
      0,
      (Date.parse(report.endDate) - Date.parse(report.startDate)) /
        (365.25 * 86400000),
    );
    table(
      page.name + " (Illustration)",
      [fees ? "Annual Fee" : "Cash Weight", ...datasets.map((d) => d.name)],
      levels.map((n) => [
        pct(n),
        ...datasets.map((d) =>
          d.metrics?.totalReturn == null
            ? "—"
            : money(
                page.investment *
                  (fees
                    ? (1 + d.metrics.totalReturn / 100) * (1 - n / 100) ** years
                    : 1 + (d.metrics.totalReturn / 100) * (1 - n / 100)),
              ),
        ),
      ]),
      22,
      52,
      748,
      390,
    );
    paragraph(
      `Starting investment: ${money(page.investment)}. ${fees ? "Fee drag applied annually to the period result." : "Cash earns 0%; the invested allocation is scaled by the cash weight."} This is an illustration, not a forecast.`,
      32,
      477,
      718,
      4,
    );
  } else if (page.name === "One Pager") {
    chart("Total Return (Period)", datasets, 22, 52, 365, 210);
    donut(
      "Top Holdings Allocation",
      holdingRows(primary, 0, 5).map((h) => [h.symbol, h.weight]),
      405,
      52,
      365,
      210,
    );
    table(
      "Key Stats",
      ["Metric", ...datasets.map((d) => d.name)],
      stats(primary)
        .slice(0, 5)
        .map((r, i) => [r[0], ...datasets.map((d) => stats(d)[i][1])]),
      22,
      276,
      365,
      265,
    );
    table(
      "Top Holdings",
      ["Ticker", "Name", "Weight"],
      holdingRows(primary, 0, 10).map((h) => [h.symbol, h.name, pct(h.weight)]),
      405,
      276,
      365,
      265,
      primary.name,
      [0.18, 0.62, 0.2],
    );
  }
  if (page.name !== "Cover" && !page.custom && page.name !== "Disclosures")
    text(
      trim(
        `${report.startDate} – ${report.endDate} · ${report.snapshot ? `Snapshot ${report.snapshot.capturedAt?.slice(0, 10)}` : "Refresh report to load data"} · Fund holdings may be partial`,
        156,
      ),
      22,
      555,
      7,
      "#747d88",
    );
  return out;
}
