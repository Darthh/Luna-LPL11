// `node --test lib/aiProvider.test.mjs` - which Claude the assistant uses, and
// that a Bedrock request is signed for the right service, region and model.
import { test } from "node:test";
import assert from "node:assert/strict";
import { aiConfig, bedrockModelId } from "./aiProvider.mjs";

test("provider choice comes from the environment", () => {
  assert.equal(aiConfig({}), null, "nothing configured -> keyless local answers");
  assert.deepEqual(aiConfig({ ANTHROPIC_API_KEY: "k" }), { provider: "anthropic", model: "claude-haiku-4-5", workspaceId: undefined });
  assert.deepEqual(aiConfig({ AI_PROVIDER: "bedrock", AWS_REGION: "us-west-2" }), {
    provider: "bedrock",
    model: "anthropic.claude-haiku-4-5",
    region: "us-west-2",
  });
  // Bedrock wins when both are set: the point of the AWS stage is no API key.
  assert.equal(aiConfig({ AI_PROVIDER: "bedrock", ANTHROPIC_API_KEY: "k" }).provider, "bedrock");
  assert.equal(aiConfig({ AI_PROVIDER: "bedrock", AI_BOT_MODEL: "claude-sonnet-5-5" }).model, "anthropic.claude-sonnet-5-5");
});

test("bedrock model ids", () => {
  assert.equal(bedrockModelId("claude-opus-5-5"), "anthropic.claude-opus-5-5");
  assert.equal(bedrockModelId("anthropic.claude-haiku-4-5"), "anthropic.claude-haiku-4-5");
  assert.equal(bedrockModelId("global.anthropic.claude-haiku-4-5-20251001-v1:0"), "global.anthropic.claude-haiku-4-5-20251001-v1:0");
});

test("a Bedrock request is SigV4-signed for bedrock-mantle", async () => {
  const { AnthropicBedrockMantle } = await import("@anthropic-ai/bedrock-sdk");
  let seen;
  const client = new AnthropicBedrockMantle({
    awsRegion: "us-east-1",
    awsAccessKey: "AKIDEXAMPLE",
    awsSecretAccessKey: "secret",
    maxRetries: 0,
    fetch: async (url, init) => {
      seen = { url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body) };
      return new Response(
        JSON.stringify({ id: "msg_1", type: "message", role: "assistant", model: seen.body.model, content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    },
  });
  const reply = await client.messages.create({ model: "anthropic.claude-haiku-4-5", max_tokens: 16, messages: [{ role: "user", content: "hi" }] });
  assert.equal(reply.content[0].text, "ok");
  assert.equal(seen.url, "https://bedrock-mantle.us-east-1.api.aws/anthropic/v1/messages");
  assert.match(seen.headers.get("authorization"), /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/us-east-1\/bedrock-mantle\/aws4_request/);
  assert.equal(seen.body.model, "anthropic.claude-haiku-4-5");
});
