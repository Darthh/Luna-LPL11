import { parseFearGreedResponse, parseIndicators } from "@/lib/fearGreedParser";
import { BROWSER_USER_AGENT } from "@/lib/userAgent";

// The upstream endpoint defaults to ~1 year of history. Appending a start date
// as a path segment makes it return everything since then - but only back to
// roughly mid-July 2020, which is as far as the publisher's series goes. Ask
// for a day earlier than that and the endpoint answers 500 rather than
// clamping, so the floor is a real boundary and not a preference.
//
// Asking for the floor rather than a round five years is what makes the "All"
// zoom show everything that exists (about six years) instead of stopping short
// of it.
//
// Probed 2026-09: 2020-07-15 answers, 2020-07-13 does not. The floor has
// stayed put rather than rolling forward with the calendar, but it is asked
// for a fortnight later than the earliest known-good date so a small shift
// upstream degrades to a slightly shorter chart instead of a 500 and an empty
// page.
// ponytail: hardcoded floor, probed by scripts/check-fg-depth.mjs. If the
// publisher ever extends its history backwards this silently keeps clamping -
// re-probe and lower it, or discover the floor at runtime by walking back on a
// 500 if it starts moving.
const EARLIEST_UPSTREAM_DATE = "2020-08-01";

function startDateIso() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 10);
  const wanted = d.toISOString().slice(0, 10);
  return wanted < EARLIEST_UPSTREAM_DATE ? EARLIEST_UPSTREAM_DATE : wanted;
}

// The one place the upstream publisher is still named: this is the address the
// data actually comes from, and the Referer and Origin headers are what the
// endpoint checks before it answers. They are wire values, not wording - the
// site says nothing about them, and changing them stops the index loading.
const UPSTREAM_HOST = "https://production.dataviz.cnn.io";
const UPSTREAM_PAGE = "https://www.cnn.com/markets/fear-and-greed";

// Server-side loader shared by /api/fear-greed and every server-rendered page.
// Pages need the numbers in their initial HTML (crawlers and AI fetchers only
// see what is there before JS runs), and calling this directly avoids a page
// having to HTTP-fetch its own API route.
// Returns { dates, values, asOf, indicators } or null when upstream fails.
export async function fetchFearGreed() {
  let res;
  try {
    res = await fetch(`${UPSTREAM_HOST}/index/fearandgreed/graphdata/${startDateIso()}`, {
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Accept: "application/json, text/plain, */*",
        Referer: UPSTREAM_PAGE,
        Origin: new URL(UPSTREAM_PAGE).origin,
      },
      next: { revalidate: 3600 },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const json = await res.json();
  const { dates, values, asOf } = parseFearGreedResponse(json);
  if (!dates.length) return null;

  return { dates, values, asOf, indicators: parseIndicators(json) };
}
