import CurrenciesBoard from "@/components/CurrenciesBoard";

export const metadata = {
  title: "Major Currencies - FX Crosses and Cross-Rate Performance",
  description:
    "Major FX crosses charted off a shared zero, with a cross-rate matrix showing how each of the ten major currencies moved against every other.",
};

export default function CurrenciesPage() {
  return <CurrenciesBoard />;
}
