import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { advisorItemHandlers } from "@/lib/advisorItems.mjs";
import { checkRateLimit, SIGNED_IN_LIMIT } from "@/lib/rateLimit";

export const { GET, POST, PUT, DELETE } = advisorItemHandlers({ auth, prisma,
  rateLimit: async userId => (await checkRateLimit(`advisor-items:${userId}`, SIGNED_IN_LIMIT)).ok,
});
