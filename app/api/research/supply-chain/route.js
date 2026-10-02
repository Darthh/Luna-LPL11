import { auth } from "@/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import {
  ExaNotConfiguredError,
  mergeResearchResults,
  researchPayload,
  searchExa,
} from "@/lib/exaResearch";

const ANON_RESEARCH_LIMIT = 10;
const USER_RESEARCH_LIMIT = 60;

function clean(value, limit) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

export async function GET(request) {
  const from = clean(request.nextUrl.searchParams.get("from"), 20).toUpperCase();
  const to = clean(request.nextUrl.searchParams.get("to"), 20).toUpperCase();
  const fromName = clean(request.nextUrl.searchParams.get("fromName"), 100) || from;
  const toName = clean(request.nextUrl.searchParams.get("toName"), 100) || to;
  const note = clean(request.nextUrl.searchParams.get("note"), 240);
  const requestedType = clean(request.nextUrl.searchParams.get("type"), 20).toLowerCase();
  const relationshipType = ["supplier", "customer", "partner", "competitor"].includes(requestedType)
    ? requestedType
    : "supplier";
  const redirectToSource = request.nextUrl.searchParams.get("redirect") === "1";
  if (!from || !to || from === to || !from.match(/^[A-Z0-9.^=-]{1,20}$/) || !to.match(/^[A-Z0-9.^=-]{1,20}$/)) {
    return Response.json({ error: "Bad relationship" }, { status: 400 });
  }
  if (!process.env.EXA_API_KEY) {
    return Response.json({ configured: false, error: "Add EXA_API_KEY to enable relationship evidence." });
  }

  const session = await auth();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const identity = session?.user?.id ?? `ip:${ip}`;
  const rate = checkRateLimit(`exa:supply:${identity}`, session?.user?.id ? USER_RESEARCH_LIMIT : ANON_RESEARCH_LIMIT);
  if (!rate.ok) {
    return Response.json(
      { error: "Evidence lookup limit reached. Try again after the hourly window resets." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  const relationshipVerb = relationshipType === "competitor"
    ? "competes with"
    : relationshipType === "partner"
      ? "has a documented business or technology partnership with"
      : "supplies";
  const claim = `${fromName} (${from}) ${relationshipVerb} ${toName} (${to})${note ? `: ${note}` : ""}`;
  const summaryQuery = `Does this source explicitly support the relationship “${claim}”? Summarize the exact products, services, contract, or dependency stated. Do not infer an unstated relationship.`;

  try {
    const searches = await Promise.allSettled([
      searchExa({
        query: `Financial filing or investor document that explicitly supports this company relationship: ${claim}`,
        category: "financial report",
        numResults: 7,
        summaryQuery,
      }),
      searchExa({
        query: `Official company announcement, investor relations page, contract award, or reputable reporting explicitly documenting: ${claim}`,
        numResults: 7,
        summaryQuery,
      }),
    ]);
    const completed = searches.filter((result) => result.status === "fulfilled").map((result) => result.value);
    if (!completed.length) throw searches[0].reason;
    const sources = mergeResearchResults(...completed)
      .filter((source) => source.domain !== "sec.gov" && !source.domain.endsWith(".sec.gov"))
      .slice(0, 6);
    if (redirectToSource) {
      if (sources[0]?.url) return Response.redirect(sources[0].url, 307);
      return Response.json({ error: "No supporting source was found for this relationship." }, { status: 404 });
    }
    return Response.json(
      researchPayload(sources, {
        configured: true,
        relationship: { from, to, fromName, toName, note, type: relationshipType },
        caveat: "Sources are ranked as research evidence. Open the original document before relying on the relationship.",
      }),
      { headers: { "Cache-Control": "private, max-age=300" } }
    );
  } catch (error) {
    if (error instanceof ExaNotConfiguredError) {
      return Response.json({ configured: false, error: "Add EXA_API_KEY to enable relationship evidence." });
    }
    return Response.json({ error: error.message || "Relationship evidence unavailable" }, { status: 502 });
  }
}
