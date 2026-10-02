// One behaviour suite, run against both chat stores: `node --test lib/chatRepository.test.mjs`.
// DynamoDB is exercised through dynalite (an in-process DynamoDB), so the
// real key and condition expressions run without an AWS account.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createMemoryChatRepository, createDynamoChatRepository, ChatGapError } from "./chatRepository.mjs";
import { parseAppend, parseImport, ChatInputError, MAX_MESSAGE_CHARS } from "./chats.mjs";

const user = (content) => ({ role: "user", content });
const bot = (content, extra = {}) => ({ role: "assistant", content, ...extra });
const save = (repo, userId, chatId, messages, from = 0, title) =>
  repo.append(userId, chatId, parseAppend({ messages, from, title }));

async function dynamoRepo() {
  const { default: dynalite } = await import("dynalite");
  const { DynamoDBClient, CreateTableCommand } = await import("@aws-sdk/client-dynamodb");
  const { DynamoDBDocumentClient } = await import("@aws-sdk/lib-dynamodb");

  const server = dynalite({ createTableMs: 0, deleteTableMs: 0, updateTableMs: 0 });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const raw = new DynamoDBClient({
    endpoint: `http://127.0.0.1:${server.address().port}`,
    region: "us-east-1",
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
  });
  const S = (name) => ({ AttributeName: name, AttributeType: "S" });
  await raw.send(
    new CreateTableCommand({
      TableName: "LunaData",
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [S("PK"), S("SK"), S("GSI1PK"), S("GSI1SK")],
      KeySchema: [{ AttributeName: "PK", KeyType: "HASH" }, { AttributeName: "SK", KeyType: "RANGE" }],
      GlobalSecondaryIndexes: [
        {
          IndexName: "GSI1",
          KeySchema: [{ AttributeName: "GSI1PK", KeyType: "HASH" }, { AttributeName: "GSI1SK", KeyType: "RANGE" }],
          Projection: { ProjectionType: "ALL" },
        },
      ],
    })
  );
  const client = DynamoDBDocumentClient.from(raw, { marshallOptions: { removeUndefinedValues: true } });
  const repo = await createDynamoChatRepository({ tableName: "LunaData", client });
  return { repo, close: () => new Promise((resolve) => server.close(resolve)) };
}

const stores = [
  ["memory", async () => ({ repo: createMemoryChatRepository(), close: async () => {} })],
  ["dynamodb", dynamoRepo],
];

for (const [name, make] of stores) {
  describe(`chat repository (${name})`, () => {
    let repo;
    let close;
    before(async () => ({ repo, close } = await make()));
    after(() => close());

    test("creates a chat, then appends only new messages", async () => {
      const first = await save(repo, "u1", "chat-aaaa", [user("What is NVDA at?"), bot("NVDA is $1.", { sources: [{ url: "https://x" }] })]);
      assert.deepEqual(first, { messageCount: 2, created: true });

      // The client resends the whole history; only index 2-3 are new.
      const history = [user("What is NVDA at?"), bot("NVDA is $1."), user("And AMD?"), bot("AMD is $2.")];
      const second = await save(repo, "u1", "chat-aaaa", history);
      assert.deepEqual(second, { messageCount: 4, created: false });

      const chat = await repo.get("u1", "chat-aaaa");
      assert.equal(chat.title, "What is NVDA at?");
      assert.deepEqual(chat.messages.map((m) => m.content), history.map((m) => m.content));
      assert.deepEqual(chat.messages[1].sources, [{ url: "https://x" }], "first write wins; sources kept");
    });

    test("a retried save is harmless", async () => {
      const msgs = [user("hello"), bot("hi")];
      await save(repo, "u1", "chat-retry", msgs);
      const again = await save(repo, "u1", "chat-retry", msgs);
      assert.equal(again.messageCount, 2);
      assert.equal((await repo.get("u1", "chat-retry")).messages.length, 2);
    });

    test("tail-only append with from, and a gap is refused", async () => {
      await save(repo, "u1", "chat-tail", [user("one"), bot("two")]);
      assert.equal((await save(repo, "u1", "chat-tail", [user("three")], 2)).messageCount, 3);
      await assert.rejects(save(repo, "u1", "chat-tail", [user("five")], 4), (e) => e instanceof ChatGapError && e.messageCount === 3);
    });

    test("users cannot see each other's chats, even with the same id", async () => {
      await save(repo, "alice", "shared-id", [user("alice's secret")]);
      await save(repo, "bob", "shared-id", [user("bob's question")]);
      assert.equal((await repo.get("alice", "shared-id")).messages[0].content, "alice's secret");
      assert.equal((await repo.get("bob", "shared-id")).messages[0].content, "bob's question");
      assert.equal(await repo.get("mallory", "shared-id"), null);
      assert.equal(await repo.update("mallory", "shared-id", { title: "pwned" }), false);
      assert.equal(await repo.remove("mallory", "shared-id"), false);
      assert.equal((await repo.list("mallory")).chats.length, 0);
    });

    test("lists newest first, paginates, and searches", async () => {
      for (const id of ["list-0001", "list-0002", "list-0003"]) {
        await save(repo, "lister", id, [user(`question about ${id === "list-0002" ? "Tesla" : "bonds"}`)]);
      }
      const page1 = await repo.list("lister", { limit: 2 });
      assert.deepEqual(page1.chats.map((c) => c.id), ["list-0003", "list-0002"]);
      assert.ok(page1.cursor);
      const page2 = await repo.list("lister", { limit: 2, cursor: page1.cursor });
      assert.deepEqual(page2.chats.map((c) => c.id), ["list-0001"]);
      assert.equal(page2.cursor, null);

      assert.deepEqual((await repo.list("lister", { q: "tesla" })).chats.map((c) => c.id), ["list-0002"]);
      assert.equal((await repo.list("lister", { q: "crypto" })).chats.length, 0);

      // Appending moves a chat to the top.
      await save(repo, "lister", "list-0001", [user("question about bonds"), bot("ok")]);
      assert.equal((await repo.list("lister")).chats[0].id, "list-0001");
    });

    test("rename, pin and delete", async () => {
      await save(repo, "u2", "chat-edit", [user("draft")]);
      assert.equal(await repo.update("u2", "chat-edit", { title: "Renamed", pinned: true }), true);
      const chat = await repo.get("u2", "chat-edit");
      assert.equal(chat.title, "Renamed");
      assert.equal(chat.pinned, true);
      assert.equal(await repo.remove("u2", "chat-edit"), true);
      assert.equal(await repo.get("u2", "chat-edit"), null);
      assert.equal(await repo.remove("u2", "chat-edit"), false);
    });
  });
}

describe("chat input validation", () => {
  test("rejects bad roles, oversize text and non-arrays", () => {
    assert.throws(() => parseAppend({ messages: [{ role: "system", content: "x" }] }), ChatInputError);
    assert.throws(() => parseAppend({ messages: [user("x".repeat(MAX_MESSAGE_CHARS + 1))] }), ChatInputError);
    assert.throws(() => parseAppend({ messages: "nope" }), ChatInputError);
    assert.throws(() => parseAppend({ messages: [user("x")], from: -1 }), ChatInputError);
  });

  test("keeps only known fields", () => {
    const { messages } = parseAppend({ messages: [{ ...bot("hi", { model: "Luna" }), error: true, __proto__: { evil: 1 } }] });
    assert.deepEqual(messages, [{ role: "assistant", content: "hi", model: "Luna" }]);
  });

  test("import skips malformed chats instead of failing", () => {
    const { chats, skipped } = parseImport({
      chats: [
        { id: "1700000000000", title: "ok", messages: [user("hi")] },
        { id: "../etc", messages: [user("bad id")] },
        { id: "1700000000001", messages: [] },
      ],
    });
    assert.deepEqual(chats.map((c) => c.id), ["1700000000000"]);
    assert.equal(skipped, 2);
  });
});
