import { defineConfig } from "prisma/config";

// Aurora DSQL is reached with a short-lived IAM token that has to be minted per
// connection, so the app never has a static DATABASE_URL and the Prisma CLI
// cannot connect to the real cluster either.
//
// So the CLI is only ever used to *generate* SQL, never to apply it:
//   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
// The URL below is a throwaway local file that exists purely so `migrate diff`
// knows the dialect and has a shadow database to diff against.
//
// Applying is done by scripts/dsql-migrate.mjs, which signs its own token and
// sends each statement in its own transaction - DSQL allows one DDL statement
// per transaction, which `prisma migrate deploy` does not honour.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL || "postgres://shadow:shadow@localhost:5432/shadow",
  },
});
