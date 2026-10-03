import HedgeFunds from "@/components/HedgeFunds";

export const metadata = {
  title: "13F Filings",
  description: "Explore institutional and hedge fund holdings from their latest SEC Form 13F filings, including position sizes and quarterly changes.",
  alternates: { canonical: "/13Filings" },
};

export default async function FilingsPage({ searchParams }) {
  const { roster } = await searchParams;
  const initialRoster = roster === "hedgefunds" ? "hedgefunds" : "institutions";
  return <HedgeFunds key={initialRoster} initialRoster={initialRoster} />;
}
