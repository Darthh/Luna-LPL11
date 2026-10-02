export const STAGES = ["Active", "Prospect", "Onboarding", "Archived"];
export const RISKS = ["Conservative", "Moderate", "Growth", "Aggressive"];

export function validateClient(input) {
  const fail = (message) => {
    throw new Error(message);
  };
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail("A client record is required.");
  const text = (value, label, max = 120) => {
    if (value == null) return "";
    if (typeof value !== "string" || value.length > max)
      fail(`${label} must be text under ${max + 1} characters.`);
    return value.trim();
  };
  const date = (value, label) => {
    const result = text(value, label, 10);
    if (
      result &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(result) ||
        !Number.isFinite(Date.parse(result)) ||
        new Date(result).toISOString().slice(0, 10) !== result)
    )
      fail(`${label} must be a valid date.`);
    return result;
  };
  const name = text(input.name, "Client name");
  if (!name) fail("Enter a client name.");
  const email = text(input.email, "Email", 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    fail("Enter a valid email address.");
  if (!STAGES.includes(input.stage)) fail("Choose a client stage.");
  if (!RISKS.includes(input.risk)) fail("Choose a risk profile.");
  if (!Array.isArray(input.portfolios) || input.portfolios.length > 50)
    fail("A client can have up to 50 portfolios.");
  return {
    name,
    email,
    phone: text(input.phone, "Phone", 50),
    advisor: text(input.advisor, "Advisor"),
    stage: input.stage,
    risk: input.risk,
    nextReview: date(input.nextReview, "Next review"),
    lastContact: date(input.lastContact, "Last contact"),
    notes: text(input.notes, "Notes", 10000),
    portfolios: input.portfolios.map((p) => {
      if (!p || typeof p !== "object") fail("Invalid portfolio.");
      const portfolioName = text(p.name, "Portfolio name");
      if (!portfolioName) fail("Each portfolio needs a name.");
      if (
        p.value != null &&
        typeof p.value !== "number" &&
        typeof p.value !== "string"
      )
        fail("Portfolio value must be a number.");
      const value = p.value === "" || p.value == null ? null : Number(p.value);
      if (
        value !== null &&
        (!Number.isFinite(value) || value < 0 || value > 1e12)
      )
        fail("Portfolio value must be between 0 and 1 trillion USD.");
      return {
        name: portfolioName,
        strategy: text(p.strategy, "Strategy"),
        value,
        valueDate: date(p.valueDate, "Valuation date"),
        holdings: text(p.holdings, "Holdings", 3000),
      };
    }),
  };
}

export const clientValue = (client) =>
  client.portfolios.reduce((sum, p) => sum + (p.value ?? 0), 0);
export const todayISO = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
export const reviewDue = (client, today = todayISO()) =>
  client.stage !== "Archived" &&
  Boolean(client.nextReview && client.nextReview <= today);
export function clientsCsv(clients) {
  const rows = [
    [
      "Client",
      "Email",
      "Phone",
      "Advisor",
      "Stage",
      "Risk",
      "Portfolio",
      "Strategy",
      "Entered value (USD)",
      "Valuation date",
      "Holdings",
      "Last contact",
      "Next review",
      "Notes",
    ],
  ];
  clients.forEach((c) =>
    (c.portfolios.length ? c.portfolios : [{}]).forEach((p) =>
      rows.push([
        c.name,
        c.email,
        c.phone,
        c.advisor,
        c.stage,
        c.risk,
        p.name,
        p.strategy,
        p.value,
        p.valueDate,
        p.holdings,
        c.lastContact,
        c.nextReview,
        c.notes,
      ]),
    ),
  );
  return rows
    .map((row) =>
      row
        .map((value) => {
          let cell = String(value ?? "");
          if (/^[\s]*[=+@-]/.test(cell)) cell = "'" + cell;
          return '"' + cell.replace(/"/g, '""') + '"';
        })
        .join(","),
    )
    .join("\r\n");
}
