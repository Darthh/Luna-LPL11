import Home from "@/components/Home";
import { fetchFearGreed } from "@/lib/fearGreed";

// The market dashboard. This was the site's front page until the market
// overview took "/", and it keeps every SEO surface it had - the dynamic title,
// the meta description and the JSON-LD below - at its own route, with "/" no
// longer claiming to be this page.
//
// Server component. The index numbers are fetched here and rendered into the
// initial HTML - the page used to ship an empty shell that only filled in
// after client JS ran, which meant crawlers and AI fetchers saw "n/a" and had
// nothing to index or quote. Revalidated hourly, matching the upstream feed.
export const revalidate = 3600;

export const metadata = {
  title: "Live Market Dashboard for Traders and Financial Advisors",
  description: "Monitor US equities, market sentiment, upcoming events, popular stocks, and technical signals from one free financial dashboard.",
  alternates: { canonical: "/dashboard" },
};

export default async function Page() {
  const data = await fetchFearGreed();
  return <Home initialFg={data} />;
}
