import FinanceCRM from "@/components/FinanceCRM";

export const metadata = {
  title: "Finance CRM",
  description:
    "Manage client relationships, portfolios, strategies, and upcoming reviews.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <FinanceCRM />;
}
