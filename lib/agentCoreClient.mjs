import { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } from "@aws-sdk/client-bedrock-agentcore";

export async function invokeAgent(input, runtimeSessionId, onEvent) {
  if (!process.env.AGENTCORE_RUNTIME_ARN) throw new Error("AgentCore has not been deployed.");
  const client = new BedrockAgentCoreClient({ region: process.env.BEDROCK_REGION || "us-east-1", maxAttempts: 1 });
  const result = await client.send(new InvokeAgentRuntimeCommand({
    agentRuntimeArn: process.env.AGENTCORE_RUNTIME_ARN, runtimeSessionId,
    contentType: "application/json", accept: "application/x-ndjson",
    payload: Buffer.from(JSON.stringify(input)),
  }), { abortSignal: AbortSignal.timeout(115000) });
  if (result.statusCode && result.statusCode !== 200) throw new Error("AgentCore invocation failed.");
  const decoder = new TextDecoder();
  let pending = "";
  const consume = (row) => { if (row.trim()) onEvent(JSON.parse(row)); };
  for await (const chunk of result.response) {
    pending += decoder.decode(chunk, { stream: true });
    const rows = pending.split("\n");
    pending = rows.pop();
    rows.forEach(consume);
  }
  pending += decoder.decode();
  consume(pending);
}
