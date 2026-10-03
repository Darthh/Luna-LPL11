import { BedrockRuntimeClient, ConverseCommand, ConverseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import { awsClientOptions } from "./awsAuth.mjs";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { SignatureV4 } from "@smithy/signature-v4";
import { HttpRequest } from "@smithy/protocol-http";
import { Sha256 } from "@aws-crypto/sha256-js";

import { recordModelCall } from "./modelMetrics.mjs";

const region = () => process.env.BEDROCK_REGION || process.env.AWS_REGION || "us-east-1";

// A Bedrock Guardrail declined the question or the answer (personal buy/sell
// advice, prompt attacks...). Its message is meant for the visitor, so callers
// show it as the answer rather than as a failure.
export class GuardrailIntervened extends Error {
  constructor(message) {
    super(message || "This request was declined by the content policy.");
    this.name = "GuardrailIntervened";
  }
}

// Both off unless configured, so a deploy without them behaves as before.
// BEDROCK_GUARDRAIL_ID (+ _VERSION) applies a guardrail to Converse calls.
// BEDROCK_PROMPT_CACHE=true caches the fixed system prompt and tool list on
// Claude models (Converse cachePoint), so repeat questions skip re-reading them.
function guardrailConfig() {
  const id = process.env.BEDROCK_GUARDRAIL_ID;
  return id ? { guardrailIdentifier: id, guardrailVersion: process.env.BEDROCK_GUARDRAIL_VERSION || "DRAFT" } : undefined;
}
const caching = (config) => process.env.BEDROCK_PROMPT_CACHE === "true" && /(^|\.)anthropic\./.test(config.model);
const systemBlocks = (config, system) => (caching(config) ? [{ text: system }, { cachePoint: { type: "default" } }] : [{ text: system }]);
const toolSpecs = (config, tools) => [
  ...tools.map(t => ({ toolSpec: { name: t.name, description: t.description, inputSchema: { json: t.input_schema } } })),
  ...(caching(config) ? [{ cachePoint: { type: "default" } }] : []),
];
const converseUsage = (u = {}, into) => {
  into.inputTokens = u.inputTokens; into.outputTokens = u.outputTokens; into.cacheReadTokens = u.cacheReadInputTokens;
};

// Time one model call and record it (lib/modelMetrics.mjs), success or not.
async function measured(config, stage, call) {
  const started = Date.now();
  const usage = {};
  try {
    const value = await call(usage);
    recordModelCall({ model: config.model, provider: config.provider, stage, ms: Date.now() - started, usage, ok: true });
    return value;
  } catch (error) {
    recordModelCall({ model: config.model, provider: config.provider, stage, ms: Date.now() - started, usage, ok: error instanceof GuardrailIntervened, errorName: error?.name });
    throw error;
  }
}

export function bedrockMessages(messages) {
  return messages.map(({ role, content }) => ({ role, content: typeof content === "string" ? [{ text: content }] : content.map(block => {
    if (block.type === "tool_use") return { toolUse: { toolUseId: block.id, name: block.name, input: block.input } };
    if (block.type === "tool_result") return { toolResult: { toolUseId: block.tool_use_id, content: [{ text: block.content }], status: block.is_error ? "error" : "success" } };
    return { text: block.text || "" };
  }) }));
}

export function openaiMessages(system, messages) {
  return [{ role: "system", content: system }, ...messages.flatMap(({ role, content }) => {
    if (typeof content === "string") return [{ role, content }];
    if (role === "user") return content.map(b => ({ role: "tool", tool_call_id: b.tool_use_id, content: b.content }));
    return [{ role: "assistant", content: content.filter(b => b.type === "text").map(b => b.text).join("") || null,
      tool_calls: content.filter(b => b.type === "tool_use").map(b => ({ id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input) },
        ...(b.extra_content ? { extra_content: b.extra_content } : {}) })) }];
  })];
}

async function compatibleChat(config, system, messages, tools, planning, usage = {}) {
  const google = config.provider === "google";
  if (google && !process.env.GEMINI_API_KEY) throw new Error("Configure GEMINI_API_KEY on the server to use Gemini.");
  const modelRegion = config.region || region();
  const endpoint = new URL(google ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions" : `https://bedrock-mantle.${modelRegion}.api.aws${config.basePath || "/openai/v1"}/chat/completions`);
  const body = JSON.stringify({ model: config.model, messages: openaiMessages(system, messages),
    ...(google ? { max_tokens: 4096 } : { max_completion_tokens: 4096 }),
    tools: tools.map(t => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } })),
    tool_choice: planning ? "required" : "none", stream: false,
    ...(config.parallelToolCalls === false ? { parallel_tool_calls: false } : {}) });
  let headers;
  if (google) {
    headers = { "content-type": "application/json", Authorization: `Bearer ${process.env.GEMINI_API_KEY}` };
  } else {
    const signer = new SignatureV4({ credentials: awsClientOptions().credentials || fromNodeProviderChain(), region: modelRegion, service: "bedrock-mantle", sha256: Sha256 });
    const signed = await signer.sign(new HttpRequest({ method: "POST", protocol: endpoint.protocol, hostname: endpoint.hostname, path: endpoint.pathname,
      headers: { host: endpoint.hostname, "content-type": "application/json" }, body }));
    headers = signed.headers;
  }
  const response = await fetch(endpoint, { method: "POST", headers, body, signal: AbortSignal.timeout(90000), redirect: "error" });
  if (!response.ok) {
    // Keep what AWS said (expired token, access denied, throttled...) so the
    // failure can be classified and logged rather than guessed at.
    const detail = await response.text().catch(() => "");
    let parsed = {};
    try { parsed = JSON.parse(detail); } catch { /* not JSON */ }
    const reason = parsed.message || parsed.Message || parsed.error?.message || detail.slice(0, 200);
    throw Object.assign(new Error(`${google ? "Google" : "AWS"} model request failed (${response.status}): ${reason}`), {
      name: parsed.__type?.split("#").pop() || parsed.error?.type || parsed.code || `HTTP${response.status}`,
      status: response.status,
      requestId: response.headers.get("x-amzn-requestid") || undefined,
    });
  }
  const result = await response.json();
  usage.inputTokens = result.usage?.prompt_tokens;
  usage.outputTokens = result.usage?.completion_tokens;
  usage.cacheReadTokens = result.usage?.prompt_tokens_details?.cached_tokens;
  const message = result.choices?.[0]?.message;
  if (!message) throw new Error("Hosted model returned no answer.");
  return message;
}

export function planAws(config, system, messages, tools) {
  return measured(config, "plan", (usage) => planOnce(config, system, messages, tools, usage));
}

async function planOnce(config, system, messages, tools, usage) {
  if (config.provider === "mantle" || config.provider === "google") {
    const message = await compatibleChat(config, system, messages, tools, true, usage);
    return (message.tool_calls || []).map(call => ({ type: "tool_use", id: call.id, name: call.function.name, input: JSON.parse(call.function.arguments || "{}"),
      ...(call.extra_content ? { extra_content: call.extra_content } : {}) }));
  }
  const client = new BedrockRuntimeClient(awsClientOptions());
  const result = await client.send(new ConverseCommand({ modelId: config.model, system: systemBlocks(config, system), messages: bedrockMessages(messages),
    inferenceConfig: { maxTokens: 2048 }, toolConfig: { tools: toolSpecs(config, tools), toolChoice: config.toolChoice === "auto" ? { auto: {} } : { any: {} } },
    ...(guardrailConfig() ? { guardrailConfig: guardrailConfig() } : {}) }));
  converseUsage(result.usage, usage);
  if (result.stopReason === "guardrail_intervened") {
    throw new GuardrailIntervened((result.output?.message?.content || []).map(b => b.text || "").join("").trim());
  }
  return (result.output?.message?.content || []).flatMap(b => b.toolUse ? [{ type: "tool_use", id: b.toolUse.toolUseId, name: b.toolUse.name, input: b.toolUse.input }] : []);
}

export function answerAws(config, system, messages, tools, onText) {
  return measured(config, "answer", (usage) => answerOnce(config, system, messages, tools, onText, usage));
}

async function answerOnce(config, system, messages, tools, onText, usage) {
  if (config.provider === "mantle" || config.provider === "google") {
    const result = await compatibleChat(config, system, messages, tools, false, usage);
    if (!result.content?.trim()) throw new Error("Hosted model returned an empty answer.");
    onText(result.content);
    return;
  }
  const client = new BedrockRuntimeClient(awsClientOptions());
  // The final turn has no tools. Preserve retrieved evidence as text, rather
  // than sending tool blocks that require a toolConfig and permit more calls.
  const grounded = messages.map(m => ({ ...m, content: typeof m.content === "string" ? m.content : m.content.map(b =>
    b.type === "tool_result" ? `Retrieved result for ${b.tool_use_id}: ${b.content}` : b.type === "tool_use" ? `Requested ${b.name} (${b.id}): ${JSON.stringify(b.input)}` : b.text || ""
  ).join("\n") }));
  const guardrail = guardrailConfig();
  const result = await client.send(new ConverseStreamCommand({ modelId: config.model, system: systemBlocks(config, system), messages: bedrockMessages(grounded), inferenceConfig: { maxTokens: 1200 },
    // "async" keeps tokens streaming while the guardrail checks behind them.
    ...(guardrail ? { guardrailConfig: { ...guardrail, streamProcessingMode: "async" } } : {}) }));
  let received = false;
  for await (const event of result.stream) {
    if (event.contentBlockDelta?.delta?.text) { received = true; onText(event.contentBlockDelta.delta.text); }
    if (event.metadata?.usage) converseUsage(event.metadata.usage, usage);
    if (event.internalServerException || event.modelStreamErrorException || event.validationException || event.throttlingException || event.serviceUnavailableException) throw new Error("AWS model stream failed.");
  }
  if (!received) throw new Error("AWS model returned an empty answer.");
}
