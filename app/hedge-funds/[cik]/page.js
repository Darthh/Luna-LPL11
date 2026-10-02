import { notFound } from "next/navigation";
import HedgeFundDetail from "@/components/HedgeFundDetail";
import { managerByCikOrSlug, managerSlug } from "@/lib/thirteenF";
import { shortName } from "@/lib/hedgeFundFormat";

// The URL segment is the firm's name (/hedge-funds/JaneStreetGroup), but every
// CIK link ever shared still resolves - see managerByCikOrSlug. Both rosters
// are searched: a hedgefund and an institution are the same kind of page off
// the same filings.
const manager = (slug) => managerByCikOrSlug(slug);

export async function generateMetadata({ params }) {
  const { cik: segment } = await params;
  const found = manager(segment);
  if (!found) return { title: "Manager not found" };
  const name = shortName(found.name);
  return {
    title: `${name} 13F holdings`,
    description: `Every stock ${name} reported owning in its latest SEC Form 13F: position sizes, quarter-on-quarter share changes and what each holding is worth.`,
    // Always the name form, so the two URLs for a page don't compete in search.
    alternates: { canonical: `/hedge-funds/${managerSlug(found.name)}` },
  };
}

export default async function HedgeFundPage({ params, searchParams }) {
  const { cik: segment } = await params;
  // Same gate the API applies. A segment that matches no manager has no filing
  // to read, so this is a missing page rather than an empty one.
  const found = manager(segment);
  if (!found) notFound();
  // Which quarter the list was on when this manager was clicked. Only a
  // starting point - the picker on the page takes over from here - and the API
  // is what validates it, so a junk value comes back as "no filing" rather
  // than being checked twice.
  const { period, roster } = await searchParams;
  return (
    <HedgeFundDetail
      // The API keys books by CIK, so the resolved manager's CIK is what goes
      // over the wire whichever form the reader arrived on.
      cik={found.cik}
      initialPeriod={typeof period === "string" ? period : null}
      // Only so the back link returns to the list the reader came from. The
      // book itself is the same either way - a CIK is a CIK.
      roster={roster === "institutions" ? "institutions" : "hedgefunds"}
    />
  );
}
