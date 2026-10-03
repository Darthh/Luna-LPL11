import test from "node:test";
import assert from "node:assert/strict";
import { advisorItemHandlers, validateItem } from "./advisorItems.mjs";
import { readAccountWorkspace, parseDocumentAnswer, requestedSave, draftDocument } from "./accountWorkspace.mjs";
import { documentCsv, documentPdf } from "./workspaceFiles.mjs";
import { PDFDocument } from "pdf-lib";
import { readChats, saveChat, setChatAccount, resetChatSyncForTests, syncChats } from "./chatHistory.js";

const model = { name: "Test allocation", holdings: [{ symbol: "VTI", weight: 60 }, { symbol: "BND", weight: 40 }] };
function store() {
  let sequence = 0;
  const rows = [];
  const matches = (row, where) => Object.entries(where).every(([k, v]) => row[k] === v);
  return { rows,
    findMany: async ({ where }) => rows.filter(r => matches(r, where)),
    findFirst: async ({ where }) => rows.find(r => matches(r, where)),
    create: async ({ data }) => { const row = { ...data, id: data.id || `item-${++sequence}`, revision: 1 }; rows.push(row); return row; },
    updateMany: async ({ where, data }) => { const row = rows.find(r => matches(r, where)); if (!row) return { count: 0 }; row.data = data.data; row.revision++; return { count: 1 }; },
    deleteMany: async ({ where }) => { const i = rows.findIndex(r => matches(r, where)); if (i < 0) return { count: 0 }; rows.splice(i, 1); return { count: 1 }; },
  };
}
const request = (method, body, kind = "models") => new Request(`http://localhost/api/advisor-items?kind=${kind}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });

test("account workspace CRUD ignores supplied owner and rejects cross-account/stale writes", async () => {
  const advisorItem = store();
  let userId = "alice";
  const api = advisorItemHandlers({ auth: async () => ({ user: { id: userId } }), prisma: { advisorItem } });
  const created = await api.POST(request("POST", { ...model, userId: "bob", builtIn: true }));
  assert.equal(created.status, 201);
  const { item } = await created.json();
  assert.equal(advisorItem.rows[0].userId, "alice");
  assert.equal(item.builtIn, undefined);
  userId = "bob";
  assert.deepEqual((await (await api.GET(request("GET"))).json()).items, []);
  assert.equal((await api.PUT(request("PUT", { ...item, name: "Stolen" }))).status, 409);
  assert.equal((await api.DELETE(request("DELETE", item))).status, 409);
  userId = "alice";
  assert.equal((await api.PUT(request("PUT", { ...item, name: "Updated" }))).status, 200);
  assert.equal((await api.PUT(request("PUT", item))).status, 409);
  assert.equal(advisorItem.rows[0].revision, 2);
  userId = null;
  assert.equal((await api.GET(request("GET"))).status, 401);
});

test("validation rejects invalid holdings, arbitrary kinds and malformed tables", () => {
  assert.throws(() => validateItem(model, "constructor"));
  assert.throws(() => validateItem({ ...model, holdings: [{ symbol: "../secret", shares: 10 }] }, "models"));
  assert.throws(() => validateItem({ ...model, holdings: [{ symbol: "VTI", shares: -1 }] }, "models"));
  assert.throws(() => validateItem({ ...model, holdings: [{ symbol: "VTI", weight: 101 }] }, "models"));
  assert.throws(() => validateItem({ name: "Bad", table: { columns: ["A"], rows: [[1, 2]] } }, "reports"));
  assert.throws(() => draftDocument({ name: "Empty model", destination: "models", content: "No holdings" }));
});

test("repeated draft saves are idempotent per account and destination", async () => {
  const advisorItem = store();
  let userId = "alice";
  const api = advisorItemHandlers({ auth: async () => ({ user: { id: userId } }), prisma: { advisorItem } });
  const draft = { ...model, draftId: crypto.randomUUID() };
  const first = await (await api.POST(request("POST", draft))).json();
  const second = await (await api.POST(request("POST", draft))).json();
  assert.equal(first.item.id, second.item.id);
  assert.equal(advisorItem.rows.length, 1);
  userId = "bob";
  const other = await (await api.POST(request("POST", draft))).json();
  assert.notEqual(first.item.id, other.item.id);
  assert.equal(advisorItem.rows.length, 2);
});

test("account changes isolate browser chat caches and reject late sync results", async () => {
  resetChatSyncForTests();
  const values = new Map();
  globalThis.window = { dispatchEvent: () => {} };
  globalThis.localStorage = { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v) };
  let release;
  globalThis.fetch = path => path.startsWith("/api/chats?") ? new Promise(resolve => { release = () => resolve(Response.json({ chats: [{ id: "alice-chat", messageCount: 1 }] })); }) : Promise.resolve(Response.json({}));
  setChatAccount("alice");
  saveChat({ id: "alice-chat", messages: [{ role: "user", content: "Private Alice account data" }] });
  const pending = syncChats();
  setChatAccount("bob");
  assert.deepEqual(readChats(), []);
  release(); await pending;
  assert.deepEqual(readChats(), []);
  setChatAccount(null);
  assert.deepEqual(readChats(), []);
  setChatAccount("alice");
  assert.equal(readChats()[0].messages[0].content, "Private Alice account data");
  resetChatSyncForTests();
});

test("retrieval scopes every private source, reports outages separately and bounds evidence", async () => {
  const scopes = [];
  const record = async options => { scopes.push(options.where); return [{ id: "private-id", kind: options.where.kind, data: JSON.stringify({ name: "Alice model", holdings: model.holdings }) }]; };
  const prisma = { advisorItem: { findMany: record }, advisorClient: { findMany: async o => { scopes.push(o.where); throw new Error("offline"); } }, watchlistItem: { findMany: async o => { scopes.push(o.where); return [{ symbol: "VTI", name: "Total market", shares: 12 }]; } } };
  const result = await readAccountWorkspace(prisma, "alice", "VTI");
  assert.equal(scopes.length, 5);
  assert.ok(scopes.every(where => where.userId === "alice"));
  assert.equal(result.sections.crm.status, "unavailable");
  assert.equal(result.sections.watchlist.records[0].shares, 12);
  assert.equal(result.sections.models.records[0].path, "/model-portfolios?item=private-id");
  assert.ok(result.builtInModels.every(m => m.builtIn));
  const signedOut = await readAccountWorkspace(prisma, null);
  assert.equal(signedOut.signedIn, false);
  assert.equal(scopes.length, 5);
});

test("local document protocol creates a validated draft and saves only on explicit requests", () => {
  const parsed = parseDocumentAnswer('Here is the allocation.\n```luna-document\n' + JSON.stringify({ ...model, destination: "models" }) + '\n```');
  assert.equal(parsed.drafts.length, 1);
  assert.equal(parsed.content, "Here is the allocation.");
  assert.ok(parsed.drafts[0].draftId);
  assert.equal(requestedSave("Save this into my model portfolio", "models"), true);
  assert.equal(requestedSave("Create a report in Reports", "reports"), true);
  assert.equal(requestedSave("Make a PDF of my watchlist", "reports"), false);
  assert.equal(requestedSave("Do not save this to reports", "reports"), false);
  assert.equal(requestedSave("Save this to my reports", "models"), false);
});

test("CSV escapes cells and neutralizes spreadsheet formulas", () => {
  const csv = documentCsv({ table: { columns: ["Name", "Value"], rows: [['A, "B"', '=HYPERLINK("bad")'], ["Negative", -10], ["Multiline", "line1\nline2"]] } });
  assert.ok(csv.includes('"A, ""B"""'));
  assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'));
  assert.ok(csv.includes('"-10"'));
  assert.ok(csv.includes('"line1\nline2"'));
});

test("PDF is a real multipage file containing a Unicode title and long content", async () => {
  const pdf = await documentPdf({ name: "Résumé allocation – £", content: "A long report paragraph with verified sample holdings. ".repeat(600), holdings: model.holdings });
  assert.equal(Buffer.from(pdf).subarray(0, 5).toString(), "%PDF-");
  const decoded = await PDFDocument.load(pdf);
  assert.equal(decoded.getTitle(), "Résumé allocation – £");
  assert.ok(decoded.getPageCount() > 2);
});
