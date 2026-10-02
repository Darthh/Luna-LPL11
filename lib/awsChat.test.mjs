import test from "node:test";
import assert from "node:assert/strict";
import { bedrockMessages, openaiMessages } from "./awsChat.mjs";
import { hostedModel, HOSTED_MODELS } from "./hostedModels.mjs";

test("model selection cannot author arbitrary provider IDs", () => {
  assert.equal(hostedModel("openai.gpt-expensive"), null);
  for (const { id } of HOSTED_MODELS) assert.ok(hostedModel(id, {}));
  assert.equal(hostedModel("aws-gpt", {}).provider, "mantle");
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
