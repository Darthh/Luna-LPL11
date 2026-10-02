import MarketMovers from "@/components/MarketMovers";
import "./market-movers.css";

export const metadata = { title: "Market movers" };

export default function Page() {
  return <main className="market-movers-page"><h1>Market movers</h1><MarketMovers /></main>;
}
