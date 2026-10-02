import { INDEXABLE_PAGES, SITE_LAST_UPDATED } from "@/lib/seoPages";
import { SITE_URL } from "@/lib/structuredData";

export default function sitemap() {
  const today = new Date().toISOString().slice(0, 10);
  return INDEXABLE_PAGES.map(({ path, changeFrequency, priority }) => ({
    url: `${SITE_URL}${path === "/" ? "" : path}`,
    lastModified: changeFrequency === "daily" ? today : SITE_LAST_UPDATED,
    changeFrequency,
    priority,
  }));
}
