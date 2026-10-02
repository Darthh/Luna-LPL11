import test from "node:test";
import assert from "node:assert/strict";
import { bedrockMessages, openaiMessages, planAws, answerAws } from "./awsChat.mjs";
import { hostedModel, HOSTED_MODELS, DEFAULT_HOSTED_MODEL } from "./hostedModels.mjs";
import { BedrockRuntimeClient, ConverseCommand, ConverseStreamCommand } from "@aws-sdk/client-bedrock-runtime";

test("model selection cannot author arbitrary provider IDs", () => {
  assert.equal(hostedModel("openai.gpt-expensive"), null);
  for (const { id } of HOSTED_MODELS) assert.ok(hostedModel(id, {}));
  assert.equal(hostedModel("aws-gpt", {}).provider, "bedrock");
  assert.equal(DEFAULT_HOSTED_MODEL, "aws-gpt");
  assert.equal(hostedModel(DEFAULT_HOSTED_MODEL, {}).model, "global.openai.gpt-5.6-sol");
  assert.equal(hostedModel("aws-claude", {}).model, "global.anthropic.claude-opus-5");
});

const tools = [{ name: "no_data_needed", description: "Conceptual question", input_schema: { type: "object", properties: {} } }];

function testEnv(t, values) {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test("Gemma signs requests and disables parallel tool calls", async t => {
  testEnv(t, { AWS_ACCESS_KEY_ID: "test-access", AWS_SECRET_ACCESS_KEY: "test-secret", BEDROCK_REGION: "us-east-1" });
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url: String(url), options, body: JSON.parse(options.body) });
    return Response.json({ choices: [{ message: { tool_calls: [{ id: "tool-1", function: { name: "no_data_needed", arguments: "{}" } }] } }] });
  });
  await planAws(hostedModel("aws-gemma", {}), "Research first", [], tools);
  assert.match(requests[0].url, /bedrock-mantle.us-east-1/);
  assert.match(requests[0].options.headers.authorization, /us-east-1\/bedrock-mantle/);
  assert.equal(requests[0].body.parallel_tool_calls, false);
});

test("Bedrock models preserve grounding and use their supported tool choice", async t => {
  const requests = [];
  t.mock.method(BedrockRuntimeClient.prototype, "send", async command => {
    requests.push(command);
    if (command instanceof ConverseCommand) return { output: { message: { content: [{ toolUse: { toolUseId: "tool-1", name: "no_data_needed", input: {} } }] } } };
    assert.ok(command instanceof ConverseStreamCommand);
    return { stream: (async function* () { yield { contentBlockDelta: { delta: { text: "Grounded answer" } } }; })() };
  });
  for (const id of ["aws-gpt", "aws-claude", "aws-meta", "aws-qwen"]) {
    const config = hostedModel(id, {});
    const calls = await planAws(config, "Research first", [], tools);
    assert.deepEqual(requests.at(-1).input.toolConfig.toolChoice, config.toolChoice === "auto" ? { auto: {} } : { any: {} });
    const history = [{ role: "assistant", content: calls }, { role: "user", content: [{ type: "tool_result", tool_use_id: "tool-1", content: "verified evidence" }] }];
    let answer = "";
    await answerAws(config, "Use evidence", history, tools, text => { answer += text; });
    assert.equal(answer, "Grounded answer");
    assert.match(requests.at(-1).input.messages[1].content[0].text, /verified evidence/);
    assert.equal(requests.at(-1).input.toolConfig, undefined);
  }
});

test("Gemini keeps thought signatures across tool turns and does not use AWS auth", async t => {
  testEnv(t, { GEMINI_API_KEY: "test-google-key" });
  const signature = { google: { thought_signature: "test-signature" } };
  let turn = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(String(url), "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    assert.equal(options.headers.Authorization, "Bearer test-google-key");
    const body = JSON.parse(options.body);
    assert.equal(body.max_tokens, 4096);
    if (++turn === 1) return Response.json({ choices: [{ message: { tool_calls: [{ id: "tool-1", function: { name: "no_data_needed", arguments: "{}" }, extra_content: signature }] } }] });
    assert.deepEqual(body.messages[1].tool_calls[0].extra_content, signature);
    assert.equal(body.messages[2].tool_call_id, "tool-1");
    assert.equal(body.tool_choice, "none");
    return Response.json({ choices: [{ message: { content: "Google answer" } }] });
  });
  const config = hostedModel("google-gemini", {});
  const calls = await planAws(config, "Research first", [], tools);
  let answer = "";
  await answerAws(config, "Use evidence", [{ role: "assistant", content: calls }, { role: "user", content: [{ type: "tool_result", tool_use_id: "tool-1", content: "evidence" }] }], tools, text => { answer += text; });
  assert.equal(answer, "Google answer");
});

test("tool IDs, arguments and failed evidence survive both provider conversions", () => {
  const messages = [
    { role: "user", content: "AAPL price?" },
    { role: "assistant", content: [{ type: "tool_use", id: "quote-1", name: "get_quote", input: { symbols: ["AAPL"] } }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "quote-1", content: '{"error":"unavailable"}', is_error: true }] },
  ];
  const aws = bedrockMessages(messages);
  assert.deepEqual(aws[1].content[0].toolUse.input, { symbols: ["AAPL"] });
  assert.equal(aws[2].content[0].toolResult.toolUseId, "quote-1");
  assert.equal(aws[2].content[0].toolResult.status, "error");
  const gpt = openaiMessages("Use live data", messages);
  assert.equal(gpt[2].tool_calls[0].id, gpt[3].tool_call_id);
  assert.equal(gpt[3].content, '{"error":"unavailable"}');
});
