// The implied move is what the options market is charging for the print: buy
// the at-the-money call and the at-the-money put on the first expiration that
// covers the report, and the combined premium is roughly what a straddle
// buyer needs the stock to travel to break even. As a share of spot that is
// the "+/- x%" quoted around earnings.
//
// This is the standard straddle approximation, not a full vol-surface model.
// It runs slightly rich - a straddle also carries the ordinary drift of the
// days it spans, not only the event - but for ranking which prints the market
// expects to be violent it is the number desks actually quote.

// The expiration has to land on or after the report, otherwise the contract
// expires before the news and prices no event risk at all: AVGO's front weekly
// quoted 1.8% for a Sep 3 print the following week's 6%+ was actually pricing.
export function pickExpiration(expirations, earningsDate) {
  if (!Array.isArray(expirations) || !expirations.length) return null;
  // Expirations are midnight UTC on expiry day; the report is a date string.
  // Compare as dates so an expiration on the report's own day still counts.
  const cutoff = Date.parse(`${earningsDate}T00:00:00.000Z`);
  if (Number.isNaN(cutoff)) return null;
  const covering = expirations.filter((value) => value * 1000 >= cutoff);
  return covering.length ? Math.min(...covering) : null;
}

// Bid/ask midpoint is the honest mark. lastPrice is a fallback for contracts
// with no two-sided market right now - stale, but better than dropping the
// symbol, and out of hours every quote looks like this.
//
// The fallback is only trustworthy where the market is still quoting. A zero
// bid is the tell: nobody will buy the contract at any price, so its last
// print is unanchored and usually old. SSL's $12.50 put quoted bid 0 / ask
// 2.95 and last 3.15 on a $11.82 stock - that stale print alone implied a 30%
// move. Open interest does not rescue it; that put had 9 contracts and one
// trade, which is a leftover position, not a market. So a leg with no live bid
// prices at nothing and drops the symbol.
function contractPrice(contract) {
  const bid = Number(contract?.bid) || 0;
  const ask = Number(contract?.ask) || 0;
  if (bid > 0 && ask > 0) return (bid + ask) / 2;
  if (!(bid > 0)) return 0;
  return Number(contract?.lastPrice) || 0;
}

function nearestStrike(contracts, spot) {
  let best = null;
  for (const contract of contracts || []) {
    const strike = Number(contract?.strike);
    if (!(strike > 0)) continue;
    if (!best || Math.abs(strike - spot) < Math.abs(best.strike - spot)) best = { ...contract, strike };
  }
  return best;
}

// A straddle is only at the money if both legs sit on the same strike. Calls
// and puts can list different strikes on thin names, and pairing a 120 call
// with a 115 put would quietly price a strangle instead.
export function impliedMovePercent({ calls, puts, spot }) {
  if (!(spot > 0)) return null;
  const call = nearestStrike(calls, spot);
  if (!call) return null;
  const put = (puts || []).find((contract) => Number(contract?.strike) === call.strike);
  if (!put) return null;

  // Both legs have to price. Summing a real call with a zero put would quote
  // half a straddle as if it were a whole one - a quiet number that reads as
  // a forecast rather than as missing data.
  const callPrice = contractPrice(call);
  const putPrice = contractPrice(put);
  if (!(callPrice > 0) || !(putPrice > 0)) return null;
  const straddle = callPrice + putPrice;

  // Check the two legs against each other with put-call parity. On one strike
  // and one expiration, C - P has to equal S - K, or the pair is arbitrage;
  // rates and dividends bend that slightly over weeks, never far. It is the
  // check that fits a straddle, because a straddle is exactly the two legs
  // together - a corrupt one is invisible on its own but breaks the identity.
  //
  // GWRE's $210 put quoted bid 80 / ask 82.5 against a $205.85 spot: live,
  // two-sided, and off parity by 32% of spot, implying a 44.7% move. Real
  // chains sit far inside the tolerance - GWRE's neighbours that week came in
  // at 0.4-0.6% - so this separates a bad mark from a violent print without
  // a threshold tuned to either.
  const parityGap = Math.abs(callPrice - putPrice - (spot - call.strike));
  if (parityGap > spot * 0.1) return null;

  const percent = (straddle / spot) * 100;
  // Anything past this is a broken chain, not a forecast. Even the wildest
  // real earnings straddle lands well inside it, so a number above it is a
  // data fault dressed as a prediction.
  if (!Number.isFinite(percent) || percent > 60) return null;
  return percent;
}
