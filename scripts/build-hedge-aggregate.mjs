// Regenerates lib/hedgeFundTop20.js - the frozen 13F leaderboards.
//
//   node scripts/build-hedge-aggregate.mjs
//
// Run it after a 13F deadline, which is 45 days past quarter end: mid-February,
// mid-May, mid-August, mid-November. Between those the filings it reads don't
// change, which is the whole reason the answer is a file and not a request.
//
// It reads every manager's information table straight from EDGAR - the same
// work the API used to do on demand, which is where the minutes of waiting
// came from. Expect it to take a while and to print each manager as it lands.
//
// Deliberately not driven through a running dev server: parsing forty-eight
// information tables is CPU-bound on multi-megabyte XML, and doing it inside
// Next blocks the event loop so thoroughly the server stops answering anything
// at all. Out here it's just a script taking its time.
import { registerHooks } from "node:module";
import { writeFileSync } from "node:fs";

// lib/ imports itself by the "@/" alias jsconfig.json gives the app, which
// means nothing to node. Rather than duplicating any of lib/thirteenF.js here,
// the alias is taught to the loader and the real modules are imported.
const root = new URL("../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith("@/")) return nextResolve(specifier, context);
    const path = specifier.slice(2);
    return { url: new URL(/\.[a-z]+$/.test(path) ? path : `${path}.js`, root).href, shortCircuit: true };
  },
});

const { MANAGERS, ROSTERS, fundTickerRows, fundList } = await import("../lib/thirteenF.js");
const { rankAggregates } = await import("../lib/hedgeFundAggregate.js");
const { RETURN_HOLDINGS } = await import("../lib/fundReturn.js");

// The quarter these numbers describe: the newest quarter any manager on the
// list filed for, which is what the site means by "the latest".
const { asOf } = await fundList();

// Every book is read at that quarter rather than at whatever each manager filed
// last. Those are the same thing only once every manager has filed - and a
// board labelled with one quarter that carries a late filer's previous book is
// wrong in exactly the way a reader can't see.
const books = [];
for (const [i, m] of MANAGERS.entries()) {
  const rows = await fundTickerRows(m.cik, asOf).catch((e) => {
    console.log(`  -- ${m.name}: ${e.message}`);
    return [];
  });
  books.push(rows);
  console.log(`  ${i + 1}/${MANAGERS.length} ${m.name} — ${rows.length} positions`);
}

// The institutions' books, for their weights only - they take no part in the
// leaderboards below.
const institutionBooks = [];
for (const [i, m] of ROSTERS.institutions.entries()) {
  const rows = await fundTickerRows(m.cik, asOf).catch((e) => {
    console.log(`  -- ${m.name}: ${e.message}`);
    return [];
  });
  institutionBooks.push([m, rows]);
  console.log(`  ${i + 1}/${ROSTERS.institutions.length} ${m.name} — ${rows.length} positions`);
}

const ranked = rankAggregates(books);
const payload = {
  asOf,
  generated: new Date().toISOString().slice(0, 10),
  // Managers that actually filed for the quarter, not managers on the list.
  funds: books.filter((rows) => rows.length).length,
  increased: ranked.increased,
  mostOwned: ranked.mostOwned,
  // What each manager's book weighs, biggest first, so the list page can price
  // a year-to-date estimate without reading forty-eight information tables
  // again. The weights are a filed fact and keep for the quarter; only the
  // prices behind the estimate are live - see lib/fundReturn.js.
  // Both rosters, because the year-to-date column is on both tabs. The
  // leaderboards above stay hedgefunds-only - "what the funds bought" is a
  // statement about the funds, and folding in Vanguard's index book would
  // drown it - but a weight is just what a firm holds, and the institutions
  // list needs its own or its YTD column reads n/a on every row.
  weights: Object.fromEntries(
    [...MANAGERS.map((m, i) => [m, books[i]]), ...institutionBooks].map(([m, rows]) => [
      m.cik,
      (rows ?? []).slice(0, RETURN_HOLDINGS).map(({ ticker, value }) => ({ ticker, value })),
    ])
  ),
};

if (!payload.increased.length) throw new Error("Nothing was read - refusing to write an empty snapshot");

const header = `// Generated ${payload.generated} from SEC 13F filings for ${asOf} by
// scripts/build-hedge-aggregate.mjs. Don't edit by hand - see that file, and
// rerun it after the next filing deadline.
//
// Building these live is minutes of EDGAR at its rate limit and gigabytes of
// XML, and a filed 13F never changes, so the leaderboards are read once a
// quarter and served from here. Empty \`increased\` sends the API back to
// building them live.
`;

writeFileSync(
  new URL("../lib/hedgeFundTop20.js", import.meta.url),
  `${header}export const HEDGE_TOP20 = ${JSON.stringify(payload, null, 2)};\n`
);

console.log(
  `lib/hedgeFundTop20.js: ${payload.increased.length} increased, ` +
    `${payload.mostOwned.length} most owned, ${payload.funds} managers, as of ${asOf}`
);
