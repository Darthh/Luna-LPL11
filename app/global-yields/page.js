import GlobalYields from "@/components/GlobalYields";

export const metadata = {
  title: "Global Yields - Sovereign Bond Yields by Country and Tenor",
  description:
    "The US Treasury curve from 1 year to 30 years, plus long-term government bond yields for the major economies, charted together.",
};

export default function GlobalYieldsPage() {
  return <GlobalYields />;
}
