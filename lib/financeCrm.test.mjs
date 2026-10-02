import test from "node:test";
import assert from "node:assert/strict";
import {
  validateClient,
  clientsCsv,
  reviewDue,
  clientValue,
} from "./financeCrm.mjs";
import { crmHandlers } from "./financeCrmApi.mjs";

const client = {
  name: "Test household",
  email: "test@example.com",
  phone: "",
  advisor: "Advisor",
  stage: "Active",
  risk: "Moderate",
  nextReview: "2026-09-20",
  lastContact: "",
  notes: "",
  portfolios: [
    {
      name: "IRA",
      strategy: "Balanced",
      value: 100,
      valueDate: "2026-09-19",
      holdings: "VTI 60%, BND 40%",
    },
  ],
};
test("client validation preserves portfolios and rejects invalid values, dates, and contact fields", () => {
  assert.equal(clientValue(validateClient(client)), 100);
  assert.equal(
    validateClient({
      ...client,
      portfolios: [{ ...client.portfolios[0], value: "" }],
    }).portfolios[0].value,
    null,
  );
  for (const patch of [
    { name: " " },
    { email: "broken" },
    { stage: "Unknown" },
    { risk: "Unknown" },
    { nextReview: "2026-02-30" },
    { portfolios: [{ name: "IRA", value: -1 }] },
    { portfolios: [{ name: "IRA", value: "Infinity" }] },
    { notes: "x".repeat(10001) },
  ])
    assert.throws(() => validateClient({ ...client, ...patch }));
});
test("reviews include today, exclude future dates and archived clients", () => {
  assert.equal(reviewDue(client, "2026-09-20"), true);
  assert.equal(reviewDue(client, "2026-09-19"), false);
  assert.equal(
    reviewDue({ ...client, stage: "Archived" }, "2026-09-21"),
    false,
  );
  assert.equal(reviewDue({ ...client, nextReview: "" }), false);
});
test("CSV exports every portfolio, escapes quotes, and neutralizes spreadsheet formulas", () => {
  const csv = clientsCsv([
    {
      ...client,
      name: '=HYPERLINK("bad")',
      notes: 'Meeting, "notes"',
      portfolios: [...client.portfolios, { name: "Trust", value: 25 }],
    },
  ]);
  assert.equal(csv.split("\r\n").length, 3);
  assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'));
  assert.ok(csv.includes('"Meeting, ""notes"""'));
});
function fixture() {
  let userId = "owner";
  let seq = 0;
  const rows = [];
  const matches = (row, where) =>
    Object.entries(where).every(([key, value]) => row[key] === value);
  const db = {
    async findMany({ where }) {
      return rows.filter((r) => matches(r, where));
    },
    async create({ data }) {
      const row = { ...data, id: String(++seq), revision: 1 };
      rows.push(row);
      return row;
    },
    async updateMany({ where, data }) {
      const row = rows.find((r) => matches(r, where));
      if (!row) return { count: 0 };
      row.data = data.data;
      row.revision++;
      return { count: 1 };
    },
    async deleteMany({ where }) {
      const i = rows.findIndex((r) => matches(r, where));
      if (i < 0) return { count: 0 };
      rows.splice(i, 1);
      return { count: 1 };
    },
  };
  const handlers = crmHandlers({
    auth: async () => (userId ? { user: { id: userId } } : null),
    prisma: { advisorClient: db },
  });
  const request = (method, body) =>
    handlers[method](
      new Request("http://localhost/api/advisor-clients", {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );
  return {
    request,
    setUser: (id) => {
      userId = id;
    },
  };
}
test("all CRM methods require authentication", async () => {
  const f = fixture();
  f.setUser(null);
  for (const method of ["GET", "POST", "PUT", "DELETE"])
    assert.equal(
      (await f.request(method, method === "GET" ? null : client)).status,
      401,
    );
});
test("CRUD persists portfolios, isolates accounts, and rejects stale updates and deletes", async () => {
  const f = fixture();
  const response = await f.request("POST", { ...client, userId: "attacker" });
  assert.equal(response.status, 201);
  const saved = (await response.json()).client;
  assert.equal(saved.portfolios[0].value, 100);
  assert.match(response.headers.get("cache-control"), /no-store/);
  f.setUser("other");
  assert.deepEqual((await (await f.request("GET")).json()).clients, []);
  assert.equal(
    (await f.request("PUT", { ...saved, name: "Hijacked" })).status,
    409,
  );
  assert.equal((await f.request("DELETE", saved)).status, 409);
  f.setUser("owner");
  const updated = await f.request("PUT", { ...saved, notes: "Updated" });
  assert.equal(updated.status, 200);
  const current = (await updated.json()).client;
  assert.equal(current.revision, 2);
  assert.equal((await f.request("PUT", saved)).status, 409);
  assert.equal((await f.request("DELETE", saved)).status, 409);
  assert.equal(
    (await (await f.request("GET")).json()).clients[0].notes,
    "Updated",
  );
  assert.equal((await f.request("DELETE", current)).status, 200);
  assert.deepEqual((await (await f.request("GET")).json()).clients, []);
});
test("API rejects invalid input and reports unavailable storage without exposing internals", async () => {
  const f = fixture();
  assert.equal(
    (
      await f.request("POST", {
        ...client,
        portfolios: [{ name: "Bad", value: -5 }],
      })
    ).status,
    400,
  );
  assert.equal((await f.request("PUT", client)).status, 400);
  assert.equal(
    (await f.request("POST", { ...client, notes: "x".repeat(200001) })).status,
    413,
  );
  const handlers = crmHandlers({
    auth: async () => ({ user: { id: "a" } }),
    prisma: {
      advisorClient: {
        findMany: () => {
          throw new Error("internal credentials");
        },
      },
    },
  });
  const response = await handlers.GET();
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /credentials/);
});
