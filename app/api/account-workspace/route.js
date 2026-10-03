import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readAccountWorkspace } from "@/lib/accountWorkspace.mjs";
import { checkRateLimit, SIGNED_IN_LIMIT } from "@/lib/rateLimit";

export async function POST(request) {
  const userId = (await auth())?.user?.id;
  if (!userId) return Response.json({ error: "Sign in to read your account data." }, { status: 401 });
  if (!(await checkRateLimit(`workspace:${userId}`, SIGNED_IN_LIMIT)).ok) return Response.json({ error: "Too many requests." }, { status: 429 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  if (typeof body?.query !== "string" || body.query.length > 8000) return Response.json({ error: "Enter a query under 8001 characters." }, { status: 400 });
  return Response.json(await readAccountWorkspace(prisma, userId, body.query), { headers: { "Cache-Control": "private, no-store" } });
}
