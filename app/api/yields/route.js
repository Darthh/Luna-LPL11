import { ALL_SERIES, fetchSeries } from "@/lib/yields";

// Yield history for the series the Global Yields board asks for. One request
// per series upstream, but they are fetched together and cached for six hours,
// so ticking a row on is a cache hit for everyone after the first reader.
const WINDOW_DAYS = { "1y": 366, "3y": 1096, "5y": 1827, "10y": 3653, max: null };

export async function GET(request) {
  const params = request.nextUrl.searchParams;
  const range = params.get("range") ?? "3y";
  if (!(range in WINDOW_DAYS)) return Response.json({ error: "Bad range" }, { status: 400 });

  const asked = (params.get("keys") ?? "").split(",").filter(Boolean);
  const wanted = ALL_SERIES.filter((s) => asked.includes(s.key));
  if (!wanted.length) return Response.json({ series: [] });

  const days = WINDOW_DAYS[range];
  const cutoff = days
    ? new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    : null;

  // A series that fails is dropped rather than failing the request: one dead
  // country should not blank a chart of twelve.
  const settled = await Promise.allSettled(wanted.map((s) => fetchSeries(s.series)));
  const series = wanted
    .map((s, i) => {
      if (settled[i].status !== "fulfilled") return null;
      const points = settled[i].value.filter((p) => !cutoff || p.date >= cutoff);
      if (points.length < 2) return null;
      const last = points[points.length - 1];
      return {
        key: s.key,
        label: s.label,
        group: s.group,
        tenor: s.tenor,
        country: s.country ?? "United States",
        // The date the latest reading is actually as of. The global series run
        // about three months behind, and a page that prints them beside a
        // same-day US number without saying so is lying by omission.
        asOf: last.date,
        last: last.value,
        points,
      };
    })
    .filter(Boolean);

  return Response.json(
    { range, series },
    { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } }
  );
}
