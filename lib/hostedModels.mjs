export const HOSTED_MODELS = [
  { id: "luna-finance", label: "Luna Finance", detail: "Live market tools" },
  { id: "aws-claude", label: "Claude Haiku 4.5 · AWS", detail: "Bedrock · live market tools" },
  { id: "aws-gpt", label: "GPT-5.4 · AWS", detail: "Bedrock Mantle · live market tools" },
];

export function hostedModel(id, env = process.env) {
  switch (id) {
    case "luna-finance": return { provider: "anthropic", model: env.AI_BOT_MODEL || "claude-haiku-4-5-20251001" };
    case "aws-claude": return { provider: "bedrock", model: env.BEDROCK_CLAUDE_MODEL_ID || "us.anthropic.claude-haiku-4-5-20251001-v1:0" };
    case "aws-gpt": return { provider: "mantle", model: env.BEDROCK_GPT_MODEL_ID || "openai.gpt-5.4" };
    default: return null;
  }
}
