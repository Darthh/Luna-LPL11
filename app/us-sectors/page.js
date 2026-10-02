import CompareBoard from "@/components/CompareBoard";
import { SECTOR_GROUPS } from "@/lib/compareBoards";

export const metadata = {
  title: "US Sectors - Sector and Industry Performance Compared",
  description:
    "The eleven SPDR sector ETFs and the industry funds that cut across them, indexed off a shared zero so rotation between them is visible on one chart.",
};

// All eleven sectors on by default: the point of the page is the spread
// between them, and a subset would hide the leader or the laggard.
const DEFAULT = SECTOR_GROUPS[0].rows.map((r) => r.symbol);

export default function UsSectorsPage() {
  return (
    <CompareBoard
      title="US Sectors"
      subtitle="The eleven sector SPDRs, indexed off a shared zero. Tick a row to add or drop a line."
      groups={SECTOR_GROUPS}
      defaultPicked={DEFAULT}
    />
  );
}
