import RsiLeWorkspace from "@/components/RsiLeWorkspace";

export const metadata = {
  title: "RsiLE +/- 2 — SPY, QQQ, SOXX & DRAM RSI Signals",
  description: "Track SPY, QQQ, SOXX or DRAM with TradingView-style 14-period RSI entry and reversal signals, candlesticks, technical overlays, and GEX levels.",
};

export default function RsiLePage() {
  return <RsiLeWorkspace />;
}
