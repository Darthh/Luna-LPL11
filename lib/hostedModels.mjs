export const HOSTED_MODELS = [
  { id: "aws-gpt", label: "GPT-5.6 Sol · AWS", detail: "Default · live market tools" },
  { id: "aws-claude", label: "Claude Opus 5 · AWS", detail: "Top Claude available · live market tools" },
  { id: "aws-meta", label: "Meta Llama 4 Maverick · AWS", detail: "Bedrock · live market tools" },
  { id: "aws-qwen", label: "Qwen3 235B A22B · AWS", detail: "Bedrock · live market tools" },
  { id: "aws-gemma", label: "Google Gemma 4 31B · AWS", detail: "Bedrock · live market tools" },
  { id: "google-gemini", label: "Gemini 3.8 Flash · Google", detail: "Google API · requires server configuration" },
  { id: "luna-finance", label: "Luna Finance", detail: "Luna assistant · live market tools" },
];

export const DEFAULT_HOSTED_MODEL = HOSTED_MODELS[0].id;

export function hostedModel(id, env = process.env) {
  switch (id) {
    case "luna-finance": return { provider: "anthropic", model: env.AI_BOT_MODEL || "claude-haiku-4-5-20251001" };
    case "aws-claude": return { provider: "bedrock", model: env.BEDROCK_CLAUDE_MODEL_ID || "global.anthropic.claude-opus-5" };
    case "aws-gpt": return { provider: "bedrock", model: env.BEDROCK_GPT_MODEL_ID || "global.openai.gpt-5.6-sol" };
    case "aws-meta": return { provider: "bedrock", model: env.BEDROCK_META_MODEL_ID || "us.meta.llama4-maverick-17b-instruct-v1:0", toolChoice: "auto" };
    case "aws-qwen": return { provider: "mantle", model: env.BEDROCK_QWEN_MODEL_ID || "qwen.qwen3-235b-a22b-2507", basePath: "/v1", parallelToolCalls: false };
    case "aws-gemma": return { provider: "mantle", model: env.BEDROCK_GEMMA_MODEL_ID || "google.gemma-4-31b", parallelToolCalls: false };
    case "google-gemini": return { provider: "google", model: env.GEMINI_MODEL_ID || "gemini-3.8-flash" };
    default: return null;
  }
}

// Which model answers when the chosen one can't (access denied in this
// region, throttled, unavailable). The two models verified in the workshop
// account back each other up; the rest fall back to Claude.
const BACKUP = { "aws-gpt": "aws-claude", "aws-claude": "aws-gpt", "aws-meta": "aws-claude", "aws-qwen": "aws-claude", "aws-gemma": "aws-claude", "google-gemini": "aws-gpt" };

export function backupModel(id, env = process.env) {
  const backupId = BACKUP[id];
  return backupId ? { id: backupId, label: HOSTED_MODELS.find((m) => m.id === backupId)?.label, ...hostedModel(backupId, env) } : null;
}
