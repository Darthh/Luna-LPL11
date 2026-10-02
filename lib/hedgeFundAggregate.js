// What forty-eight managers did to the same ticker, out of one pass over their
// books. Kept apart from lib/thirteenF.js - and free of its imports - because
// this is the part with the arithmetic worth pinning down, and a pure reduce
// can be checked without going near EDGAR: scripts/test-hedge-aggregate.mjs.
//
// Rows in come from `fundTickerRows`, one array per manager:
//   { ticker, name, value, added, reduced, isNew }

const TOP_N = 20;

// One manager, one line per ticker. A book can report the same ticker several
// times - Alphabet files under four CUSIPs and they all resolve to GOOGL/GOOG -
// and each of those lines is part of one manager's decision, not a manager of
// its own. Without this, `funds` counts lines and reports GOOGL held by 58 of
// 48 managers. Opening one share class of a name already held isn't opening the
// name, so `isNew` only survives if every line is new.
function mergeBook(rows) {
  const by = new Map();
  for (const r of rows) {
    const held = by.get(r.ticker);
    if (!held) {
      by.set(r.ticker, { ...r });
      continue;
    }
    held.value += r.value;
    held.added += r.added;
    held.reduced ||= r.reduced;
    held.isNew &&= r.isNew;
  }
  return by.values();
}

export function rankAggregates(books) {
  const by = new Map();
  for (const rows of books) {
    for (const r of mergeBook(rows)) {
      let e = by.get(r.ticker);
      if (!e) {
        e = { ticker: r.ticker, name: r.name, value: 0, added: 0, funds: 0, adds: 0, reduces: 0, opened: 0 };
        by.set(r.ticker, e);
      }
      e.value += r.value;
      e.funds++;
      // `adds` counts managers that bought, `added` is what they bought - a
      // ticker one fund piled into isn't the same story as one twenty funds
      // nibbled at, and the two columns are there to tell them apart.
      if (r.added > 0) {
        e.added += r.added;
        e.adds++;
      }
      if (r.reduced) e.reduces++;
      if (r.isNew) e.opened++;
    }
  }
  const all = [...by.values()];
  return {
    // A ticker nobody added to has no place on a table of what was added, even
    // if it's the biggest holding on the list.
    increased: all
      .filter((e) => e.added > 0)
      .sort((a, b) => b.added - a.added)
      .slice(0, TOP_N),
    mostOwned: [...all].sort((a, b) => b.value - a.value).slice(0, TOP_N),
  };
}
