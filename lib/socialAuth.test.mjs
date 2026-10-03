import { test } from "node:test";
import assert from "node:assert/strict";

const keys = ["AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "AUTH_APPLE_ID", "AUTH_APPLE_SECRET"];
let scenario = 0;

async function configured(values, check) {
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) process.env[key] = values[key] || "";
    const config = await import(`../auth.config.js?social-test=${scenario++}`);
    await check(config);
  } finally {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
}

test("unconfigured or partially configured providers are not registered", async () => {
  await configured({ AUTH_GOOGLE_ID: "synthetic-id", AUTH_APPLE_SECRET: "synthetic-test-value" }, ({ authConfig, googleEnabled, appleEnabled }) => {
    assert.equal(googleEnabled, false);
    assert.equal(appleEnabled, false);
    assert.deepEqual(authConfig.providers, []);
  });
});

test("Google and Apple register independently and retain account-linking protection", async () => {
  await configured({ AUTH_GOOGLE_ID: "synthetic-id", AUTH_GOOGLE_SECRET: "synthetic-test-value", AUTH_APPLE_ID: "synthetic-services-id", AUTH_APPLE_SECRET: "synthetic-test-jwt" }, async ({ authConfig, googleEnabled, appleEnabled }) => {
    assert.equal(googleEnabled, true);
    assert.equal(appleEnabled, true);
    const providers = authConfig.providers.map((provider) => provider());
    assert.deepEqual(providers.map((provider) => provider.id), ["google", "apple"]);
    for (const provider of providers) assert.notEqual(provider.allowDangerousEmailAccountLinking, true);
    const apple = providers[1];
    assert.equal(apple.authorization.params.response_mode, "form_post");
    assert.deepEqual(apple.checks, ["nonce", "state"]);
    assert.equal(authConfig.session.strategy, "jwt");
    const session = await authConfig.callbacks.session({ session: { user: {} }, token: { id: "account-123" } });
    assert.equal(session.user.id, "account-123");
  });
  await configured({ AUTH_APPLE_ID: "synthetic-services-id", AUTH_APPLE_SECRET: "synthetic-test-jwt" }, ({ authConfig }) => {
    assert.deepEqual(authConfig.providers.map((provider) => provider().id), ["apple"]);
  });
});
