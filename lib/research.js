// Pure helpers shared by the stock research UI and its tests. Network access
// stays in lib/newsResearch.js so provider credentials and server machinery
// cannot cross the client boundary.

const DAY = 86400;

export function isoDayFromUnix(timestamp) {
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

// Reduce intraday candles to one close per UTC trading date, then find the
// largest daily move in the visible range. On a 1D/5D intraday chart there
// often is only one completed date, so the quote's current move is the honest
// fallback rather than inventing a move between two arbitrary candles.
export function deriveNotableMove(points, fallback = {}) {
  const byDay = new Map();
  for (const point of Array.isArray(points) ? points : []) {
    if (!Number.isFinite(point?.t) || !Number.isFinite(point?.c)) continue;
    byDay.set(isoDayFromUnix(point.t), point);
  }
  const days = [...byDay.values()].sort((a, b) => a.t - b.t);
  // Intraday candles can straddle midnight UTC even though they belong to one
  // market session. If there are several prints per calendar day, comparing
  // the last print on either UTC side produces a tiny fake "daily" move. The
  // profile quote already carries the exchange's true session change.
  const intraday = days.length > 0 && points.length > days.length * 4;
  let best = null;
  for (let i = 1; !intraday && i < days.length; i++) {
    const previous = days[i - 1].c;
    if (!previous) continue;
    const pct = ((days[i].c - previous) / previous) * 100;
    if (!Number.isFinite(pct)) continue;
    const candidate = {
      date: isoDayFromUnix(days[i].t),
      timestamp: days[i].t,
      pct,
      close: days[i].c,
      kind: "largest",
    };
    if (!best || Math.abs(candidate.pct) > Math.abs(best.pct)) best = candidate;
  }

  if (best) return best;
  const fallbackPct = Number(fallback.pct);
  const fallbackTimestamp = Number(fallback.timestamp);
  if (!Number.isFinite(fallbackPct)) return null;
  return {
    date: isoDayFromUnix(fallbackTimestamp) ?? new Date().toISOString().slice(0, 10),
    timestamp: Number.isFinite(fallbackTimestamp)
      ? fallbackTimestamp
      : Math.floor(Date.now() / 1000),
    pct: fallbackPct,
    close: Number.isFinite(Number(fallback.close)) ? Number(fallback.close) : null,
    kind: "latest",
  };
}

export function nearestPointIndex(points, isoDate, maxGapDays = 3) {
  if (!Array.isArray(points) || !points.length || !isoDate) return -1;
  const target = Date.parse(`${isoDate}T20:00:00Z`) / 1000;
  if (!Number.isFinite(target)) return -1;
  let best = -1;
  let gap = Infinity;
  points.forEach((point, index) => {
    if (!Number.isFinite(point?.t)) return;
    const nextGap = Math.abs(point.t - target);
    if (nextGap < gap) {
      gap = nextGap;
      best = index;
    }
  });
  return gap <= maxGapDays * DAY ? best : -1;
}

export function sourceDomain(rawUrl) {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, "");
  } catch {
    return "Source";
  }
}

function compactText(value, limit = 520) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trimEnd()}…`;
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function sourceType(url, category) {
  const domain = sourceDomain(url);
  if (domain === "sec.gov" || domain.endsWith(".sec.gov") || category === "financial report") {
    return "filing";
  }
  if (/investor|ir\./i.test(url)) return "primary";
  return "coverage";
}

export function normalizeExaResults(results, category = null) {
  const seen = new Set();
  const normalized = [];
  for (const row of Array.isArray(results) ? results : []) {
    const url = safeUrl(row?.url);
    if (!url) continue;
    // The query is dropped to normalise tracking params, except where an ?id=
    // carries the article's identity - see normalizeFinnhubNews below.
    const canonical = /[?&]id=/.test(url)
      ? url.replace(/#.*$/, "")
      : url.replace(/[?#].*$/, "").replace(/\/$/, "");
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    const highlights = Array.isArray(row.highlights) ? row.highlights : [];
    const imageLinks = Array.isArray(row?.extras?.imageLinks) ? row.extras.imageLinks : [];
    normalized.push({
      title: compactText(row.title || sourceDomain(url), 180),
      url,
      domain: sourceDomain(url),
      // The component labels the picture with `publisher`. Exa's author is a
      // person ("Jeff Cox"), which reads as the source's name but is not one,
      // so the domain stays the label; the byline keeps its own field.
      publisher: sourceDomain(url),
      publishedDate: typeof row.publishedDate === "string" ? row.publishedDate.slice(0, 10) : null,
      author: compactText(row.author, 100) || null,
      excerpt: compactText(row.summary || highlights[0] || row.text, 520),
      score: Number.isFinite(row.score) ? row.score : null,
      sourceType: sourceType(url, category),
      image: safeUrl(row.image) || imageLinks.map(safeUrl).find(Boolean) || null,
    });
  }
  return normalized;
}

export function normalizeFinnhubNews(results) {
  const seen = new Set();
  const normalized = [];
  for (const row of Array.isArray(results) ? results : []) {
    const url = safeUrl(row?.url);
    if (!url) continue;
    // The query is dropped to normalise tracking params, but an ?id= query is
    // the article's identity, not a tracking param - every Finnhub article is
    // finnhub.io/api/news?id=X, and stripping it collapses a feed into one.
    const canonical = /[?&]id=/.test(url)
      ? url.replace(/#.*$/, "")
      : url.replace(/[?#].*$/, "").replace(/\/$/, "");
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    const published = Number(row.datetime);
    normalized.push({
      title: compactText(row.headline || sourceDomain(url), 180),
      url,
      domain: sourceDomain(url),
      publisher: compactText(row.source, 100) || null,
      publishedDate: Number.isFinite(published) ? new Date(published * 1000).toISOString().slice(0, 10) : null,
      author: compactText(row.source, 100) || null,
      excerpt: compactText(row.summary, 520),
      score: null,
      sourceType: sourceType(url),
      image: safeUrl(row.image) || null,
      related: compactText(row.related, 240),
    });
  }
  return normalized;
}

function termMatches(text, term) {
  const needle = String(term ?? "").trim().toLowerCase();
  if (!needle) return false;
  const haystack = String(text ?? "").toLowerCase();
  if (needle.length > 4 || needle.includes(" ")) return haystack.includes(needle);
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(haystack);
}

export function newsMatchesAny(item, terms) {
  const text = `${item?.title ?? ""} ${item?.excerpt ?? ""} ${item?.related ?? ""}`;
  return (Array.isArray(terms) ? terms : []).some((term) => termMatches(text, term));
}

export function rankNews(items, { termGroups = [], optionalTerms = [], targetDate = null } = {}) {
  const target = targetDate ? Date.parse(`${targetDate}T12:00:00Z`) : NaN;
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      if (termGroups.some((group) => !newsMatchesAny(item, group))) return null;
      const title = { ...item, excerpt: "", related: "" };
      let relevance = termGroups.reduce((score, group) => score + (newsMatchesAny(title, group) ? 5 : 2), 0);
      relevance += optionalTerms.reduce((score, term) => score + (newsMatchesAny(item, [term]) ? 1 : 0), 0);
      const published = Date.parse(`${item.publishedDate ?? ""}T12:00:00Z`);
      const distance = Number.isFinite(target) && Number.isFinite(published)
        ? Math.abs(published - target) / 86400000
        : 0;
      return { item: { ...item, score: relevance }, relevance, distance, published: Number.isFinite(published) ? published : 0 };
    })
    .filter(Boolean)
    .sort((a, b) => b.relevance - a.relevance || a.distance - b.distance || b.published - a.published)
    .map(({ item }) => item);
}

// Keep explicit negative statements out of relationship results instead of
// rewarding them merely for containing both company names.
export function filterUnsupportedEvidence(items) {
  const unsupported = [
    /\bdoes\s+not\s+(?:explicitly\s+)?(?:mention|discuss|address|pertain|relate|refer|support|contain|provide|document|identify|state|confirm)\b/i,
    /\bdoes\s+not\s+expli(?:\W|$)/i,
    /\bthere\s+is\s+no\s+(?:information|evidence|mention|support|supported fact)\b/i,
    /\bno\s+(?:information|evidence|supported fact)\s+(?:about|for|to explain|that)\b/i,
    /\bno\s+information\s+in\s+.+\bsupports?\b/i,
    /\bnot\s+(?:about|related to|relevant to)\b/i,
    /\bsource\s+is\s+about\b.+,\s+not\b/i,
  ];
  return (Array.isArray(items) ? items : []).filter((item) => {
    const evidence = `${item?.title ?? ""} ${item?.excerpt ?? ""}`;
    return !unsupported.some((pattern) => pattern.test(evidence));
  });
}

export function coverageStrength(items) {
  const rows = Array.isArray(items) ? items : [];
  const domains = new Set(rows.map((item) => sourceDomain(item.url)));
  const primary = rows.some((item) => item.sourceType === "filing" || item.sourceType === "primary");
  if (primary && domains.size >= 2) return "strong";
  if (domains.size >= 2 || primary) return "moderate";
  return rows.length ? "limited" : "none";
}
