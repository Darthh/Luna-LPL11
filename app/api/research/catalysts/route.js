import { auth } from "@/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import {
  NewsNotConfiguredError,
  mergeResearchResults,
  researchPayload,
  searchCompanyNews,
} from "@/lib/newsResearch";
import { rankNews } from "@/lib/research";

const ANON_RESEARCH_LIMIT = 12;
const USER_RESEARCH_LIMIT = 80;

function validDay(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? "") && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

function shiftDay(value, amount) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString();
}

// Finnhub hands back every article as an opaque finnhub.io/api/news?id=
// redirect. Following it gives the publisher's own URL, which is what the card
// should link to and label. It has to be a GET: Finnhub answers HEAD with a
// 302 back to its own homepage, so only a GET reaches the article. The
// response body is never read, and a publisher that blocks bots still answers
// with a redirect chain first - the final URL is all this needs, so a 403 is
// as good as a 200. Anything that fails keeps the wrapper, which still works.
async function resolveArticleUrl(source) {
  if (!/(^|\.)finnhub\.io$/.test(source.domain)) return source;
  try {
    const response = await fetch(source.url, {
      redirect: "follow",
      // The three resolve in parallel, so this is the wait for the slowest of
      // them rather than a per-article cost.
      signal: AbortSignal.timeout(9000),
      next: { revalidate: 86400 },
    });
    const finalUrl = response.url;
    if (!finalUrl || /(^|\.)finnhub\.io$/.test(new URL(finalUrl).hostname)) return source;
    const domain = new URL(finalUrl).hostname.replace(/^www\./, "");
    return { ...source, url: finalUrl, domain, publisher: source.publisher || domain };
  } catch {
    return source;
  }
}

export async function GET(request) {
  const symbol = request.nextUrl.searchParams.get("symbol")?.trim().toUpperCase();
  const name = request.nextUrl.searchParams.get("name")?.trim().slice(0, 100) || symbol;
  const date = request.nextUrl.searchParams.get("date")?.trim();
  const move = Number(request.nextUrl.searchParams.get("move"));
  if (!symbol?.match(/^[A-Z0-9.^=-]{1,16}$/) || !validDay(date) || !Number.isFinite(move) || Math.abs(move) > 500) {
    return Response.json({ error: "Bad symbol, date, or move" }, { status: 400 });
  }
  if (!process.env.FINNHUB_API_KEY) {
    return Response.json({ configured: false, error: "Add FINNHUB_API_KEY to enable recent stock news." });
  }

  const session = await auth();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const identity = session?.user?.id ?? `ip:${ip}`;
  const rate = checkRateLimit(`news:catalyst:${identity}`, session?.user?.id ? USER_RESEARCH_LIMIT : ANON_RESEARCH_LIMIT);
  if (!rate.ok) {
    return Response.json(
      { error: "Research limit reached. Try again after the hourly window resets." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  const direction = move >= 0 ? "rose" : "fell";
  const dates = { from: shiftDay(date, -3).slice(0, 10), to: shiftDay(date, 4).slice(0, 10) };

  try {
    const news = await searchCompanyNews({ symbol, ...dates });
    const sources = rankNews(mergeResearchResults(news), {
      targetDate: date,
      optionalTerms: [name, symbol, "earnings", "guidance", "analyst", "product", "regulation"],
    })
      .filter((source) => source.domain !== "sec.gov" && !source.domain.endsWith(".sec.gov"))
      // Yahoo Finance republishes other outlets' reporting behind its own
      // wall, so it is dropped in favour of whoever actually reported it.
      // Finnhub names the publisher in `source` (carried here as publisher
      // and author); the URL can't be used for this, because every Finnhub
      // article is an opaque finnhub.io/api/news?id= redirect.
      .filter((source) => {
        const publisher = `${source.publisher ?? ""} ${source.author ?? ""}`.toLowerCase();
        return !publisher.includes("yahoo") && !/(^|\.)yahoo\.com$/.test(source.domain);
      })
      .slice(0, 3);

    // ...and those redirects are followed here, so a card links to the article
    // itself rather than bouncing the reader through Finnhub. Only the three
    // that survived the cut are resolved, and a failure keeps the wrapper -
    // a working redirect beats a dead card.
    const resolved = (await Promise.all(sources.map(resolveArticleUrl))).filter(
      // A redirect can still land on Yahoo where the publisher name didn't say
      // so, so the rule is applied again to where the link actually goes.
      (source) => !/(^|\.)yahoo\.com$/.test(source.domain)
    );
    return Response.json(
      researchPayload(resolved, {
        configured: true,
        symbol,
        move: { date, pct: move, direction },
        caveat: "These sources were published near the move. Their timing supports context, not proof of causation.",
      }),
      { headers: { "Cache-Control": "private, max-age=300" } }
    );
  } catch (error) {
    if (error instanceof NewsNotConfiguredError) {
      return Response.json({ configured: false, error: "Add FINNHUB_API_KEY to enable recent stock news." });
    }
    return Response.json({ error: error.message || "Catalyst research unavailable" }, { status: 502 });
  }
}
