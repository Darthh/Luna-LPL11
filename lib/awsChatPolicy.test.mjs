// `node --test lib/awsChatPolicy.test.mjs` - what actually goes to Bedrock with
// the guardrail and prompt-cache switches off and on, how a guardrail refusal
// surfaces, and the per-call metrics record. The SDK client's send() is
// intercepted, so no AWS call is made.
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { planAws, answerAws, GuardrailIntervened } from "./awsChat.mjs";
import { classifyAwsError } from "./awsErrors.mjs";
import { metricRecord } from "./modelMetrics.mjs";

const tools = [{ name: "get_quote", description: "Quote", input_schema: { type: "object", properties: {} } }];
const claude = { provider: "bedrock", model: "global.anthropic.claude-opus-5" };
const gpt = { provider: "bedrock", model: "global.openai.gpt-5.6-sol" };
const ask = [{ role: "user", content: "What is NVDA at?" }];

const realSend = BedrockRuntimeClient.prototype.send;
let sent;
let reply;
BedrockRuntimeClient.prototype.send = async function (command) {
  sent = command.input;
  return reply(command);
};
after(() => { BedrockRuntimeClient.prototype.send = realSend; });

const toolUse = { output: { message: { content: [{ toolUse: { toolUseId: "t1", name: "get_quote", input: { symbols: ["NVDA"] } } }] } }, stopReason: "tool_use", usage: { inputTokens: 1200, outputTokens: 40, cacheReadInputTokens: 1000 } };
const logs = [];
const realLog = console.log;

beforeEach(() => {
  for (const k of ["BEDROCK_GUARDRAIL_ID", "BEDROCK_GUARDRAIL_VERSION", "BEDROCK_PROMPT_CACHE"]) delete process.env[k];
  process.env.LUNA_METRICS = "on";
  logs.length = 0;
  console.log = (line) => logs.push(line);
  reply = () => toolUse;
});
after(() => { console.log = realLog; delete process.env.LUNA_METRICS; });

test("switches off: the request is exactly as before", async () => {
  const calls = await planAws(claude, "SYSTEM", ask, tools);
  assert.equal(calls[0].name, "get_quote");
  assert.deepEqual(sent.system, [{ text: "SYSTEM" }]);
  assert.equal(sent.toolConfig.tools.length, 1);
  assert.equal(sent.guardrailConfig, undefined);
});

test("prompt caching marks system and tools - on Claude only", async () => {
  process.env.BEDROCK_PROMPT_CACHE = "true";
  await planAws(claude, "SYSTEM", ask, tools);
  assert.deepEqual(sent.system.at(-1), { cachePoint: { type: "default" } });
  assert.deepEqual(sent.toolConfig.tools.at(-1), { cachePoint: { type: "default" } });
  await planAws(gpt, "SYSTEM", ask, tools);
  assert.deepEqual(sent.system, [{ text: "SYSTEM" }], "GPT on Bedrock gets no cachePoint");
});

test("guardrail is attached, and its refusal becomes the answer", async () => {
  process.env.BEDROCK_GUARDRAIL_ID = "gr-123";
  process.env.BEDROCK_GUARDRAIL_VERSION = "1";
  await planAws(gpt, "SYSTEM", ask, tools);
  assert.deepEqual(sent.guardrailConfig, { guardrailIdentifier: "gr-123", guardrailVersion: "1" });

  reply = () => ({ output: { message: { content: [{ text: "I can't give personal buy advice." }] } }, stopReason: "guardrail_intervened", usage: {} });
  await assert.rejects(planAws(gpt, "SYSTEM", [{ role: "user", content: "Should I buy NVDA?" }], tools), (e) => {
    assert.ok(e instanceof GuardrailIntervened);
    assert.equal(e.message, "I can't give personal buy advice.");
    const c = classifyAwsError(e);
    assert.equal(c.kind, "guardrail");
    assert.equal(c.fallback, false, "a refusal must not be routed to another model");
    return true;
  });
});

test("streamed answers carry the guardrail in async mode", async () => {
  process.env.BEDROCK_GUARDRAIL_ID = "gr-123";
  reply = () => ({ stream: (async function* () {
    yield { contentBlockDelta: { delta: { text: "NVDA is up." } } };
    yield { metadata: { usage: { inputTokens: 900, outputTokens: 12 } } };
  })() });
  let text = "";
  await answerAws(gpt, "SYSTEM", ask, tools, (d) => (text += d));
  assert.equal(text, "NVDA is up.");
  assert.equal(sent.guardrailConfig.streamProcessingMode, "async");
  const record = logs.map((l) => JSON.parse(l)).find((r) => r.Stage === "answer");
  assert.equal(record.OutputTokens, 12);
});

test("every call writes one metrics record with tokens and latency", async () => {
  await planAws(claude, "SYSTEM", ask, tools);
  const record = JSON.parse(logs.at(-1));
  assert.equal(record._aws.CloudWatchMetrics[0].Namespace, "LunaTerminal/AI");
  assert.deepEqual(record._aws.CloudWatchMetrics[0].Dimensions, [["Model"], ["Model", "Stage"]]);
  assert.equal(record.Model, claude.model);
  assert.equal(record.Stage, "plan");
  assert.equal(record.InputTokens, 1200);
  assert.equal(record.CacheReadTokens, 1000);
  assert.equal(record.Errors, 0);

  reply = () => { throw Object.assign(new Error("denied"), { name: "AccessDeniedException" }); };
  await assert.rejects(planAws(claude, "SYSTEM", ask, tools));
  const failed = JSON.parse(logs.at(-1));
  assert.equal(failed.Errors, 1);
  assert.equal(failed.ErrorName, "AccessDeniedException");
});

test("metric records are well-formed without usage", () => {
  const r = metricRecord({ model: "m", stage: "plan", ms: 12.6, ok: true }, 1000);
  assert.equal(r._aws.Timestamp, 1000);
  assert.equal(r.LatencyMs, 13);
  assert.equal(r.InputTokens, 0);
});
