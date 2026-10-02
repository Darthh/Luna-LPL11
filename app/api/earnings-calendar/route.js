import {
  dateIso,
  fetchNasdaqEarnings,
  monthGridDays,
  parseMondayIso,
  parseMonthIso,
  weekdaysOfWeek,
} from "@/lib/earningsCalendar";

// One weekday per fetch either way - the month view just asks for ~23 of them
// instead of 5. Nasdaq answers per-date only, so the fan-out is the feed's
// shape, not a choice; each day is cached for an hour by fetchNasdaqEarnings.
export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const monthParam = params.get("month");

  let days;
  let scope;
  if (monthParam) {
    const month = parseMonthIso(monthParam);
    if (!month) return Response.json({ error: "Choose a valid month in YYYY-MM format." }, { status: 400 });
    days = monthGridDays(month);
    scope = { view: "month", month: monthParam };
  } else {
    const week = parseMondayIso(params.get("week"));
    if (!week) return Response.json({ error: "Choose a valid Monday in YYYY-MM-DD format." }, { status: 400 });
    days = weekdaysOfWeek(week);
    scope = { view: "week", week: dateIso(week) };
  }

  const settled = await Promise.allSettled(days.map((day) => fetchNasdaqEarnings(day)));
  const result = days.map((day, index) => ({
    date: day,
    companies: settled[index].status === "fulfilled" ? settled[index].value : [],
    unavailable: settled[index].status === "rejected",
  }));

  if (result.every((day) => day.unavailable)) {
    return Response.json({ error: "The earnings feed is temporarily unavailable." }, { status: 502 });
  }

  // Each Nasdaq day is already memoised for an hour upstream; this lets the
  // edge answer the whole week/month grid without re-fanning out per visitor.
  return Response.json(
    { ...scope, days: result, source: "Nasdaq earnings calendar" },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } }
  );
}
