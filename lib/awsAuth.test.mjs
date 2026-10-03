import test from "node:test";
import assert from "node:assert/strict";
import { awsClientOptions, awsChatError } from "./awsAuth.mjs";

test("local profile overrides env keys while hosted runtimes retain renewable role credentials", () => {
  const env = { BEDROCK_AWS_PROFILE: "luna-dev", AWS_ACCESS_KEY_ID: "expired", AWS_SECRET_ACCESS_KEY: "expired", BEDROCK_REGION: "us-east-1" };
  assert.equal(typeof awsClientOptions(env).credentials, "function");
  for (const host of ["AWS_LAMBDA_FUNCTION_NAME", "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI", "AWS_CONTAINER_CREDENTIALS_FULL_URI"]) {
    assert.equal(awsClientOptions({ ...env, [host]: "hosted" }).credentials, undefined);
  }
  assert.equal(awsClientOptions({}).credentials, undefined);
  assert.equal(awsClientOptions({ AWS_REGION: "us-west-2" }).region, "us-west-2");
  assert.equal(awsClientOptions(env).maxAttempts, 3);
});

test("AWS errors distinguish expired auth, denied access and capacity without exposing details", () => {
  const message = "secret upstream details";
  assert.match(awsChatError({ name: "ExpiredTokenException", message }), /Renew the server's AWS sign-in/);
  assert.match(awsChatError({ name: "AccessDeniedException", message }), /IAM role/);
  assert.match(awsChatError({ name: "ThrottlingException", message }), /temporarily unavailable/);
  assert.ok(!awsChatError({ name: "UnknownError", message }).includes(message));
});
