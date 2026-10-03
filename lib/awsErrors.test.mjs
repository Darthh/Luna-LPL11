// `node --test lib/awsErrors.test.mjs` - telling Bedrock failures apart, and
// the retry/backup-model policy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyAwsError, withFailover } from "./awsErrors.mjs";

const sdk = (name, status, message = "") => Object.assign(new Error(message), { name, $metadata: { httpStatusCode: status, requestId: "r-1" } });

test("classifies the shapes Bedrock, Mantle and the SDK fail in", () => {
  const cases = [
    [sdk("ExpiredTokenException", 403, "The security token included in the request is expired"), "credentials"],
    [sdk("UnrecognizedClientException", 403, "The security token included in the request is invalid."), "credentials"],
    [Object.assign(new Error("Could not load credentials from any providers"), { name: "CredentialsProviderError" }), "credentials"],
    [sdk("AccessDeniedException", 403, "User is not authorized to perform bedrock:InvokeModel with an explicit deny in a service control policy"), "access_denied"],
    [Object.assign(new Error("AWS model request failed (403): Forbidden"), { name: "HTTP403", status: 403 }), "access_denied"],
    [sdk("ThrottlingException", 429, "Too many requests"), "throttled"],
    [sdk("ServiceQuotaExceededException", 400), "throttled"],
    [sdk("ValidationException", 400, "Invocation of model ID x with on-demand throughput isn't supported"), "model_unavailable"],
    [sdk("ResourceNotFoundException", 404), "model_unavailable"],
    [Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }), "timeout"],
    [sdk("ServiceUnavailableException", 503), "upstream"],
    [new Error("AWS model stream failed."), "upstream"],
    [new Error("something else"), "unknown"],
  ];
  for (const [err, kind] of cases) assert.equal(classifyAwsError(err).kind, kind, err.message || err.name);
  assert.equal(classifyAwsError(sdk("ExpiredTokenException", 403)).fallback, false, "every AWS model shares credentials");
});

const quiet = async (fn) => {
  const original = console.error;
  const logged = [];
  console.error = (line) => logged.push(JSON.parse(line));
  try { return [await fn(), logged]; } finally { console.error = original; }
};
const primary = { model: "gpt" };
const backup = { model: "claude", label: "Claude" };

test("a blip is retried on the same model", async () => {
  let calls = 0;
  const [out, logged] = await quiet(() =>
    withFailover({ primary, backup, retryDelayMs: 0, attempt: async (c) => { if (calls++ === 0) throw sdk("ThrottlingException", 429); return c.model; } })
  );
  assert.deepEqual(out, { value: "gpt", config: primary });
  assert.equal(logged[0].kind, "throttled");
  assert.equal(logged[0].model, "gpt");
});

test("a model-specific failure moves to the backup model", async () => {
  const [out] = await quiet(() =>
    withFailover({ primary, backup, retryDelayMs: 0, attempt: async (c) => { if (c === primary) throw sdk("AccessDeniedException", 403); return c.model; } })
  );
  assert.deepEqual(out, { value: "claude", config: backup });
});

test("credential failures don't waste a call on the backup", async () => {
  const tried = [];
  await quiet(() =>
    assert.rejects(withFailover({ primary, backup, retryDelayMs: 0, attempt: async (c) => { tried.push(c.model); throw sdk("ExpiredTokenException", 403); } }))
  );
  assert.deepEqual(tried, ["gpt"]);
});

test("nothing switches once text has reached the browser", async () => {
  const tried = [];
  await quiet(() =>
    assert.rejects(withFailover({ primary, backup, retryDelayMs: 0, canSwitch: () => false, attempt: async (c) => { tried.push(c.model); throw sdk("ThrottlingException", 429); } }))
  );
  assert.deepEqual(tried, ["gpt"]);
});
