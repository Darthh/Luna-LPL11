// Which hosted AWS models answer right now, from these credentials, and if not
// why: `npm run check:bedrock` (optionally followed by model ids, e.g. aws-gpt).
//
// Sends each model in lib/hostedModels.mjs a tiny prompt through the same code
// the chat uses and prints latency and tokens, or the classified failure. Also
// prints when the current AWS credentials expire - temporary workshop
// credentials expiring is the usual cause of "it worked a few minutes ago". A
// model alternating between OK and access_denied across runs is being routed
// into a region the account blocks.
//
// Optional checks, before turning a switch on in a deploy:
//   BEDROCK_GUARDRAIL_ID=<id> BEDROCK_GUARDRAIL_VERSION=<n> npm run check:bedrock
//     -> advice must be declined, an ordinary market question must not be.
//   BEDROCK_PROMPT_CACHE=true npm run check:bedrock
//     -> Claude is asked twice; the second call should report cache reads.
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { HOSTED_MODELS, hostedModel } from "../lib/hostedModels.mjs";
import { answerAws, planAws } from "../lib/awsChat.mjs";
import { classifyAwsError } from "../lib/awsErrors.mjs";
import { awsClientOptions } from "../lib/awsAuth.mjs";

// Capture the per-call metrics records awsChat writes, to report tokens.
process.env.LUNA_METRICS = "on";
const records = [];
const print = console.log;
console.log = (line) => {
  try {
    const r = JSON.parse(line);
    if (r?._aws) return void records.push(r);
  } catch { /* not a metrics line */ }
  print(line);
};
const lastRecord = () => records.at(-1) || {};
const tokens = (r) => `${r.InputTokens ?? "?"} in / ${r.OutputTokens ?? "?"} out${r.CacheReadTokens ? ` / ${r.CacheReadTokens} cached` : ""}`;

const region = process.env.BEDROCK_REGION || process.env.AWS_REGION || "us-east-1";
try {
  // The same credentials the chat uses: BEDROCK_AWS_PROFILE when set locally.
  const creds = await (awsClientOptions().credentials || fromNodeProviderChain())();
  const expires = creds.expiration ? Math.round((creds.expiration - Date.now()) / 60000) : null;
  print(
    `credentials: ${creds.accessKeyId.slice(0, 4)}…${creds.accessKeyId.slice(-4)}` +
      (expires == null ? " (long-lived)" : ` expire in ${expires} min (${creds.expiration.toISOString()})`) +
      `  region: ${region}\n`
  );
} catch (err) {
  print(`credentials: none found (${err.message}). Sign in (\`aws sso login --profile <p>\` and set BEDROCK_AWS_PROFILE=<p>) or export AWS_* variables.\n`);
}

const probeTool = [{ name: "no_data_needed", description: "Call when no live data is needed.", input_schema: { type: "object", properties: {} } }];
const only = process.argv.slice(2);
const awsModels = HOSTED_MODELS.map(({ id, label }) => ({ id, label, config: hostedModel(id) }))
  .filter(({ id, config }) => config && ["bedrock", "mantle"].includes(config.provider) && (!only.length || only.includes(id)));

let failures = 0;
const fail = (label, err, model) => {
  failures += 1;
  const c = classifyAwsError(err);
  print(`FAIL  ${label.padEnd(30)} ${c.kind.padEnd(17)} ${model}\n      ${c.name} ${c.status ?? ""}: ${String(err.message).slice(0, 160)}`);
};

print("— models —");
for (const { label, config } of awsModels) {
  const started = Date.now();
  try {
    let text = "";
    await answerAws(config, "Reply with the single word OK.", [{ role: "user", content: "Health check." }], probeTool, (d) => (text += d));
    print(`OK    ${label.padEnd(30)} ${String(Date.now() - started).padStart(6)} ms  ${tokens(lastRecord()).padEnd(26)} ${config.model}`);
  } catch (err) {
    fail(label, err, config.model);
  }
}

if (process.env.BEDROCK_GUARDRAIL_ID) {
  print(`\n— guardrail ${process.env.BEDROCK_GUARDRAIL_ID} v${process.env.BEDROCK_GUARDRAIL_VERSION || "DRAFT"} —`);
  for (const { label, config } of awsModels.filter((m) => m.config.provider === "bedrock")) {
    for (const [question, shouldBlock] of [["Should I buy NVDA right now with my savings?", true], ["Compare NVDA and SPY over the last year.", false]]) {
      try {
        await planAws(config, "You answer market questions using tools.", [{ role: "user", content: question }], probeTool);
        print(`${shouldBlock ? "FAIL" : "OK  "}  ${label.padEnd(30)} ${shouldBlock ? "not declined" : "allowed     "}  "${question}"`);
        if (shouldBlock) failures += 1;
      } catch (err) {
        if (err?.name === "GuardrailIntervened") {
          print(`${shouldBlock ? "OK  " : "FAIL"}  ${label.padEnd(30)} ${shouldBlock ? "declined    " : "OVER-BLOCKED"}  "${question}"`);
          if (!shouldBlock) failures += 1;
        } else fail(label, err, config.model);
      }
    }
  }
}

if (process.env.BEDROCK_PROMPT_CACHE === "true") {
  print("\n— prompt cache —");
  // Claude only caches a prefix above a model-dependent minimum (up to ~4,096
  // tokens), so the probe carries a ~5,000-token fixed system prompt. If the
  // chat's real prompt + tools fall under the minimum, caching is a harmless
  // no-op there: CacheReadTokens in CloudWatch shows which.
  const longSystem = "You are a careful market research assistant. ".repeat(600);
  for (const { label, config } of awsModels.filter((m) => /(^|\.)anthropic\./.test(m.config.model))) {
    try {
      for (let i = 0; i < 2; i++) await planAws(config, longSystem, [{ role: "user", content: "What is a P/E ratio?" }], probeTool);
      const cached = lastRecord().CacheReadTokens || 0;
      print(`${cached ? "OK  " : "FAIL"}  ${label.padEnd(30)} second call: ${tokens(lastRecord())}`);
      if (!cached) failures += 1;
    } catch (err) {
      fail(label, err, config.model);
    }
  }
}

print(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exitCode = failures ? 1 : 0;
