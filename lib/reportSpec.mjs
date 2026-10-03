export const REPORT_TYPES = [
  {
    id: "standard",
    name: "Standard",
    description: "In depth multi-page comparison for up to two securities",
    limit: 2,
  },
  {
    id: "one-pager",
    name: "One Pager",
    description: "Data-dense one page snapshot for up to two securities",
    limit: 2,
  },
  {
    id: "comparison",
    name: "Comparison",
    description:
      "Side-by-side multi-security comparison across up to five securities",
    limit: 5,
  },
];
export const PAGE_NAMES = [
  "Cover",
  "Comparison Summary",
  "Top Holdings",
  "Holdings Summary",
  "Holdings Matrix",
  "Equity Exposure",
  "Fixed Income Exposure",
  "Breakdown Table",
  "Performance",
  "Performance Chart",
  "Risk",
  "Stock X-Ray",
  "Fee Comparison Table",
  "Quantitative Metrics",
  "Holdings Table",
  "Cash Sensitivity",
  "Fee Sensitivity",
  "One Pager",
  "Disclosures",
];
export const CUSTOM_LAYOUTS = [
  ["Editorial", "Text only"],
  ["Editorial", "Full width image"],
  ["Editorial", "Text and image (left–right)"],
  ["Editorial", "Text and image (right–left)"],
  ["Editorial", "Text and two images (right–left)"],
  ["Editorial", "Text and two images (left–right)"],
  ["Editorial", "Full width image with text"],
  ["Editorial", "Title"],
  ["Team Pages", "With bios"],
  ["Team Pages", "Without bios"],
  ["Macro Graphs", "Full page graph"],
  ["Macro Graphs", "Full width graph with text"],
  ["Macro Graphs", "Two graphs with text"],
  ["Feature Cards", "Five feature cards with introductory text"],
  ["Feature Cards", "Six rectangular feature cards"],
  ["Feature Cards", "Three square feature cards and one image"],
  ["Feature Cards", "Six square feature cards"],
];
export const HOLDING_COLUMNS = [
  "Ticker",
  "Name",
  "Weight",
  "Last Price",
  "Dividend Yield",
  "Expense Ratio",
  "Sector",
  "Country",
];
export const REPORT_METRICS = [
  "Total Return (Period)",
  "Annualized Return",
  "Volatility (annualized)",
  "Max Drawdown",
  "Dividend Yield",
  "Number of Holdings",
  "Top 10 Weight",
];
export const PAGE_EXHIBITS = {
  "Top Holdings": ["Top Holdings Table", "Holdings Chart"],
  "Holdings Summary": [
    "Key Stats",
    "Top Holdings Allocation",
    "Holdings Weight",
  ],
  "Comparison Summary": [
    "Key Stats",
    "Top Holdings",
    "Top Holdings Allocation",
    "Holdings Weight",
  ],
  "Holdings Matrix": ["Holdings Matrix"],
  "Equity Exposure": [
    "Sector Exposure (available holdings)",
    "Country Exposure (available holdings)",
  ],
  "Fixed Income Exposure": ["Stylebox", "Maturity", "Sector", "Quality"],
  "Breakdown Table": [
    "Sector Exposure (available holdings)",
    "Country Exposure (available holdings)",
  ],
  Performance: [
    "Total Return (Selected Period)",
    "Annualized Return",
    "Growth of 100 (Price Return)",
  ],
  "Performance Chart": ["Total Return (Period)"],
  Risk: ["Risk", "Data and Methodology"],
  "Stock X-Ray": ["Direct Holdings Overlap"],
  "Fee Comparison Table": ["Fees & Risk Comparison"],
  "Quantitative Metrics": ["Quantitative Metrics", "Data and Methodology"],
  "Holdings Table": ["Holdings Table"],
  "Cash Sensitivity": ["Cash Sensitivity (Illustration)"],
  "Fee Sensitivity": ["Fee Sensitivity (Illustration)"],
  "One Pager": [
    "Total Return (Period)",
    "Top Holdings Allocation",
    "Key Stats",
    "Top Holdings",
  ],
};
export const DISCLOSURES =
  "This report is for informational purposes. Historical performance does not predict future results. Portfolio charts are hypothetical buy-and-hold simulations using the stated allocation and available closing prices; they exclude advisor fees, taxes, trading costs, cash flows and rebalancing. Fund charts use the fund price series, not a reconstruction from its top holdings. Price returns may exclude distributions. Weights derived from shares use the latest available prices. Fund holdings may be a partial list and reflect a different date from prices. Unknown classifications and unavailable metrics are labeled. No risk-free rate is assumed, so Sharpe and Sortino ratios are not supplied. Cash and fee sensitivity are illustrations, not forecasts. Snapshot data is captured when the report is refreshed and is retained when saved.";
const bad = (message) => {
  throw new Error(message);
};
const str = (v, max = 160) =>
  typeof v === "string" && v.length <= max
    ? v.trim()
    : bad("Invalid report text.");
const num = (v, min, max) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max
    ? v
    : bad("Invalid report number.");
export const today = () => new Date().toISOString().slice(0, 10);
export function newReport(
  type = "standard",
  template = "overview",
  preparedBy = "",
) {
  const end = today(),
    start = new Date();
  start.setUTCFullYear(start.getUTCFullYear() - 1);
  const included =
    type === "one-pager"
      ? ["One Pager"]
      : template === "blank"
        ? ["Cover", "Disclosures"]
        : type === "comparison"
          ? ["Comparison Summary"]
          : template === "proposal"
            ? [
                "Cover",
                "Comparison Summary",
                "Top Holdings",
                "Holdings Summary",
                "Performance Chart",
                "Risk",
                "Fee Comparison Table",
                "Disclosures",
              ]
            : [
                "Cover",
                "Top Holdings",
                "Holdings Summary",
                "Holdings Matrix",
                "Equity Exposure",
                "Performance",
                "Performance Chart",
                "Risk",
                "Holdings Table",
                "Disclosures",
              ];
  return {
    version: 1,
    type,
    title: template === "proposal" ? "Client Proposal" : "Portfolio Report",
    client: "",
    preparedBy,
    startDate: start.toISOString().slice(0, 10),
    endDate: end,
    portfolios: [],
    style: { color: "#168dbe", cover: "gradient", logo: "" },
    pages: PAGE_NAMES.map((name, i) => ({
      id: `page-${i}`,
      name,
      visible: included.includes(name),
      columns: ["Ticker", "Name", "Weight", "Dividend Yield", "Expense Ratio"],
      topCount: 20,
      showTable: true,
      showChart: true,
      text: name === "Disclosures" ? DISCLOSURES : "",
      fee: 1,
      cash: 10,
      investment: 100000,
    })),
    snapshot: null,
  };
}
export function validateReport(raw) {
  if (!raw || raw.version !== 1 || !REPORT_TYPES.some((t) => t.id === raw.type))
    bad("Choose a valid report type.");
  const title = str(raw.title);
  if (!title) bad("Enter a report title.");
  const date = (value) => {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value
    )
      bad("Choose a valid date.");
    return value;
  };
  const startDate = date(raw.startDate),
    endDate = date(raw.endDate);
  if (startDate >= endDate || endDate > today())
    bad(
      "Start date must be before the end date, and dates cannot be in the future.",
    );
  const portfolios = raw.portfolios;
  if (
    !Array.isArray(portfolios) ||
    portfolios.length > REPORT_TYPES.find((t) => t.id === raw.type).limit
  )
    bad("Too many portfolios for this report type.");
  const unique = new Set();
  const cleanPortfolios = portfolios.map((p) => {
    const id = str(p.id, 100);
    if (unique.has(id)) bad("Choose different portfolios for comparison.");
    unique.add(id);
    if (!["fund", "model", "client"].includes(p.kind))
      bad("Choose a portfolio or fund.");
    const symbol = str(p.symbol || "", 24).toUpperCase();
    if (p.kind === "fund" && !/^[A-Z0-9^][A-Z0-9.^=-]{0,23}$/.test(symbol))
      bad("Invalid fund ticker.");
    if (!Array.isArray(p.holdings) || p.holdings.length > 200)
      bad("A portfolio can contain up to 200 holdings.");
    const holdings = p.holdings.map((h) => {
      if (!/^[A-Z0-9^][A-Z0-9.^=-]{0,23}$/.test(h.symbol))
        bad("Invalid holding ticker.");
      return {
        symbol: h.symbol,
        ...(h.weight != null
          ? { weight: num(h.weight, 0, 100) }
          : { shares: num(h.shares, 0, 1e12) }),
      };
    });
    return {
      id,
      kind: p.kind,
      name: str(p.name),
      displayName: str(p.displayName || p.name),
      symbol,
      holdings,
    };
  });
  const image = (value) => {
    if (!value) return "";
    if (
      typeof value !== "string" ||
      value.length > 1400000 ||
      !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value)
    )
      bad("Use a PNG or JPEG image under 1 MB.");
    return value;
  };
  const color = raw.style?.color;
  if (!/^#[0-9a-f]{6}$/i.test(color)) bad("Choose a valid brand color.");
  if (!["gradient", "geometric", "none"].includes(raw.style?.cover))
    bad("Choose a cover design.");
  if (!Array.isArray(raw.pages) || !raw.pages.length || raw.pages.length > 40)
    bad("A report needs 1–40 pages.");
  const ids = new Set();
  const pages = raw.pages.map((p) => {
    const id = str(p.id, 100);
    if (ids.has(id)) bad("Duplicate report page.");
    ids.add(id);
    const custom = Boolean(p.custom),
      name = str(p.name);
    if (!custom && !PAGE_NAMES.includes(name)) bad("Invalid report page.");
    if (custom && !CUSTOM_LAYOUTS.some(([, l]) => l === p.layout))
      bad("Choose a custom page layout.");
    const graphSymbols = (p.graphSymbols || []).slice(0, 2).map((s) => {
      const symbol = str(s, 24).toUpperCase();
      if (!/^[A-Z0-9^][A-Z0-9.^=-]{0,23}$/.test(symbol))
        bad("Invalid graph ticker.");
      return symbol;
    });
    return {
      id,
      name,
      custom,
      displayTitle: str(p.displayTitle || "", 160),
      exhibits: Object.fromEntries(
        Object.entries(p.exhibits || {}).filter(
          ([key, value]) =>
            typeof value === "boolean" &&
            (PAGE_EXHIBITS[name] || []).includes(key),
        ),
      ),
      metrics: Array.isArray(p.metrics)
        ? p.metrics.filter((m) => REPORT_METRICS.includes(m))
        : REPORT_METRICS,
      layout: custom ? p.layout : "",
      visible: Boolean(p.visible),
      text: str(p.text || "", 16000),
      columns: (Array.isArray(p.columns) ? p.columns : []).filter((c) =>
        HOLDING_COLUMNS.includes(c),
      ),
      topCount: num(p.topCount ?? 20, 1, 25),
      showTable: p.showTable !== false,
      showChart: p.showChart !== false,
      fee: num(p.fee ?? 1, 0, 10),
      cash: num(p.cash ?? 10, 0, 100),
      investment: num(p.investment ?? 100000, 1, 1e12),
      images: (p.images || []).slice(0, 2).map(image),
      graphSymbols,
      cards: (p.cards || [])
        .slice(0, 6)
        .map((c) => ({ title: str(c.title), text: str(c.text || "", 1000) })),
      ...(p.table ? { table: p.table } : {}),
    };
  });
  if (!pages.some((p) => p.visible)) bad("Show at least one page.");
  // A bounded, plain JSON snapshot; layout never evaluates its contents.
  let snapshot = raw.snapshot ?? null;
  if (
    snapshot &&
    (JSON.stringify(snapshot).length > 300000 ||
      !Array.isArray(snapshot.portfolios) ||
      snapshot.portfolios.length !== cleanPortfolios.length)
  )
    bad("Report data is too large or does not match the selected portfolios.");
  if (snapshot) {
    const optional = (v, min = -1e9, max = 1e12) =>
      v == null ? null : num(v, min, max);
    if (
      typeof snapshot.capturedAt !== "string" ||
      !Number.isFinite(Date.parse(snapshot.capturedAt))
    )
      bad("Invalid report snapshot date.");
    const graphs = Object.fromEntries(
      Object.entries(snapshot.graphs || {})
        .slice(0, 10)
        .map(([symbol, graph]) => {
          if (
            !/^[A-Z0-9^][A-Z0-9.^=-]{0,23}$/.test(symbol) ||
            !Array.isArray(graph.chart) ||
            graph.chart.length > 100
          )
            bad("Invalid graph data.");
          return [
            symbol,
            {
              name: symbol,
              chart: graph.chart.map((p) => ({
                t: num(p.t, 0, 1e11),
                value: num(p.value, 0.000001, 1e12),
              })),
            },
          ];
        }),
    );
    snapshot = {
      graphs,
      capturedAt: new Date(snapshot.capturedAt).toISOString(),
      portfolios: snapshot.portfolios.map((p, i) => {
        if (
          p.id !== cleanPortfolios[i].id ||
          !Array.isArray(p.holdings) ||
          p.holdings.length > 200 ||
          !Array.isArray(p.chart) ||
          p.chart.length > 100
        )
          bad("Invalid report data.");
        let last = 0;
        const chart = p.chart.map((point) => {
          const t = num(point.t, 0, 1e11);
          if (t <= last) bad("Report dates must be ordered.");
          last = t;
          return { t, value: num(point.value, 0.000001, 1e12) };
        });
        return {
          id: p.id,
          name: str(p.name),
          totalCount: num(p.totalCount ?? p.holdings.length, 0, 1e7),
          holdings: p.holdings.map((h) => ({
            symbol: str(h.symbol, 24),
            name: str(h.name || h.symbol),
            weight: optional(h.weight, 0, 100),
            price: optional(h.price, 0),
            dividendYield: optional(h.dividendYield, 0, 1000),
            expenseRatio: optional(h.expenseRatio, 0, 100),
            sector: str(h.sector || "Unclassified", 120),
            country: str(h.country || "Unclassified", 120),
          })),
          chart,
          metrics: Object.fromEntries(
            ["totalReturn", "cagr", "volatility", "maxDrawdown"].map((k) => [
              k,
              optional(p.metrics?.[k]),
            ]),
          ),
          coverage: str(p.coverage || "", 250),
          source: str(p.source || "", 160),
          dividendYield: optional(p.dividendYield, 0, 1000),
        };
      }),
    };
  }
  const result = {
    version: 1,
    type: raw.type,
    title,
    client: str(raw.client || ""),
    preparedBy: str(raw.preparedBy || ""),
    startDate,
    endDate,
    portfolios: cleanPortfolios,
    style: { color, cover: raw.style.cover, logo: image(raw.style.logo) },
    pages,
    snapshot,
  };
  if (JSON.stringify(result).length > 4400000)
    bad("Report images are too large. Use smaller images.");
  return result;
}
export function reportRecord(report, isTemplate = false) {
  const clean = validateReport(report);
  return {
    name: clean.title,
    client: clean.client,
    preparedBy: clean.preparedBy,
    holdings: isTemplate ? [] : clean.portfolios[0]?.holdings || [],
    blurb: `${REPORT_TYPES.find((t) => t.id === clean.type).name}${isTemplate ? " Template" : ` · ${clean.portfolios.map((p) => p.displayName).join(" vs ")}`}`,
    content: clean.pages
      .filter((p) => p.visible)
      .map((p) => `${p.name}${p.text ? "\n" + p.text : ""}`)
      .join("\n\n")
      .slice(0, 32000),
    report: isTemplate ? { ...clean, snapshot: null, portfolios: [] } : clean,
    isTemplate,
  };
}

export function reportFromItem(item, preparedBy = "") {
  if (item?.report) return structuredClone(item.report);
  const report = newReport("standard", "blank", item?.preparedBy || preparedBy);
  if (!item) return report;
  report.title = item.name;
  report.client = item.client || "";
  report.pages = [
    {
      id: "imported",
      name: item.name,
      custom: true,
      layout: "Text only",
      visible: true,
      text: item.content || item.blurb || "",
      ...(item.table ? { table: item.table } : {}),
      columns: [],
      topCount: 20,
    },
  ];
  if (item.holdings?.length)
    report.portfolios = [
      {
        id: `document:${item.id || "draft"}`,
        kind: "model",
        name: item.name,
        displayName: item.name,
        symbol: "",
        holdings: item.holdings,
      },
    ];
  return report;
}
