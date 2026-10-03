import test from "node:test";
import assert from "node:assert/strict";
import { researchIdentity, sessionId } from "./agentIdentity.mjs";
import { objectKey, documentChunks, archiveSql, sqlValue } from "./agentResearch.mjs";

process.env.AUTH_SECRET = "test-only-secret-never-used-in-production";
test("guest identity is signed, stable, and rejects tampered cookies", () => {
  const request = cookie => new Request("https://example.com/api/ai-documents", { headers: cookie ? { cookie } : {} });
  const first = researchIdentity(request());
  assert.match(first.cookie, /HttpOnly; SameSite=Strict/);
  assert.match(first.cookie, /Secure/);
  const cookie = first.cookie.split(";")[0];
  assert.equal(researchIdentity(request(cookie)).owner, first.owner);
  assert.notEqual(researchIdentity(request(cookie.slice(0, -1) + "z")).owner, first.owner);
  assert.notEqual(researchIdentity(request(cookie), "account-1").owner, first.owner);
  assert.notEqual(sessionId(first.owner, "chat-1"), sessionId(first.owner, "chat-2"));
});
test("storage keys prevent cross-user and path injection", () => {
  const owner = "a".repeat(64), id = "11111111-1111-1111-1111-111111111111";
  assert.equal(objectKey(owner, id), `private/${owner}/${id}/job.json`);
  assert.throws(() => objectKey("../victim", id));
  assert.throws(() => objectKey(owner, "../../victim"));
});
test("document chunking preserves coverage with overlap and limits output", () => {
  const input = "abcdefghij".repeat(600);
  const parts = documentChunks(input);
  assert.equal(parts[0].slice(2400), parts[1].slice(0, 400));
  assert.equal(parts[2], input.slice(4800));
  assert.throws(() => documentChunks(" "));
  assert.throws(() => documentChunks("x".repeat(180001)));
});
test("history SQL scopes every write to owner and escapes source content", () => {
  assert.equal(sqlValue("O'Reilly"), "'O''Reilly'");
  const sql = archiveSql({ id: "11111111-1111-1111-1111-111111111111", owner: "b".repeat(64), kind: "report", title: "test'; DROP TABLE artifacts;--", createdAt: "2026-10-02", summary: "evidence" });
  assert.match(sql, /t\.owner=s\.owner/);
  assert.match(sql, /test''; DROP TABLE/);
});
