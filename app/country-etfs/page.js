import CompareBoard from "@/components/CompareBoard";
import { COUNTRY_GROUPS } from "@/lib/compareBoards";

export const metadata = {
  title: "Country ETFs - Global Index Performance Compared",
  description:
    "Single-country index ETFs across the Americas, Europe, Asia and the Middle East, indexed off a shared zero so their returns can be read against each other.",
};

// The four the comparison usually starts from: the US and the three markets an
// American allocator most often measures it against.
const DEFAULT = ["SPY", "EWZ", "EWC", "EWW"];

export default function CountryEtfsPage() {
  return (
    <CompareBoard
      title="Country ETFs"
      subtitle="One index ETF per country, indexed off a shared zero. Tick a row to add it to the chart."
      groups={COUNTRY_GROUPS}
      defaultPicked={DEFAULT}
    />
  );
}
