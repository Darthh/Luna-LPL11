// Why a hosted model call failed, in terms someone can act on. Bedrock, the
// Mantle endpoint and the AWS SDK report failures in different shapes - an SDK
// exception name, an HTTP status, a JSON body - so this reads all of them.
//
// `retryable`: worth one more attempt on the same model (a blip).
// `fallback`:  worth trying a different model - this one, here, is the problem.
//              Not for credentials: every AWS model shares them.

const KINDS = {
  credentials: {
    retryable: false,
    fallback: false,
    message:
      "AWS rejected the server's credentials (expired or invalid). Local runs on workshop credentials need fresh ones; on Lambda, check the function's role.",
  },
  access_denied: {
    retryable: false,
    fallback: true,
    message:
      "AWS denied access to this model. The account's policy or model access doesn't allow it (some models and regions are blocked in the workshop account).",
  },
  throttled: { retryable: true, fallback: true, message: "This model is rate-limited right now. Try again in a minute or pick another model." },
  model_unavailable: { retryable: false, fallback: true, message: "This model isn't available in this AWS account or region." },
  timeout: { retryable: true, fallback: true, message: "The model took too long to answer. Try again, or pick a faster model." },
  upstream: { retryable: true, fallback: true, message: "AWS had a temporary problem with this model. Try again." },
  unknown: {
    retryable: false,
    fallback: true,
    message: "This AWS model could not answer. Check AWS credentials, region, model access, and inference permissions.",
  },
};

export function classifyAwsError(err) {
  const name = String(err?.name || err?.code || err?.Code || "");
  const status = err?.$metadata?.httpStatusCode ?? err?.status;
  const text = `${name} ${err?.message || ""}`;
  let kind = "unknown";
  if (/ExpiredToken|TokenRefreshRequired|security token.*(invalid|expired)|UnrecognizedClient|InvalidSignature|CredentialsProviderError|Could not load credentials|InvalidClientTokenId/i.test(text)) {
    kind = "credentials";
  } else if (status === 429 || /Throttl|TooManyRequests|ServiceQuotaExceeded|rate exceeded/i.test(text)) {
    kind = "throttled";
  } else if (status === 403 || /AccessDenied|not authorized|explicit deny/i.test(text)) {
    kind = "access_denied";
  } else if (status === 404 || /ResourceNotFound|on-demand throughput|model.{0,40}(not found|not supported|invalid|does not exist)/i.test(text)) {
    kind = "model_unavailable";
  } else if (status === 408 || /Timeout|AbortError|ETIMEDOUT|ECONNRESET|socket hang up/i.test(text)) {
    kind = "timeout";
  } else if (status >= 500 || /ServiceUnavailable|InternalServer|ModelStreamError|ModelNotReady|stream failed/i.test(text)) {
    kind = "upstream";
  }
  return { kind, status, name, ...KINDS[kind] };
}

// One line of JSON per failure, so CloudWatch Logs Insights can count them by
// kind, model and region - e.g. `filter event = "hosted_model_failed" | stats
// count() by kind, model`.
export function logAwsFailure(err, config, stage) {
  const c = classifyAwsError(err);
  console.error(
    JSON.stringify({
      event: "hosted_model_failed",
      stage,
      kind: c.kind,
      model: config?.model,
      provider: config?.provider,
      region: config?.region || process.env.BEDROCK_REGION || process.env.AWS_REGION,
      status: c.status,
      name: c.name,
      requestId: err?.$metadata?.requestId || err?.requestId,
      message: String(err?.message || "").slice(0, 300),
    })
  );
  return c;
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Run `attempt(config)` on the chosen model: one retry for a blip, then the
// backup model if the failure is about this model. `canSwitch()` says whether
// it is still safe to change course (false once text has reached the browser).
// Resolves to { value, config } - the config that actually answered.
export async function withFailover({ primary, backup, attempt, canSwitch = () => true, stage = "call", retryDelayMs = 500 }) {
  let config = primary;
  for (let round = 0; round < 2; round++) {
    try {
      return { value: await attempt(config), config };
    } catch (err) {
      const c = logAwsFailure(err, config, stage);
      if (!canSwitch()) throw err;
      if (c.retryable) {
        await pause(retryDelayMs);
        try {
          return { value: await attempt(config), config };
        } catch (again) {
          logAwsFailure(again, config, `${stage}:retry`);
          if (!canSwitch()) throw again;
          err = again;
        }
      }
      if (round === 0 && backup && backup !== primary && classifyAwsError(err).fallback) {
        config = backup;
        continue;
      }
      throw err;
    }
  }
  throw new Error("unreachable");
}
