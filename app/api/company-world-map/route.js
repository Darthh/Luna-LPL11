import { COMPANY_WORLD_DETAILS } from "@/lib/companyWorldDetails";

const DETAILS_BY_NAME = new Map(COMPANY_WORLD_DETAILS.map((company) => [company.n, company]));

export async function GET(request) {
  const name = request.nextUrl.searchParams.get("name")?.trim();
  if (!name || name.length > 160) {
    return Response.json({ error: "Enter a company name" }, { status: 400 });
  }

  const company = DETAILS_BY_NAME.get(name);
  if (!company) {
    return Response.json({ error: "Company details unavailable" }, { status: 404 });
  }

  return Response.json(company, {
    headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" },
  });
}
