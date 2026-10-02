// Click-to-sort for the app's data tables, shared by the stock screener and the
// hedge fund list so the two can't disagree about what a second click does.

// Highest, then lowest, then back to the order the data arrived in. `null` is
// that third state, and it's the one the table starts in.
export function cycleSort(sort, key) {
  if (sort?.key !== key) return { key, dir: "desc" };
  return sort.dir === "desc" ? { key, dir: "asc" } : null;
}

export function sortRows(rows, sort) {
  if (!sort) return rows;
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = a[sort.key];
    const y = b[sort.key];
    // A missing value isn't the smallest one, it's an unknown one, so those
    // rows sink to the bottom whichever way the column is pointing.
    if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
    return sign * (typeof x === "string" ? x.localeCompare(y) : x - y);
  });
}
