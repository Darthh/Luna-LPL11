import { SITE_URL } from "@/lib/structuredData";

// Everything indexable is allowed, including the AI crawlers - being fetched
// and quoted by an assistant is the point. Only the password-gated sections
// and the auth/profile routes are held back; they have nothing to index and
// would only burn crawl budget.
export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/ai-bot", "/alerts", "/client-portfolios", "/model-portfolios", "/reports", "/api/auth/", "/api/profile", "/api/gate"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    // No `host`: it is a non-standard Yandex-only directive, Google and Bing
    // ignore it, and Next emits it with the scheme attached ("Host:
    // https://...") which is not even the format Yandex specifies.
  };
}
