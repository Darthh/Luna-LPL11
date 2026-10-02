import { fetchFearGreed } from "@/lib/fearGreed";

export const revalidate = 3600;

export async function GET() {
  const data = await fetchFearGreed();
  if (!data) {
    return Response.json({ error: "fear-greed upstream unavailable" }, { status: 502 });
  }
  // Open data: anyone may read this endpoint from anywhere. Published
  // deliberately - a free machine-readable copy of the series is the whole
  // reason other projects link back here.
  return Response.json(data, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
