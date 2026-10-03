import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
await mkdir(".sst/agent-tests", { recursive: true });
const source = `import test from "node:test";
import assert from "node:assert/strict";
import { runFinancialAgent } from "../../lib/financialAgent.mjs";
import { agentServer } from "../../services/agentcore/server.mjs";
import { extractedText, researchWorkflow } from "../../services/research/workflow.mjs";
const input = { owner: "a".repeat(64), model: "aws-gpt", messages: [{ role: "user", content: "Explain P/E" }], documentIds: [] };
test("agent forces tool evidence and returns each tool failure", async () => {
  const events = []; let answerMessages;
  await runFinancialAgent(input, (t,v) => events.push({t,v}), {
    plan: async () => [{ type: "tool_use", id: "1", name: "no_data_needed", input: {} }, { type: "tool_use", id: "2", name: "unknown", input: {} }],
    answer: async (_c,_s,m,_t,onText) => { answerMessages = m; onText("Grounded answer"); },
  });
  assert.equal(events.at(-1).v, "Grounded answer");
  assert.equal(answerMessages.at(-1).content.length, 2);
  assert.equal(answerMessages.at(-1).content[1].is_error, true);
  await assert.rejects(() => runFinancialAgent(input, () => {}, { plan: async () => [] }), /retrieve evidence/);
});
test("attachments force scoped retrieval and block unavailable evidence", async () => {
  let owner; const events = [];
  await runFinancialAgent({...input, documentIds:["11111111-1111-1111-1111-111111111111"]}, (t,v) => events.push({t,v}), {
    searchDocuments: async (o) => { owner=o; return {sources:[{title:"Report",excerpt:"untrusted",url:"/document"}]}; },
    plan: async () => [{type:"tool_use",id:"1",name:"no_data_needed",input:{}}], answer: async (_c,_s,_m,_t,onText) => onText("Answer")
  });
  assert.equal(owner,input.owner); assert.equal(events[0].v.tool,"search_documents");
  await assert.rejects(() => runFinancialAgent({...input,documentIds:["id"]},()=>{}, {searchDocuments:async()=>({sources:[]})}), /not ready/);
});
test("runtime exposes health and invocation NDJSON contract", async () => {
  const server=agentServer(async (_input,send)=>send("text","Test answer"));
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  try { const url="http://127.0.0.1:"+server.address().port;
    assert.equal((await (await fetch(url+"/ping")).json()).status,"Healthy");
    const response=await fetch(url+"/invocations",{method:"POST",body:JSON.stringify(input)});
    assert.match(response.headers.get("content-type"),/ndjson/);
    assert.equal(JSON.parse(await response.text()).v,"Test answer");
    assert.equal((await fetch(url+"/other")).status,404);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
test("Data Automation parser extracts documents and transcripts without generated summaries",()=>{
  assert.equal(extractedText({document:{representation:{markdown:"actual text"},summary:"generated"}}),"actual text");
  assert.equal(extractedText({audio_segments:[{type:"TRANSCRIPT",text:"spoken words"},{type:"SUMMARY",text:"generated"}]}),"spoken words");
  assert.equal(extractedText({summary:"generated only"}),"");
});
test("workflow rejects invalid storage ownership before side effects",async()=>{
  await assert.rejects(()=>researchWorkflow({owner:"../other",id:"bad"},{}),/Invalid research owner/);
});`;
await writeFile(".sst/agent-tests/source.mjs", source);
await build({ entryPoints: [".sst/agent-tests/source.mjs"], bundle: true, platform: "node", target: "node22", format: "cjs", outfile: ".sst/agent-tests/test.cjs", logLevel: "silent" });
const result = spawnSync(process.execPath, ["--test", "lib/agentResearch.test.mjs", ".sst/agent-tests/test.cjs", "lib/awsChat.test.mjs", "lib/chatResearch.test.mjs"], { stdio: "inherit" });
process.exit(result.status || 0);
