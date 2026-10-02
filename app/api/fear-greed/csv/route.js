import { fetchFearGreed } from "@/lib/fearGreed";
import { zoneOf } from "@/lib/zone";

export const revalidate = 3600;

// Free CSV download of the full daily series. Deliberately open and
// unauthenticated: a machine-readable copy of this history is hard to find, so
// giving it away is what makes other projects link back here.
export async function GET() {
  const data = await fetchFearGreed();
  if (!data) return new Response("fear-greed upstream unavailable\n", { status: 502 });

  const rows = data.dates.map((d, i) => `${d},${data.values[i]},${zoneOf(data.values[i])}`);
  return new Response(`date,value,rating\n${rows.join("\n")}\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="fear-and-greed-index.csv"',
      "Access-Control-Allow-Origin": "*",
    },
  });
}
