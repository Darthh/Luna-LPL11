import PortfolioComparison from "@/components/WhatIf";

export const metadata = {
  title: "Portfolio comparison — Compare your portfolio against the market",
  description:
    "Build a hypothetical $100,000 portfolio of US stocks or ETFs and compare its performance with the S&P 500, market indexes, sectors, or another stock.",
  alternates: { canonical: "/portfolio-comparison" },
};

export default function PortfolioComparisonPage() {
  return <PortfolioComparison />;
}
