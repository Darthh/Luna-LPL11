import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { crmHandlers } from "@/lib/financeCrmApi.mjs";

export const { GET, POST, PUT, DELETE } = crmHandlers({ auth, prisma });
