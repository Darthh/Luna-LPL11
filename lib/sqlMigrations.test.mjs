// `node --test lib/sqlMigrations.test.mjs` - migrations rewritten for Aurora DSQL.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { splitStatements, adaptStatement, planMigration } from "./sqlMigrations.mjs";

test("splits on statement semicolons only", () => {
  const sql = `-- a comment; not a statement
CREATE TABLE "a" ("v" TEXT DEFAULT 'x;y');
/* block; comment */ INSERT INTO "a" VALUES ('it''s; fine');
CREATE TABLE "b;c" ("v" TEXT)`;
  assert.deepEqual(splitStatements(sql), [
    `CREATE TABLE "a" ("v" TEXT DEFAULT 'x;y')`,
    `INSERT INTO "a" VALUES ('it''s; fine')`,
    `CREATE TABLE "b;c" ("v" TEXT)`,
  ]);
});

test("adapts statements for DSQL", () => {
  assert.equal(adaptStatement('CREATE SCHEMA IF NOT EXISTS "public"'), null);
  assert.equal(adaptStatement('ALTER TABLE "S" ADD CONSTRAINT "S_u_fkey" FOREIGN KEY ("u") REFERENCES "User"("id") ON DELETE CASCADE'), null);
  assert.equal(adaptStatement('CREATE UNIQUE INDEX "k" ON "User"("email")'), 'CREATE UNIQUE INDEX ASYNC "k" ON "User"("email")');
  assert.equal(adaptStatement('CREATE INDEX IF NOT EXISTS "i" ON "A"("u")'), 'CREATE INDEX ASYNC "i" ON "A"("u")');
  assert.equal(adaptStatement('CREATE INDEX "i" ON "A"("u")', "postgres"), 'CREATE INDEX "i" ON "A"("u")');
  assert.equal(adaptStatement('CREATE TABLE "A" ("id" TEXT)'), 'CREATE TABLE "A" ("id" TEXT)');
});

test("the real migrations contain nothing DSQL rejects", () => {
  const files = readdirSync("migrations").filter((f) => f.endsWith(".sql")).sort();
  const steps = files.flatMap((f) => planMigration(f, readFileSync(`migrations/${f}`, "utf8")));
  assert.ok(steps.length > 20);
  for (const { id, sql } of steps) {
    assert.doesNotMatch(sql, /FOREIGN KEY|REFERENCES|CREATE SCHEMA|SERIAL|SEQUENCE|JSONB?\b|TRIGGER/i, id);
    if (/^CREATE (UNIQUE )?INDEX/i.test(sql)) assert.match(sql, /INDEX ASYNC /, id);
  }
  assert.equal(new Set(steps.map((s) => s.id)).size, steps.length, "ledger ids are unique");
});
