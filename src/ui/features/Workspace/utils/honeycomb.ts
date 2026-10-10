/**
 * The honeycomb a chain is traced on: the lattice of a drawing's own bond
 * lengths and angles - three bonds 120 degrees apart at every point - laid
 * out from where the chain starts, so that every way along it is a bond a
 * drawing would have. Pure geometry.
 *
 * Its points are of two kinds, A and B, each bonded only to the other kind:
 * from an A point the bonds go at `angle`, `angle` + 120 and `angle` + 240
 * degrees; from a B point the other way round. A point is named by two whole
 * numbers and its kind, as `m,n,A` or `m,n,B`; the start is `0,0,A`.
 */
export type Pt = { x: number; y: number };

export type Honeycomb = {
  /** Where the start is: the point `0,0,A`. */
  origin: Pt;
  /** The way of the first of an A point's three bonds, in radians. */
  angle: number;
  /** A bond's length. */
  length: number;
};

/** A point of the honeycomb: its name, and where it is. */
export type Cell = { key: string; m: number; n: number; b: boolean; x: number; y: number };

/** The three ways out of an A point. */
function ways(h: Honeycomb): [Pt, Pt, Pt] {
  const d = (k: number): Pt => ({
    x: h.length * Math.cos(h.angle + (k * 2 * Math.PI) / 3),
    y: h.length * Math.sin(h.angle + (k * 2 * Math.PI) / 3),
  });
  return [d(0), d(1), d(2)];
}

export function keyOf(m: number, n: number, b: boolean): string {
  return `${m},${n},${b ? "B" : "A"}`;
}

/** The point named `m,n` of its kind. */
export function cellAt(h: Honeycomb, m: number, n: number, b: boolean): Cell {
  const [d0, d1, d2] = ways(h);
  // (an A point is m steps of d0 - d1 and n of d0 - d2 from the start; its
  // B point is one d0 on)
  const x = h.origin.x + m * (d0.x - d1.x) + n * (d0.x - d2.x) + (b ? d0.x : 0);
  const y = h.origin.y + m * (d0.y - d1.y) + n * (d0.y - d2.y) + (b ? d0.y : 0);
  return { key: keyOf(m, n, b), m, n, b, x, y };
}

export function cellOf(h: Honeycomb, key: string): Cell {
  const [m, n, k] = key.split(",");
  return cellAt(h, Number(m), Number(n), k === "B");
}

/** The three points bonded to a point. */
export function neighboursOf(h: Honeycomb, c: Cell): Cell[] {
  return c.b
    ? [cellAt(h, c.m, c.n, false), cellAt(h, c.m + 1, c.n, false), cellAt(h, c.m, c.n + 1, false)]
    : [cellAt(h, c.m, c.n, true), cellAt(h, c.m - 1, c.n, true), cellAt(h, c.m, c.n - 1, true)];
}

/** Whole numbers `m, n` of the A point nearest a place, roughly - a few of those about it are looked at. */
function roughly(h: Honeycomb, p: Pt): { m: number; n: number } {
  const [d0, d1, d2] = ways(h);
  const u = { x: d0.x - d1.x, y: d0.y - d1.y };
  const v = { x: d0.x - d2.x, y: d0.y - d2.y };
  const det = u.x * v.y - u.y * v.x;
  const dx = p.x - h.origin.x;
  const dy = p.y - h.origin.y;
  return { m: Math.round((dx * v.y - dy * v.x) / det), n: Math.round((u.x * dy - u.y * dx) / det) };
}

/** The point of the honeycomb nearest a place. */
export function nearestCell(h: Honeycomb, p: Pt): Cell {
  const { m, n } = roughly(h, p);
  let best: Cell | null = null;
  let far = Infinity;
  for (let i = m - 2; i <= m + 2; i++) {
    for (let j = n - 2; j <= n + 2; j++) {
      for (const b of [false, true]) {
        const c = cellAt(h, i, j, b);
        const d = Math.hypot(c.x - p.x, c.y - p.y);
        if (d < far) {
          far = d;
          best = c;
        }
      }
    }
  }
  return best!;
}

/** The points of the honeycomb within `radius` of a place, and the bonds among them. */
export function cellsWithin(h: Honeycomb, centre: Pt, radius: number): { cells: Cell[]; edges: [Cell, Cell][] } {
  const { m, n } = roughly(h, centre);
  const span = Math.ceil(radius / (h.length * Math.sqrt(3) * 0.5)) + 1;
  const cells: Cell[] = [];
  for (let i = m - span; i <= m + span; i++) {
    for (let j = n - span; j <= n + span; j++) {
      for (const b of [false, true]) {
        const c = cellAt(h, i, j, b);
        if (Math.hypot(c.x - centre.x, c.y - centre.y) <= radius) cells.push(c);
      }
    }
  }
  const known = new Set(cells.map((c) => c.key));
  const edges: [Cell, Cell][] = [];
  for (const c of cells) {
    if (c.b) continue;
    for (const o of neighboursOf(h, c)) if (known.has(o.key)) edges.push([c, o]);
  }
  return { cells, edges };
}

/**
 * The honeycomb for a chain from `start`: turned so that a bond it already
 * has is one of the honeycomb's, the chain going on from it 120 degrees
 * round; with none, as a drawing's chains run, across at 30 degrees.
 */
export function honeycombFrom(start: Pt, bondedTo: Pt[], length: number): Honeycomb {
  const first = bondedTo[0];
  const angle = first ? Math.atan2(first.y - start.y, first.x - start.x) : Math.PI / 6;
  return { origin: { x: start.x, y: start.y }, angle, length };
}
