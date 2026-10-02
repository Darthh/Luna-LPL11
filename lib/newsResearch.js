import "server-only";

import { coverageStrength, filterUnsupportedEvidence, normalizeFinnhubNews } from "./research";

const API_URL = "https://finnhub.io/api/v1";

export class NewsNotConfiguredError extends Error {}

async function fetchFinnhub(path, revalidate) {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) throw new NewsNotConfiguredError("Finnhub news is not configured");

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      headers: { Accept: "application/json", "X-Finnhub-Token": apiKey },
      next: { revalidate },
      signal: AbortSignal.timeout(12000),
    });
  } catch (error) {
    throw new Error(error?.name === "TimeoutError" ? "News lookup timed out" : "News feed is unreachable");
  }
  if (!response.ok) throw new Error(`News feed failed (${response.status})`);
  const rows = await response.json();
  return normalizeFinnhubNews(rows);
}

export function searchCompanyNews({ symbol, from, to }) {
  const query = new URLSearchParams({ symbol, from, to });
  return fetchFinnhub(`/company-news?${query}`, 21600);
}

export async function searchMarketNews(categories = ["general", "forex"]) {
  const settled = await Promise.allSettled(
    categories.map((category) => fetchFinnhub(`/news?${new URLSearchParams({ category, minId: "0" })}`, 1800))
  );
  const completed = settled.filter((result) => result.status === "fulfilled").map((result) => result.value);
  if (!completed.length) throw settled[0].reason;
  return mergeResearchResults(...completed);
}

export function mergeResearchResults(...groups) {
  const seen = new Set();
  const merged = [];
  for (const item of groups.flat()) {
    // The query is dropped to normalise tracking params, but only where it
    // isn't the identity: every Finnhub article is finnhub.io/api/news?id=X,
    // so stripping it collapses a whole feed into one "duplicate".
    const key = /[?&]id=/.test(item.url)
      ? item.url.replace(/#.*$/, "")
      : item.url.replace(/[?#].*$/, "").replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  merged.sort((a, b) => {
    const typeRank = (item) => (item.sourceType === "primary" ? 0 : 1);
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
