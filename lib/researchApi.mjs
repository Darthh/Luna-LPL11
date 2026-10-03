import { auth } from "@/auth";
import { researchIdentity, sameOrigin } from "./agentIdentity.mjs";
import { researchConfigured } from "./agentResearch.mjs";
import { checkRateLimit } from "./rateLimit.js";

export async function researchAccess(request, mutation = false) {
  if (!researchConfigured()) return { error: Response.json({ error: "AWS research services have not been deployed yet." }, { status: 503 }) };
  if (mutation && !sameOrigin(request)) return { error: Response.json({ error: "Cross-origin requests are not permitted." }, { status: 403 }) };
  const session = await auth();
  const identity = researchIdentity(request, session?.user?.id);
  if (mutation) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rate = await checkRateLimit(`research:${session?.user?.id || ip}`, session?.user?.id ? 20 : 5);
    if (!rate.ok) return { error: Response.json({ error: "Research job limit reached. Try again later." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }) };
  }
  return identity;
}
export function researchResponse(access, body, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...(access.cookie ? { "Set-Cookie": access.cookie } : {}) } });
}
