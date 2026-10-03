// Turning migrations/*.sql into statements Aurora DSQL accepts. Pure
// functions, so the rewrite is tested without a cluster; the runner that
// connects and applies them is scripts/dsql-migrate.mjs.
//
// What DSQL needs that `prisma migrate diff` doesn't produce:
// - One DDL statement per transaction, so each statement is sent on its own.
// - No foreign keys. Those ALTER TABLEs are dropped; integrity and cascades
//   are Prisma's job instead (`relationMode = "prisma"` in the schema).
// - No CREATE SCHEMA - `public` already exists.
// - Indexes are built asynchronously: CREATE [UNIQUE] INDEX ASYNC.
//
// The "postgres" target applies the same statements minus the ASYNC rewrite,
// which is how this runs against a local database (and in tests).

// Split on semicolons that end a statement - not ones inside quotes or
// comments. Comment-only fragments are dropped.
export function splitStatements(sql) {
  const statements = [];
  let current = "";
  let quote = null; // ' or "
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (!quote && ch === "-" && next === "-") {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? sql.length : end;
      current += "\n";
      continue;
    }
    if (!quote && ch === "/" && next === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 1;
      continue;
    }
    if (quote) {
      if (ch === quote) {
        if (next === quote) {
          current += ch + next;
          i++;
          continue;
        }
        quote = null;
      }
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (ch === ";") {
      if (current.trim()) statements.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

const FOREIGN_KEY = /^ALTER\s+TABLE\s+\S+\s+ADD\s+CONSTRAINT\s+\S+\s+FOREIGN\s+KEY\b/i;
const CREATE_SCHEMA = /^CREATE\s+SCHEMA\b/i;
const CREATE_INDEX = /^CREATE\s+(UNIQUE\s+)?INDEX\s+(IF\s+NOT\s+EXISTS\s+)?/i;

// Returns the statement to run, or null to skip it.
export function adaptStatement(statement, target = "dsql") {
  if (FOREIGN_KEY.test(statement) || CREATE_SCHEMA.test(statement)) return null;
  if (target === "dsql" && CREATE_INDEX.test(statement)) {
    // The migration ledger already makes each statement run once, so
    // IF NOT EXISTS is dropped rather than combined with ASYNC.
    return statement.replace(CREATE_INDEX, (_, unique = "") => `CREATE ${unique.toUpperCase()}INDEX ASYNC `);
  }
  return statement;
}

// [{ id, sql }] for one migration file, in order. The id ("0001_init.sql#3")
// is what the ledger records, so a run that stopped part-way resumes at the
// first statement that didn't land.
export function planMigration(name, sql, target = "dsql") {
  return splitStatements(sql)
    .map((statement, index) => ({ id: `${name}#${index}`, sql: adaptStatement(statement, target) }))
    .filter((step) => step.sql);
}
