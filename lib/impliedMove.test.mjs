// Run: node lib/impliedMove.test.mjs
import assert from "node:assert/strict";
import { impliedMovePercent, pickExpiration } from "./impliedMove.js";

const day = (iso) => Date.parse(`${iso}T00:00:00.000Z`) / 1000;

// The bug this whole module exists to avoid: the front expiration lands before
// the report and prices no event, so the covering one has to win.
assert.equal(
  pickExpiration([day("2026-08-28"), day("2026-09-04"), day("2026-09-11")], "2026-09-03"),
  day("2026-09-04")
);
// An expiration on the report's own day still covers it.
assert.equal(pickExpiration([day("2026-09-03")], "2026-09-03"), day("2026-09-03"));
// Nothing covers a report past the last listed expiration.
assert.equal(pickExpiration([day("2026-08-28")], "2026-09-03"), null);
assert.equal(pickExpiration([], "2026-09-03"), null);
assert.equal(pickExpiration(null, "2026-09-03"), null);

// Straddle over spot: 6 + 6 on a 100 stock is a 12% move.
assert.equal(
  impliedMovePercent({
    calls: [{ strike: 100, bid: 5, ask: 7 }],
    puts: [{ strike: 100, bid: 5, ask: 7 }],
    spot: 100,
  }),
  12
);

// Legs must share a strike - pairing the 100 call with the 90 put would be a
// strangle quoted as a straddle.
assert.equal(
  impliedMovePercent({
    calls: [{ strike: 100, bid: 5, ask: 7 }],
    puts: [{ strike: 90, bid: 5, ask: 7 }],
    spot: 100,
  }),
  null
);

// A live bid with no ask still falls back to lastPrice - the market is there,
// the other side just has not printed.
assert.equal(
  impliedMovePercent({
    calls: [{ strike: 100, bid: 3.9, ask: 0, lastPrice: 4 }],
    puts: [{ strike: 100, bid: 3.9, ask: 0, lastPrice: 4 }],
    spot: 100,
  }),
  8
);

// The SSL case, with its real quotes: a zero-bid put whose stale 3.15 last
// print implied a 30% move on an $11.82 stock. Open interest of 9 and one
// traded contract do not make that a price.
assert.equal(
  impliedMovePercent({
    calls: [{ strike: 12.5, bid: 0.35, ask: 0.45, openInterest: 3821, volume: 118 }],
    puts: [{ strike: 12.5, bid: 0, ask: 2.95, lastPrice: 3.15, openInterest: 9, volume: 1 }],
    spot: 11.82,
  }),
  null
);

// Half a straddle is not a straddle: a real call beside a dead put is missing
// data, not a small implied move.
assert.equal(
  impliedMovePercent({
    calls: [{ strike: 100, bid: 5, ask: 5 }],
    puts: [{ strike: 100, bid: 0, ask: 0, lastPrice: 0 }],
    spot: 100,
  }),
  null
);

// Nearest strike to spot wins, not the first listed.
assert.equal(
  impliedMovePercent({
    calls: [{ strike: 50, bid: 30, ask: 30 }, { strike: 101, bid: 2, ask: 2 }],
    puts: [{ strike: 50, bid: 30, ask: 30 }, { strike: 101, bid: 3, ask: 3 }],
    spot: 100,
  }),
  5
);

// The GWRE case: a $210 put quoting bid 80 / ask 82.5 against a $205.85 spot.
// The quote is live and two-sided, so only parity catches it.
assert.equal(
  impliedMovePercent({
    calls: [{ strike: 210, bid: 9.7, ask: 11.9 }],
    puts: [{ strike: 210, bid: 80, ask: 82.5 }],
    spot: 205.85,
  }),
  null
);

// Parity holds on a strike slightly off spot, which is the normal case - the
// nearest listed strike rarely sits exactly at the money.
assert.ok(
  Math.abs(
    impliedMovePercent({
      calls: [{ strike: 15, bid: 1.5, ask: 1.8 }],
      puts: [{ strike: 15, bid: 1.3, ask: 1.65 }],
      spot: 15.09,
    }) - 20.7
  ) < 0.2
);

// Garbage in: a stale lastPrice implying a 300% move is a broken chain, and
// no spot at all means nothing to divide by.
assert.equal(
  impliedMovePercent({
    calls: [{ strike: 100, lastPrice: 200 }],
    puts: [{ strike: 100, lastPrice: 200 }],
    spot: 100,
  }),
  null
);
assert.equal(impliedMovePercent({ calls: [], puts: [], spot: 0 }), null);
assert.equal(impliedMovePercent({ calls: [], puts: [], spot: 100 }), null);

console.log("impliedMove: all assertions passed");
