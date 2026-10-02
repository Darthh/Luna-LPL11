import HedgeFunds from "@/components/HedgeFunds";

export const metadata = {
  title: "Hedgefund 13F's",
  description:
    "What the largest hedge funds and trading firms own, from their latest SEC Form 13F filings: Citadel, Jane Street, Susquehanna, Millennium, Point72, Pershing Square and every other manager reporting a book over $10B.",
  alternates: { canonical: "/hedge-funds" },
};

export default function HedgeFundsPage() {
  return <HedgeFunds />;
}
