import MarketCapRanking from "@/components/MarketCapRanking";

export const metadata = {
  title: "Companies by Market Cap, P/E and RSI",
  description:
    "The largest listed companies ranked by market capitalization, with trailing P/E, a 3-month price chart and a 14-day RSI. Sort by any column.",
};

export default function MarketCapPage() {
  return <MarketCapRanking />;
}
