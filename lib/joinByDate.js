// Both inputs must be sorted ascending by date (ISO strings). Two-pointer
// merge intersection, O(n+m), preserves ascending order.
export function joinByDate(datesA, valuesA, datesB, valuesB) {
  let i = 0,
    j = 0;
  const dates = [],
    a = [],
    b = [];
  while (i < datesA.length && j < datesB.length) {
    if (datesA[i] === datesB[j]) {
      dates.push(datesA[i]);
      a.push(valuesA[i]);
      b.push(valuesB[j]);
      i++;
      j++;
    } else if (datesA[i] < datesB[j]) {
      i++;
    } else {
      j++;
    }
  }
  return { dates, fg: a, closes: b };
}
