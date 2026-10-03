// Which hosted AWS models answer right now, from these credentials, and if not
// why: `node scripts/check-bedrock.mjs` (or `npm run check:bedrock`).
//
// Sends each model in lib/hostedModels.mjs a tiny prompt (a few tokens each)
// through the same code the chat uses, and prints latency or the classified
// failure. Also prints when the current AWS credentials expire - temporary
// workshop credentials expiring is the usual cause of "it worked a few minutes
// ago". Run it a few times: a model that alternates between OK and
// access_denied is being routed into a region the account blocks.
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { HOSTED_MODELS, hostedModel } from "../lib/hostedModels.mjs";
import { answerAws } from "../lib/awsChat.mjs";
import { classifyAwsError } from "../lib/awsErrors.mjs";

const region = process.env.BEDROCK_REGION || process.env.AWS_REGION || "us-east-1";
try {
  const creds = await fromNodeProviderChain()();
  const expires = creds.expiration ? Math.round((creds.expiration - Date.now()) / 60000) : null;
  console.log(
    `credentials: ${creds.accessKeyId.slice(0, 4)}…${creds.accessKeyId.slice(-4)}` +
      (expires == null ? " (long-lived)" : ` expire in ${expires} min (${creds.expiration.toISOString()})`) +
      `  region: ${region}\n`
  );
} catch (err) {
  console.log(`credentials: none found (${err.message}). Sign in with \`aws sso login\` or export AWS_* variables.\n`);
}

const probeTool = [{ name: "no_data_needed", description: "Unused.", input_schema: { type: "object", properties: {} } }];
const only = process.argv.slice(2);
for (const { id, label } of HOSTED_MODELS) {
  const config = hostedModel(id);
  if (!config || config.provider === "anthropic" || config.provider === "google") continue;
  if (only.length && !only.includes(id)) continue;
  const started = Date.now();
  try {
    let text = "";
    await answerAws(config, "Reply with the single word OK.", [{ role: "user", content: "Health check." }], probeTool, (d) => (text += d));
    console.log(`OK    ${label.padEnd(30)} ${String(Date.now() - started).padStart(6)} ms  ${config.model}`);
  } catch (err) {
    const c = classifyAwsError(err);
    console.log(`FAIL  ${label.padEnd(30)} ${c.kind.padEnd(17)} ${config.model}\n      ${c.name} ${c.status ?? ""}: ${String(err.message).slice(0, 160)}`);
  }
}
