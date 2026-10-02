import { NextResponse } from "next/server";

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const OPENVERSE_API = "https://api.openverse.org/v1/images/";
const BING_IMAGES = "https://www.bing.com/images/search";
const EXCLUDED_WORDS = /\b(icon|map|diagram|floor plan|poster|wordmark|trademark|screenshot|under construction|construction drawing|chief executive|ceo|secretary|press conference|meeting|speaks|visits?|delegation|department of|art|illustration|digital|3d|ai-generated|generated)\b/i;
const OPENVERSE_EXCLUDED_WORDS = /\b(desk|interior|conference|presentation|screenshot|rendering|floor plan|construction|demolition|event|booth|portrait|selfie|art|illustration|digital|3d|ai-generated|generated)\b/i;
const SEARCH_EXCLUDED_WORDS = /\b(concept|illustrative|rendering|video|footage|clip|mockup|interior|portrait|selfie|art|illustration|digital|3d|ai-generated|generated)\b/i;
const BUILDING_WORDS = /\b(headquarters|head office|hq|campus|building|office|tower|center|centre|facade|exterior|entrance|signage)\b/i;
const GENERIC_COMPANY_WORDS = new Set(["bank", "company", "corporation", "financial", "group", "holding", "holdings", "industries", "international", "systems", "technologies", "technology"]);
const SEARCH_OVERRIDES = {
  "apple": "Apple Park Cupertino",
  "alphabet (google)": "Googleplex Mountain View",
  "amazon": "Amazon Spheres Seattle",
  "microsoft": "Microsoft campus Redmond",
  "meta platforms (facebook)": "Meta headquarters Menlo Park",
};

function scoreImage(page, companyName, location, requireCompany) {
  const info = page.imageinfo?.[0];
  if (!info || !/^image\/(jpeg|png|webp)$/i.test(info.mime || "")) return -Infinity;
  if (EXCLUDED_WORDS.test(page.title)) return -Infinity;
  const width = Number(info.width) || 0;
  const height = Number(info.height) || 0;
  if (width < 900 || height < 450) return -Infinity;

  const title = page.title.toLowerCase();
  const companyTokens = companyName.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2);
  const companyMatches = companyTokens.filter((token) => title.includes(token)).length;
  const distinctiveTokens = companyTokens.filter((token) => !GENERIC_COMPANY_WORDS.has(token));
  const distinctiveMatches = distinctiveTokens.filter((token) => title.includes(token)).length;
  if (requireCompany && distinctiveMatches === 0) return -Infinity;
  const locationTokens = location.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2);
  const locationMatches = locationTokens.filter((token) => title.includes(token)).length;
  const landscape = width / Math.max(height, 1);
  const buildingScore = /\b(headquarters|hq)\b/i.test(title) ? 14
    : /\b(campus|park|spheres)\b/i.test(title) ? 9
      : /\b(building|office|tower|center|centre|facade|exterior|entrance|sign|signage)\b/i.test(title) ? 5 : 0;
  if (!buildingScore) return -Infinity;
  return distinctiveMatches * 14 + companyMatches * 4 + locationMatches * 10 + buildingScore + (landscape >= 1.25 ? 4 : 0) + Math.min(width / 1000, 4) - (landscape < .85 ? 5 : 0);
}

function companyTokens(companyName) {
  return companyName.toLowerCase().split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !GENERIC_COMPANY_WORDS.has(token));
}

function scoreOpenverseImage(image, companyName, location) {
  if (!image || image.mature || !image.thumbnail || !image.foreign_landing_url) return -Infinity;
  const width = Number(image.width) || 0;
  const height = Number(image.height) || 0;
  if (width < 640 || height < 360) return -Infinity;

  const tags = (image.tags || []).map((tag) => tag.name || "").join(" ");
  const text = `${image.title || ""} ${tags}`.toLowerCase();
  if (OPENVERSE_EXCLUDED_WORDS.test(text) || !BUILDING_WORDS.test(text)) return -Infinity;
  const distinctiveMatches = companyTokens(companyName).filter((token) => text.includes(token)).length;
  if (!distinctiveMatches) return -Infinity;

  const locationMatches = location.toLowerCase().split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && text.includes(token)).length;
  const landscape = width / Math.max(height, 1);
  const identityScore = /\b(sign|signage|logo|name)\b/i.test(text) ? 16 : 0;
  const buildingScore = /\b(headquarters|head office|hq)\b/i.test(text) ? 18
    : /\b(campus|building|office|tower|center|centre)\b/i.test(text) ? 10 : 5;
  return distinctiveMatches * 18 + locationMatches * 7 + identityScore + buildingScore
    + (landscape >= 1.2 ? 5 : 0) + Math.min(width / 1000, 4) - (landscape < .8 ? 6 : 0);
}

async function findOpenverseImage(name, location) {
  const queries = [
    `${name} headquarters building`,
    `${name} office building sign`,
    `${name} campus logo`,
  ];
  for (const query of queries) {
    const params = new URLSearchParams({ q: query, page_size: "20" });
    const response = await fetch(`${OPENVERSE_API}?${params}`, {
      headers: { "User-Agent": "SentimentLab/1.0 (company headquarters atlas)" },
      next: { revalidate: 60 * 60 * 24 * 30 },
    });
    if (!response.ok) continue;
    const payload = await response.json();
    const best = (payload.results || [])
      .map((image) => ({ image, score: scoreOpenverseImage(image, name, location) }))
      .filter((candidate) => Number.isFinite(candidate.score))
      .sort((a, b) => b.score - a.score)[0]?.image;
    if (best) {
      return {
        image: best.thumbnail,
        source: best.foreign_landing_url,
        title: best.title || `${name} building`,
        provider: best.provider || best.source || "Openverse",
      };
    }
  }
  return null;
}

function safelyDecodeImageResult(value) {
  try {
    const decoded = value.replaceAll("&quot;", '"').replaceAll("&amp;", "&").replaceAll("&#39;", "'");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function isWebUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

async function findBrandedSearchImage(name, location) {
  const query = `${name} headquarters building logo ${location}`.trim();
  const params = new URLSearchParams({ q: query, form: "HDRSC2", first: "1" });
  const response = await fetch(`${BING_IMAGES}?${params}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SentimentLab/1.0; company headquarters atlas)" },
    next: { revalidate: 60 * 60 * 24 * 30 },
  });
  if (!response.ok) return null;

  const html = await response.text();
  const candidates = [...html.matchAll(/\bm="(?<json>\{&quot;.*?\})"/g)]
    .map((match) => safelyDecodeImageResult(match.groups?.json || ""))
    .filter(Boolean)
    .map((result) => {
      const text = `${result.t || ""} ${result.desc || ""}`.toLowerCase();
      const matches = companyTokens(name).filter((token) => text.includes(token)).length;
      const building = BUILDING_WORDS.test(text);
      const exactName = text.includes(name.toLowerCase());
      const image = result.murl || result.turl;
      return { result, matches, building, exactName, image };
    })
    .filter(({ matches, building, image, result }) => matches > 0 && building && !SEARCH_EXCLUDED_WORDS.test(`${result.t || ""} ${result.desc || ""}`) && isWebUrl(image) && isWebUrl(result.purl))
    .sort((a, b) => (Number(b.exactName) - Number(a.exactName)) || (b.matches - a.matches));
  const best = candidates[0];
  if (!best) return null;
  return {
    image: best.image,
    source: best.result.purl,
    title: best.result.t || `${name} headquarters`,
    provider: "Web image search",
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const name = (searchParams.get("name") || "").trim().slice(0, 90);
  const location = (searchParams.get("location") || "").trim().slice(0, 60);
  const priorityCompany = Number(searchParams.get("value")) >= 300 || searchParams.get("priority") === "true";
  if (!name) return NextResponse.json({ error: "Company name is required" }, { status: 400 });

  try {
    if (priorityCompany) {
      const brandedSearchImage = await findBrandedSearchImage(name, location);
      if (brandedSearchImage) return NextResponse.json({ ...brandedSearchImage, verifiedMatch: true });
    }
    const searches = [
      { query: SEARCH_OVERRIDES[name.toLowerCase()] || `${name} headquarters building ${location}`.trim(), requireCompany: true },
      { query: `${name} headquarters`, requireCompany: true },
      { query: `${name} office campus`, requireCompany: true },
    ];
    let best = null;
    const seen = new Set();
    for (const search of searches) {
      if (seen.has(search.query)) continue;
      seen.add(search.query);
      const params = new URLSearchParams({
        action: "query",
        format: "json",
        formatversion: "2",
        generator: "search",
        gsrsearch: search.query,
        gsrnamespace: "6",
        gsrlimit: "10",
        prop: "imageinfo",
        iiprop: "url|size|mime",
        iiurlwidth: "1600",
      });
      const response = await fetch(`${COMMONS_API}?${params}`, {
        headers: { "User-Agent": "SentimentLab/1.0 (company headquarters atlas)" },
        next: { revalidate: 60 * 60 * 24 * 30 },
      });
      if (!response.ok) continue;
      const payload = await response.json();
      best = (payload.query?.pages || [])
        .map((page) => ({ page, score: scoreImage(page, name, location, search.requireCompany) }))
        .filter((candidate) => Number.isFinite(candidate.score))
        .sort((a, b) => b.score - a.score)[0]?.page;
      if (best) {
        break;
      }
    }
    const info = best?.imageinfo?.[0];
    if (!info) {
      const openverse = await findOpenverseImage(name, location);
      if (openverse) return NextResponse.json({ ...openverse, verifiedMatch: true });
      const brandedSearchImage = await findBrandedSearchImage(name, location);
      if (brandedSearchImage) return NextResponse.json({ ...brandedSearchImage, verifiedMatch: true });
      return NextResponse.json({ image: null, source: null });
    }

    return NextResponse.json({
      image: info.thumburl || info.url,
      source: info.descriptionurl,
      title: best.title.replace(/^File:/, ""),
      verifiedMatch: true,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Headquarters photo unavailable" }, { status: 502 });
  }
}
