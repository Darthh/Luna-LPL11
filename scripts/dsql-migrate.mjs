// Apply migrations/*.sql to Aurora DSQL (or a plain Postgres): `npm run db:migrate:dsql`.
//
// DSQL allows one DDL statement per transaction and has no password - a short
// IAM token is the password - so `prisma migrate deploy` can't do this. Each
// statement runs on its own (autocommit) and is recorded in a ledger table,
// so re-running is safe and a failed run picks up where it stopped.
//
//   DSQL_ENDPOINT=<cluster>.dsql.us-east-1.on.aws npm run db:migrate:dsql
//       uses your AWS credentials (SSO/profile/env) to sign an admin token.
//       The endpoint is printed by `sst deploy` as `dsql` (LUNA_DATA=true).
//   DATABASE_URL=postgres://... npm run db:migrate:dsql
//       applies the same statements to Postgres, minus CREATE INDEX ASYNC.
//   --dry-run   print what would run, connect to nothing.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { planMigration } from "../lib/sqlMigrations.mjs";

const DIR = "migrations";
const dryRun = process.argv.includes("--dry-run");
const endpoint = process.env.DSQL_ENDPOINT;
const target = endpoint ? "dsql" : "postgres";

const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
const steps = files.flatMap((name) => planMigration(name, readFileSync(join(DIR, name), "utf8"), target));

if (dryRun) {
  for (const step of steps) console.log(`-- ${step.id}\n${step.sql};\n`);
  console.log(`${steps.length} statements for ${target}`);
  process.exit(0);
}

async function connect() {
  if (!endpoint) {
    if (!process.env.DATABASE_URL) throw new Error("Set DSQL_ENDPOINT (AWS) or DATABASE_URL (Postgres).");
    return new pg.Client({ connectionString: process.env.DATABASE_URL });
  }
  const { DsqlSigner } = await import("@aws-sdk/dsql-signer");
  const region = process.env.DSQL_REGION || process.env.AWS_REGION || endpoint.split(".")[2];
  const signer = new DsqlSigner({ hostname: endpoint, region });
  return new pg.Client({
    host: endpoint,
    port: 5432,
    user: "admin",
    database: "postgres",
    ssl: { rejectUnauthorized: true },
    password: await signer.getDbConnectAdminAuthToken(),
  });
}

const client = await connect();
await client.connect();
try {
  await client.query(
    'CREATE TABLE IF NOT EXISTS "_luna_migrations" ("id" TEXT PRIMARY KEY, "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)'
  );
  const done = new Set((await client.query('SELECT "id" FROM "_luna_migrations"')).rows.map((r) => r.id));
  let applied = 0;
  for (const step of steps) {
    if (done.has(step.id)) continue;
    try {
      await client.query(step.sql);
    } catch (error) {
      console.error(`failed at ${step.id}:\n${step.sql}\n`);
      throw error;
    }
    // Its own statement, not the DDL's transaction: DSQL won't mix them.
    await client.query('INSERT INTO "_luna_migrations" ("id") VALUES ($1)', [step.id]);
    applied += 1;
    console.log(`applied ${step.id}`);
  }
  console.log(applied ? `${applied} statements applied (${target})` : `already up to date (${target})`);
} finally {
  await client.end();
}
