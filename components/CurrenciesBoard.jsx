"use client";

import CompareBoard from "./CompareBoard";
import CurrencyMatrix from "./CurrencyMatrix";
import { CURRENCY_GROUPS } from "@/lib/compareBoards";

// A client wrapper only because the matrix is wired to the board's range with
// a function, and a server component cannot hand a function to a client one.
// The two crosses the FX page opens on: the dollar against the euro and the
// yen.
const DEFAULT = ["EURUSD=X", "USDJPY=X"];

export default function CurrenciesBoard() {
  return (
    <CompareBoard
      title="Major Currencies"
      subtitle="FX crosses indexed off a shared zero. Tick a row to add or drop a line."
      groups={CURRENCY_GROUPS}
      defaultPicked={DEFAULT}
      footer={(range) => <CurrencyMatrix range={range} />}
    />
  );
}
