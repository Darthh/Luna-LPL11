import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const base = process.argv[2];
if (!base || !/^https?:\/\//.test(base)) throw new Error("Usage: node scripts/smoke-agent.mjs https://your-site");
const statePath = ".sst/evidence/live-agent-smoke-state.json";
const state = process.argv.includes("--resume") ? JSON.parse(await readFile(statePath, "utf8")) : {};
if (state.base && state.base !== base) throw new Error("Resume state belongs to another site.");
const cookies = new Map(state.cookies || []);
const evidence = [];
async function saveState() {
  await mkdir(".sst/evidence", { recursive: true });
  await writeFile(statePath, JSON.stringify({ ...state, base, cookies: [...cookies] }));
}
async function request(path, options = {}) {
  const cookie = [...cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
  const response = await fetch(new URL(path, base), { ...options, headers: { ...(cookie ? { Cookie: cookie } : {}), Origin: new URL(base).origin, ...options.headers }, signal: AbortSignal.timeout(120000) });
  for (const next of response.headers.getSetCookie()) {
    const pair = next.split(";")[0]; const split = pair.indexOf("=");
    cookies.set(pair.slice(0, split), pair.slice(split + 1));
  }
  return response;
}
function pdfFixture(text) {
  const stream = `BT /F1 12 Tf 50 740 Td (${text}) Tj ET`;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let body = "%PDF-1.4\n"; const offsets = [0];
  for (const [i, object] of objects.entries()) { offsets.push(Buffer.byteLength(body)); body += `${i + 1} 0 obj\n${object}\nendobj\n`; }
  const start = Buffer.byteLength(body);
  body += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(o => String(o).padStart(10, "0") + " 00000 n ").join("\n")}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(body);
}
async function upload(name, body, type) {
  const form = new FormData(); form.append("file", new Blob([body], { type }), name);
  const response = await request("/api/ai-documents", { method: "POST", body: form });
  const result = await response.json();
  assert.equal(response.status, 202, JSON.stringify(result));
  console.log("Queued", name, result.job.id);
  return result.job;
}
async function ready(job) {
  for (let i = 0; i < 80; i++) {
    const response = await request(`/api/ai-documents?id=${job.id}`);
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    if (result.job.status === "ready") { console.log("Ready", job.title); return result.job; }
    if (result.job.status === "failed") throw new Error(`${job.title}: ${result.job.error}`);
    if (i % 4 === 0) console.log("Processing", job.title);
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  throw new Error("Job verification timed out.");
}
async function chat(question, model = "aws-gpt", documentIds = []) {
  const response = await request("/api/ai-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content: question }], model, documentIds, conversationId: crypto.randomUUID() }) });
  const text = await response.text();
  assert.equal(response.status, 200, text);
  const events = text.trim().split("\n").map(row => JSON.parse(row));
  assert.ok(!events.some(e => e.t === "error"), text);
  const answer = events.filter(e => e.t === "text").map(e => e.v).join("");
  assert.ok(answer.trim());
  evidence.push({ question, model, answer, tools: events.filter(e => e.t === "data").map(e => e.v) });
  console.log("Chat passed", model, question);
  return { answer, events };
}
const status = await request("/api/ai-documents");
assert.equal(status.status, 200, await status.clone().text());
assert.equal((await status.json()).agentAvailable, true);
state.txt ||= await upload("luna-verification.txt", "Synthetic verification fixture, not market data. The project code is ORION-7421. Revenue is intentionally not supplied.", "text/plain");
await saveState();
state.pdf ||= await upload("luna-verification.pdf", pdfFixture("Synthetic test document. Verification code: VEGA-9382. Not financial data."), "application/pdf");
await saveState();
const txt = state.txt; const pdf = state.pdf;
const doc = await ready(txt);
const grounded = await chat("What is the project code in the attached document? Cite the document and chunk.", "aws-gpt", [doc.id]);
assert.match(grounded.answer, /ORION-7421/);
assert.ok(grounded.events.some(e => e.t === "data" && e.v.tool === "search_documents"));
const forbidden = await fetch(new URL(`/api/ai-documents?id=${doc.id}&download=1`, base));
assert.equal(forbidden.status, 404);
console.log("Cross-browser document access denied");
const processedPdf = await ready(pdf);
const pdfAnswer = await chat("What verification code appears in the attached PDF? Cite the source.", "aws-claude", [processedPdf.id]);
assert.match(pdfAnswer.answer, /VEGA-9382/);
if (!state.report) {
  const reportResponse = await request("/api/ai-jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "aws-gpt", query: "Explain a price-to-earnings ratio in two sentences. No live market data is needed." }) });
  const report = await reportResponse.json();
  assert.equal(reportResponse.status, 202, JSON.stringify(report));
  state.report = report.job; await saveState();
}
const saved = await ready(state.report);
assert.match(saved.summary, /earnings/i);
const history = await chat("Find my archived research report with price-to-earnings in its title. Use the research history tool and show its date.");
await mkdir(".sst/evidence", { recursive: true });
await writeFile(".sst/evidence/live-agent-smoke.json", JSON.stringify({ base, verifiedAt: new Date().toISOString(), documents: [doc.id, processedPdf.id], report: saved.id, evidence }, null, 2));
assert.ok(history.events.some(e => e.t === "data" && e.v.tool === "search_research_history" && e.v.result.rows?.some(row => row[0] === saved.id)), "Archived report was not retrieved from S3 Tables.");
console.log("All live agent checks passed; evidence saved in .sst/evidence/live-agent-smoke.json");
