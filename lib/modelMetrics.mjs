// One CloudWatch metrics record per model call: latency, tokens in and out,
// cache reads, and errors, by model and step (plan / answer). Written as
// Embedded Metric Format - a JSON log line that Lambda turns into CloudWatch
// metrics on its own, with no API call and nothing to provision. Namespace
// "LunaTerminal/AI"; graph LatencyMs or OutputTokens by Model to compare the
// models on speed and cost.
//
// The same line is plain JSON in Logs Insights, e.g.
//   filter _aws.CloudWatchMetrics.0.Namespace = "LunaTerminal/AI"
//   | stats avg(LatencyMs), sum(InputTokens), sum(OutputTokens) by Model

const NAMESPACE = "LunaTerminal/AI";
const METRICS = [
  { Name: "LatencyMs", Unit: "Milliseconds" },
  { Name: "InputTokens", Unit: "Count" },
  { Name: "OutputTokens", Unit: "Count" },
  { Name: "CacheReadTokens", Unit: "Count" },
  { Name: "Errors", Unit: "Count" },
];

export function metricRecord({ model, provider, stage, ms, usage = {}, ok, errorName }, now = Date.now()) {
  return {
    _aws: {
      Timestamp: now,
      CloudWatchMetrics: [{ Namespace: NAMESPACE, Dimensions: [["Model"], ["Model", "Stage"]], Metrics: METRICS }],
    },
    Model: String(model || "unknown"),
    Stage: String(stage || "call"),
    Provider: String(provider || "unknown"),
    LatencyMs: Math.max(0, Math.round(ms || 0)),
    InputTokens: Number(usage.inputTokens) || 0,
    OutputTokens: Number(usage.outputTokens) || 0,
    CacheReadTokens: Number(usage.cacheReadTokens) || 0,
    Errors: ok ? 0 : 1,
    ...(errorName ? { ErrorName: String(errorName) } : {}),
  };
}

// Quiet in `next dev` and tests; on in Lambda and the AgentCore runtime.
// LUNA_METRICS=on forces it locally, LUNA_METRICS=off silences it anywhere.
function enabled() {
  if (process.env.LUNA_METRICS === "off") return false;
  if (process.env.LUNA_METRICS === "on") return true;
  return process.env.NODE_ENV !== "development" && !process.env.NODE_TEST_CONTEXT;
}

export function recordModelCall(call) {
  if (!enabled()) return;
  try {
    console.log(JSON.stringify(metricRecord(call)));
  } catch {
    // Metrics must never break an answer.
  }
}
