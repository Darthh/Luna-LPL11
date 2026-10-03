// One news story per upcoming economic release, for the Upcoming Events card.
//
// The events themselves are a fixed calendar (lib/economicEvents.js); this only
// finds reporting that previews each one. Exa charges per call and the calendar
// moves once a day at most, so the whole card is answered by a single search
// per event kind, cached hard, rather than a request per row.
import { ExaNotConfiguredError, searchExa } from "@/lib/exaResearch";
import { checkRateLimit } from "@/lib/rateLimit";
import { auth } from "@/auth";

const ANON_LIMIT = 30;
const USER_LIMIT = 120;

// The card shows at most six rows, and several share a kind (two FOMC days,
// repeated CPI/employment months). Searching per kind rather than per row keeps
// this to a handful of upstream calls whatever the calendar looks like.
const MAX_KINDS = 6;

function isValidKind(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 120;
}

export async function GET(request) {
  const kinds = (request.nextUrl.searchParams.get("kinds") ?? "")
    .split("|")
    .map((k) => k.trim())
    .filter(isValidKind)
    .slice(0, MAX_KINDS);
  if (!kinds.length) return Response.json({ error: "No event kinds given" }, { status: 400 });

  if (!process.env.EXA_API_KEY) {
    return Response.json({ configured: false, articles: {} });
  }

  const session = await auth();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const identity = session?.user?.id ?? `ip:${ip}`;
  const rate = await checkRateLimit(`exa:eventnews:${identity}`, session?.user?.id ? USER_LIMIT : ANON_LIMIT);
  if (!rate.ok) {
    return Response.json(
      { error: "Research limit reached. Try again after the hourly window resets." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  try {
    const articles = {};
    const results = await Promise.all(
      kinds.map(async (kind) => {
        const query = `Recent news article previewing the upcoming US ${kind}: what economists expect and why it matters for markets`;
        const found = await searchExa({
          query,
          category: "news",
          numResults: 6,
          summaryQuery: `What does this article say to expect from the upcoming ${kind}?`,
        });
        // A picture is the point of the row, so a story that has one wins over
        // a marginally more relevant story that does not.
        const best =
          found.find((a) => a.image) ??
          found[0] ??
          null;
        return [kind, best];
      })
    );
    for (const [kind, article] of results) {
      if (article) articles[kind] = article;
    }
    return Response.json(
      { configured: true, articles },
      // The calendar is static and the stories move slowly; a long cache keeps
      // this off Exa's meter for repeat visitors.
      { headers: { "Cache-Control": "public, max-age=1800, stale-while-revalidate=3600" } }
    );
  } catch (error) {
    if (error instanceof ExaNotConfiguredError) {
      return Response.json({ configured: false, articles: {} });
    }
    return Response.json({ error: error.message || "Event news unavailable" }, { status: 502 });
  }
}
