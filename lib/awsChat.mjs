import { BedrockRuntimeClient, ConverseCommand, ConverseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { SignatureV4 } from "@smithy/signature-v4";
import { HttpRequest } from "@smithy/protocol-http";
import { Sha256 } from "@aws-crypto/sha256-js";

const region = () => process.env.BEDROCK_REGION || process.env.AWS_REGION || "us-east-1";

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
      tool_calls: content.filter(b => b.type === "tool_use").map(b => ({ id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input) } })) }];
  })];
}

async function mantle(config, system, messages, tools, planning) {
  const endpoint = new URL(`https://bedrock-mantle.${region()}.api.aws/openai/v1/chat/completions`);
  const body = JSON.stringify({ model: config.model, messages: openaiMessages(system, messages), max_completion_tokens: 4096,
    tools: tools.map(t => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } })),
    tool_choice: planning ? "required" : "none", stream: false });
  const signer = new SignatureV4({ credentials: fromNodeProviderChain(), region: region(), service: "bedrock-mantle", sha256: Sha256 });
  const signed = await signer.sign(new HttpRequest({ method: "POST", protocol: endpoint.protocol, hostname: endpoint.hostname, path: endpoint.pathname,
    headers: { host: endpoint.hostname, "content-type": "application/json" }, body }));
  const response = await fetch(endpoint, { method: "POST", headers: signed.headers, body, signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error(`AWS GPT request failed (${response.status}). Check model access and bedrock-mantle:CreateInference permission.`);
  const result = await response.json();
  const message = result.choices?.[0]?.message;
  if (!message) throw new Error("AWS GPT returned no answer.");
  return message;
}

export async function planAws(config, system, messages, tools) {
  if (config.provider === "mantle") {
    const message = await mantle(config, system, messages, tools, true);
    return (message.tool_calls || []).map(call => ({ type: "tool_use", id: call.id, name: call.function.name, input: JSON.parse(call.function.arguments || "{}") }));
  }
  const client = new BedrockRuntimeClient({ region: region(), maxAttempts: 2 });
  const result = await client.send(new ConverseCommand({ modelId: config.model, system: [{ text: system }], messages: bedrockMessages(messages),
    inferenceConfig: { maxTokens: 2048 }, toolConfig: { tools: tools.map(t => ({ toolSpec: { name: t.name, description: t.description, inputSchema: { json: t.input_schema } } })), toolChoice: { any: {} } } }));
  return (result.output?.message?.content || []).flatMap(b => b.toolUse ? [{ type: "tool_use", id: b.toolUse.toolUseId, name: b.toolUse.name, input: b.toolUse.input }] : []);
}

export async function answerAws(config, system, messages, tools, onText) {
  if (config.provider === "mantle") {
    const result = await mantle(config, system, messages, tools, false);
    if (!result.content?.trim()) throw new Error("AWS GPT returned an empty answer.");
    onText(result.content);
    return;
  }
  const client = new BedrockRuntimeClient({ region: region(), maxAttempts: 2 });
  // The final turn has no tools. Preserve retrieved evidence as text, rather
  // than sending tool blocks that require a toolConfig and permit more calls.
  const grounded = messages.map(m => ({ ...m, content: typeof m.content === "string" ? m.content : m.content.map(b =>
    b.type === "tool_result" ? `Retrieved result for ${b.tool_use_id}: ${b.content}` : b.type === "tool_use" ? `Requested ${b.name} (${b.id}): ${JSON.stringify(b.input)}` : b.text || ""
  ).join("\n") }));
  const result = await client.send(new ConverseStreamCommand({ modelId: config.model, system: [{ text: system }], messages: bedrockMessages(grounded), inferenceConfig: { maxTokens: 1200 } }));
  let received = false;
  for await (const event of result.stream) {
    if (event.contentBlockDelta?.delta?.text) { received = true; onText(event.contentBlockDelta.delta.text); }
    if (event.internalServerException || event.modelStreamErrorException || event.validationException || event.throttlingException || event.serviceUnavailableException) throw new Error("AWS model stream failed.");
  }
  if (!received) throw new Error("AWS model returned an empty answer.");
}
