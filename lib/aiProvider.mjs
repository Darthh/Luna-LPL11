// Which Claude the hosted assistant talks to. One choice, made from the
// environment, so the chat route never branches on it:
//
//   AI_PROVIDER=bedrock  Claude in Amazon Bedrock. Signs requests with the
//                        runtime's AWS credentials (the Lambda's IAM role in
//                        an SST stage, your AWS profile locally) - no API key.
//   ANTHROPIC_API_KEY    The Claude API directly (the original setup).
//   neither              No model; the route answers from lib/liloLocal.js.
//
// Both clients expose the same messages.create / messages.stream surface, so
// the tool loop is identical either way. The SDKs are imported on first use:
// a deployment configured for one provider never loads the other.

// Haiku 4.5: chat latency matters more than depth here, and the deterministic
// tools still own every market number. Override with AI_BOT_MODEL.
const DEFAULT_MODEL = "claude-haiku-4-5";

// Bedrock names models with a provider prefix ("anthropic.claude-haiku-4-5").
// Accept the plain Claude API name too, so one AI_BOT_MODEL value works on
// either provider.
export function bedrockModelId(model) {
  return model.startsWith("claude-") ? `anthropic.${model}` : model;
}

export function aiConfig(env = process.env) {
  const model = env.AI_BOT_MODEL || DEFAULT_MODEL;
  if (env.AI_PROVIDER === "bedrock") {
    return {
      provider: "bedrock",
      model: bedrockModelId(model),
      region: env.BEDROCK_REGION || env.AWS_REGION || "us-east-1",
    };
  }
  if (env.ANTHROPIC_API_KEY) {
    return { provider: "anthropic", model, workspaceId: env.ANTHROPIC_WORKSPACE_ID || undefined };
  }
  return null;
}

let cached;

// The client for this deployment, or null when no model is configured.
export async function getAiClient() {
  if (cached !== undefined) return cached;
  const config = aiConfig();
  if (!config) return (cached = null);

  if (config.provider === "bedrock") {
    const { AnthropicBedrockMantle } = await import("@anthropic-ai/bedrock-sdk");
    cached = { ...config, client: new AnthropicBedrockMantle({ awsRegion: config.region }) };
  } else {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    // A workspace-scoped key carries its workspace already; an org-level key
    // does not, and the API rejects the request outright telling you to name
    // one. The header is only sent when the variable is set.
    cached = {
      ...config,
      client: new Anthropic({
        defaultHeaders: config.workspaceId ? { "anthropic-workspace-id": config.workspaceId } : undefined,
      }),
    };
  }
  return cached;
}
