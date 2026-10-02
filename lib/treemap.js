// Squarified treemap layout (Bruls, Huizing & van Wijk). Lays out items
// with a numeric `value` inside the given rect, aiming for near-square
// tiles. Returns [{ item, x, y, w, h }] in the input order's sort.

function worstAspect(row, length) {
  const sum = row.reduce((a, b) => a + b, 0);
  const side = sum / length;
  let worst = 0;
  for (const area of row) {
    const other = area / side;
    const ratio = Math.max(side / other, other / side);
    if (ratio > worst) worst = ratio;
  }
  return worst;
}

export function squarify(items, x, y, w, h) {
  const total = items.reduce((a, item) => a + item.value, 0);
  if (!total || w <= 0 || h <= 0) return [];

  const scale = (w * h) / total;
  const areas = items.map((item) => item.value * scale);
  const rects = [];

  let i = 0;
  let rx = x, ry = y, rw = w, rh = h;

  while (i < areas.length) {
    const length = Math.min(rw, rh);
    const row = [areas[i]];
    let j = i + 1;
    let best = worstAspect(row, length);
    while (j < areas.length) {
      const candidate = [...row, areas[j]];
      const aspect = worstAspect(candidate, length);
      if (aspect > best) break;
      row.push(areas[j]);
      best = aspect;
      j++;
    }

    const rowArea = row.reduce((a, b) => a + b, 0);
    const side = rowArea / length;
    let offset = 0;
    for (let k = 0; k < row.length; k++) {
      const tileLength = row[k] / side;
      if (rw >= rh) {
        // fill a vertical strip on the left
        rects.push({ item: items[i + k], x: rx, y: ry + offset, w: side, h: tileLength });
      } else {
        // fill a horizontal strip on top
        rects.push({ item: items[i + k], x: rx + offset, y: ry, w: tileLength, h: side });
      }
      offset += tileLength;
    }

    if (rw >= rh) {
      rx += side;
      rw -= side;
    } else {
      ry += side;
      rh -= side;
    }
    i = j;
  }

  return rects;
}
