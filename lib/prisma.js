import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";

let cached = null;

// Aurora DSQL has no password: every new connection presents a short-lived
// IAM token, so `password` is a function node-postgres calls per connection
// (a token only has to be valid at connect time). DSQL closes connections
// after an hour, so the pool retires them a little before that. Lambda serves
// one request at a time per instance, so a couple of connections is plenty.
//
// DSQL_ENDPOINT is set by sst.config.ts; local dev and anything else keep
// using a plain DATABASE_URL.
async function poolConfig() {
  const host = process.env.DSQL_ENDPOINT;
  if (!host) {
    if (!process.env.DATABASE_URL) throw new Error("Set DSQL_ENDPOINT or DATABASE_URL.");
    return { connectionString: process.env.DATABASE_URL };
  }
  const { DsqlSigner } = await import("@aws-sdk/dsql-signer");
  const signer = new DsqlSigner({ hostname: host, region: process.env.DSQL_REGION || process.env.AWS_REGION });
  return {
    host,
    port: 5432,
    user: "admin",
    database: "postgres",
    ssl: { rejectUnauthorized: true },
    password: () => signer.getDbConnectAdminAuthToken(),
    max: 2,
    maxLifetimeSeconds: 50 * 60,
  };
}

// The promise is what's cached, so concurrent first callers share one client.
export function getPrisma() {
  cached ??= poolConfig().then((config) => new PrismaClient({ adapter: new PrismaPg(config) }));
  cached.catch(() => (cached = null));
  return cached;
}

export const prisma = new Proxy(
  {},
  {
    get(_target, prop) {
      return new Proxy(
        {},
        {
          get(_t, method) {
            return async (...args) => {
              const client = await getPrisma();
              return client[prop][method](...args);
            };
          },
        }
      );
    },
  }
);
