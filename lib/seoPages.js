export const SITE_LAST_UPDATED = "2026-09-13";

// Canonical public HTML pages. Personalized tools and redirects are omitted.
export const INDEXABLE_PAGES = [
  ["/about", "weekly", 1], ["/dashboard", "daily", 0.9],
  ["/graphs/historical", "daily", 0.8], ["/graphs/comparison", "daily", 0.8],
  ["/maps", "daily", 0.8], ["/screener", "daily", 0.8],
  ["/market-cap", "daily", 0.8], ["/earnings-calendar", "daily", 0.8],
  ["/country-etfs", "daily", 0.7], ["/us-sectors", "daily", 0.7],
  ["/currencies", "daily", 0.7], ["/global-yields", "daily", 0.7],
  ["/lots-of-charts", "daily", 0.7], ["/chart-metrics", "weekly", 0.7],
  ["/supply-chain", "weekly", 0.7], ["/13Filings", "weekly", 0.7],
  ["/company-world-map", "weekly", 0.6], ["/portfolio-comparison", "weekly", 0.6],
  ["/regression-analysis", "weekly", 0.6], ["/rsi-le", "daily", 0.6],
  ["/contact", "yearly", 0.3],
  ["/accessibility", "yearly", 0.2], ["/privacy", "yearly", 0.2], ["/terms", "yearly", 0.2],
].map(([path, changeFrequency, priority]) => ({ path, changeFrequency, priority }));

export function pageMetadata(path, title, description) {
  return {
    title, description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}
