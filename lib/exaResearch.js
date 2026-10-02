import "server-only";

import { memo } from "./memo";
import { coverageStrength, filterUnsupportedEvidence, normalizeExaResults } from "./research";

const API_URL = "https://api.exa.ai/search";
const CACHE_TTL = 6 * 60 * 60 * 1000;
const cached = memo(CACHE_TTL, { max: 500 });

export class ExaNotConfiguredError extends Error {}

function compactText(value, limit = 520) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trimEnd()}…`;
}

export async function searchExa({
  query,
  category,
  numResults = 6,
  startPublishedDate,
  endPublishedDate,
  summaryQuery,
}) {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) throw new ExaNotConfiguredError("Exa research is not configured");

  const body = {
    query,
    type: "auto",
    numResults,
    ...(category ? { category } : {}),
    ...(startPublishedDate ? { startPublishedDate } : {}),
    ...(endPublishedDate ? { endPublishedDate } : {}),
    contents: {
      highlights: { query: summaryQuery || query, maxCharacters: 700 },
      summary: { query: summaryQuery || query },
      extras: { imageLinks: 1 },
      maxAgeHours: 12,
    },
  };
  return cached(JSON.stringify(body), async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18_000);
    let response;
    try {
      response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      throw new Error(error?.name === "AbortError" ? "Exa research timed out" : "Exa research is unreachable");
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Exa research failed (${response.status})${detail ? `: ${compactText(detail, 140)}` : ""}`);
    }
    const json = await response.json();
    return normalizeExaResults(json?.results, category);
  });
}

export function mergeResearchResults(...groups) {
  const seen = new Set();
  const merged = [];
  for (const item of groups.flat()) {
    const key = item.url.replace(/[?#].*$/, "").replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  merged.sort((a, b) => {
    const typeRank = (item) => (item.sourceType === "filing" ? 0 : item.sourceType === "primary" ? 1 : 2);
    return typeRank(a) - typeRank(b) || (b.score ?? 0) - (a.score ?? 0);
  });
  return filterUnsupportedEvidence(merged);
}

export function researchPayload(items, extra = {}) {
  return {
    ...extra,
    strength: coverageStrength(items),
    sources: items,
    generatedAt: new Date().toISOString(),
  };
}
