import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";

let cached = null;

export async function getPrisma() {
  if (cached) return cached;
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

  cached = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
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
