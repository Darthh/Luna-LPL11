// `node --test lib/rateLimit.test.mjs` - the limiter in memory, shared through
// DynamoDB (dynalite), and falling back when the shared store fails.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { checkRateLimit, checkRateLimitInMemory, useSharedStore } from "./rateLimit.js";

test("memory: counts per key and resets after the window", () => {
  const t0 = 1_000_000;
  assert.equal(checkRateLimitInMemory("m:a", 2, 1000, t0).ok, true);
  assert.equal(checkRateLimitInMemory("m:a", 2, 1000, t0 + 1).ok, true);
  const third = checkRateLimitInMemory("m:a", 2, 1000, t0 + 2);
  assert.equal(third.ok, false);
  assert.equal(third.remaining, 0);
  assert.equal(checkRateLimitInMemory("m:b", 2, 1000, t0 + 2).ok, true, "other keys unaffected");
  assert.equal(checkRateLimitInMemory("m:a", 2, 1000, t0 + 1000).ok, true, "new window");
});

let server;
after(() => server && new Promise((r) => server.close(r)));

test("shared: every instance draws from one DynamoDB counter", async () => {
  const { default: dynalite } = await import("dynalite");
  const { DynamoDBClient, CreateTableCommand } = await import("@aws-sdk/client-dynamodb");
  const { DynamoDBDocumentClient, UpdateCommand } = await import("@aws-sdk/lib-dynamodb");
  server = dynalite({ createTableMs: 0 });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const raw = new DynamoDBClient({
    endpoint: `http://127.0.0.1:${server.address().port}`,
    region: "us-east-1",
    credentials: { accessKeyId: "x", secretAccessKey: "x" },
  });
  await raw.send(new CreateTableCommand({
    TableName: "LunaData", BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [{ AttributeName: "PK", AttributeType: "S" }, { AttributeName: "SK", AttributeType: "S" }],
    KeySchema: [{ AttributeName: "PK", KeyType: "HASH" }, { AttributeName: "SK", KeyType: "RANGE" }],
  }));
  useSharedStore({ doc: DynamoDBDocumentClient.from(raw), UpdateCommand, table: "LunaData" });

  // Concurrent requests stand in for separate Lambda instances: with a
  // per-instance counter all five would pass a cap of three.
  const results = await Promise.all(Array.from({ length: 5 }, () => checkRateLimit("s:visitor", 3)));
  assert.equal(results.filter((r) => r.ok).length, 3);
  assert.ok(results.every((r) => r.retryAfterSeconds > 0));
  assert.equal((await checkRateLimit("s:other", 3)).ok, true);
});

test("shared store failure falls back to this instance's counter", async () => {
  const quiet = console.error;
  console.error = () => {};
  try {
    useSharedStore({ doc: { send: async () => { throw Object.assign(new Error("down"), { name: "ServiceUnavailable" }); } }, UpdateCommand: class {}, table: "x" });
    assert.equal((await checkRateLimit("f:visitor", 1)).ok, true);
    assert.equal((await checkRateLimit("f:visitor", 1)).ok, false, "still limited, per instance");
  } finally {
    console.error = quiet;
    useSharedStore(null);
  }
});
