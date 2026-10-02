import { auth } from "@/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { ExaNotConfiguredError, searchExa } from "@/lib/exaResearch";

export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (typeof body?.query !== "string" || !body.query.trim() || body.query.length > 8000) {
    return Response.json({ error: "Enter a research question of up to 8,000 characters." }, { status: 400 });
  }
  const session = await auth();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rate = checkRateLimit(`exa:chat:${session?.user?.id ?? `ip:${ip}`}`, session?.user?.id ? 60 : 15);
  if (!rate.ok) return Response.json({ error: "Web search limit reached. Try again shortly." }, {
    status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) },
  });
  try {
    const sources = await searchExa({ query: body.query.trim(), numResults: 6 });
    if (!sources.length) return Response.json({ error: "No web sources found. Try a more specific question or turn off Web search." }, { status: 404 });
    return Response.json({ sources, retrievedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof ExaNotConfiguredError
      ? "Web search is not configured. Add EXA_API_KEY to the deployment to enable research."
      : "Web search is temporarily unavailable. Retry or turn off Web search." }, { status: 503 });
  }
}
