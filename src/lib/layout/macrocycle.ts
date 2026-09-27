/**
 * The shape of a macrocycle: a chain closed on itself, drawn as a chain is -
 * a zigzag on the lattice - rather than as a round polygon.
 *
 * Walking round a ring drawn on the lattice, each bond turns 60 degrees from
 * the last, one way or the other, and the whole walk turns once round. That
 * makes the shape a sequence of turns: on a zigzag the turns alternate; at a
 * corner two or more go the same way. Every such walk that closes without
 * meeting itself is a ring on the lattice, and the one chosen is the one that
 * lies wide and open, as a chain does, with its corners gathered at the
 * ends. Only an even ring closes on the lattice; an odd one takes the shape
 * of the ring one larger with two atoms drawn together into one, and eased
 * until its bonds are even again.
 */
import { dir, rad, type Point } from "./geometry";

const cache = new Map<number, Point[]>();

/**
 * A ring of `n` atoms (nine or more) on the lattice, clockwise, bond length
 * 1, centred on the origin: its atoms in order.
 */
export function macrocycleShape(n: number): Point[] {
  const hit = cache.get(n);
  if (hit) return hit.map((p) => ({ ...p }));
  const shape = widest(n % 2 === 0 ? evenShape(n) : oddShape(n));
  const c = centreOf(shape);
  const out = shape.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
  cache.set(n, out);
  return out.map((p) => ({ ...p }));
}

function centreOf(ps: readonly Point[]): Point {
  const xs = ps.map((p) => p.x);
  const ys = ps.map((p) => p.y);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

/** The shape turned, by a step of the lattice, the way it lies widest. */
function widest(ps: Point[]): Point[] {
  let best = ps;
  let bestRatio = Infinity;
  for (const turn of [0, 60, 120]) {
    const t = rad(turn);
    const q = ps.map((p) => ({
      x: p.x * Math.cos(t) - p.y * Math.sin(t),
      y: p.x * Math.sin(t) + p.y * Math.cos(t),
    }));
    const xs = q.map((p) => p.x);
    const ys = q.map((p) => p.y);
    const ratio = (Math.max(...ys) - Math.min(...ys)) / (Math.max(...xs) - Math.min(...xs));
    if (ratio < bestRatio - 1e-9) {
      bestRatio = ratio;
      best = q;
    }
  }
  return best;
}

/** Whether a shape is its own mirror image, across an upright or a level line through its middle. */
function symmetric(ps: readonly Point[]): boolean {
  const w = widest([...ps]);
  const c = centreOf(w);
  const keys = new Set(w.map((p) => `${Math.round((p.x - c.x) * 100)},${Math.round((p.y - c.y) * 100)}`));
  const across = w.every((p) => keys.has(`${Math.round(-(p.x - c.x) * 100)},${Math.round((p.y - c.y) * 100)}`));
  const down = w.every((p) => keys.has(`${Math.round((p.x - c.x) * 100)},${Math.round(-(p.y - c.y) * 100)}`));
  return across || down;
}

/** The walk a sequence of turns (+1 left, -1 right) makes, or null if it meets itself or does not close. */
function walk(turns: readonly number[]): Point[] | null {
  const pts: Point[] = [];
  const seen = new Set<string>();
  let x = 0;
  let y = 0;
  let d = 0;
  for (const t of turns) {
    const k = `${Math.round(x * 1000)},${Math.round(y * 1000)}`;
    if (seen.has(k)) return null;
    seen.add(k);
    pts.push({ x, y });
    const v = dir(rad(30 + 60 * d));
    x += v.x;
    y += v.y;
    d += t;
  }
  if (Math.hypot(x, y) > 1e-6) return null;
  return pts;
}

/** How well a closed shape lies: wide and open, lower better. */
function shapeCost(ps: readonly Point[]): number {
  const n = ps.length;
  // measured the way up it lies widest, of the lattice's three
  let best = Infinity;
  for (const turn of [0, 60, 120]) {
    const t = rad(turn);
    const xs = ps.map((p) => p.x * Math.cos(t) - p.y * Math.sin(t));
    const ys = ps.map((p) => p.x * Math.sin(t) + p.y * Math.cos(t));
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    best = Math.min(best, h / Math.max(w, 1e-9));
  }
  let area = 0;
  for (let i = 0; i < n; i++) {
    const p = ps[i];
    const q = ps[(i + 1) % n];
    area += p.x * q.y - q.x * p.y;
  }
  area = Math.abs(area) / 2;
  // a circle's area for this perimeter is n^2 / 4 pi
  const open = area / ((n * n) / (4 * Math.PI));
  return 4 * (best - 0.55) ** 2 - open - (symmetric(ps) ? 0.1 : 0);
}

function evenShape(n: number): Point[] {
  // clockwise: six more right turns than left, none of the left ones together
  const lefts = (n - 6) / 2;
  const extras = 6;
  let bestPts: Point[] | null = null;
  let bestCost = Infinity;
  const tryGaps = (gaps: number[]) => {
    const turns: number[] = [];
    if (!gaps.length) for (let i = 0; i < n; i++) turns.push(-1);
    for (const g of gaps) {
      turns.push(1);
      for (let i = 0; i < g; i++) turns.push(-1);
    }
    const pts = walk(turns);
    if (!pts) return;
    const cost = shapeCost(pts);
    if (cost < bestCost - 1e-9) {
      bestCost = cost;
      bestPts = pts;
    }
  };
  if (lefts === 0) {
    tryGaps([]);
  } else {
    // the extra right turns gathered into at most four corners, the first
    // corner at the first gap (a shape turned round is the same shape)
    const parts = partitions(extras, 4, 3);
    for (const part of parts) {
      const k = part.length;
      if (k > lefts) continue;
      for (const at of placements(lefts, k)) {
        const gaps = new Array<number>(lefts).fill(1);
        at.forEach((g, i) => (gaps[g] += part[i]));
        tryGaps(gaps);
      }
    }
  }
  if (bestPts) return bestPts;
  // no lattice ring of this size (eight): a regular polygon
  return regular(n);
}

/** Ordered ways of writing `total` as `count` parts of 1 to `most`, for count up to `maxCount`. */
function partitions(total: number, maxCount: number, most: number): number[][] {
  const out: number[][] = [];
  const rec = (left: number, acc: number[]) => {
    if (left === 0) {
      out.push([...acc]);
      return;
    }
    if (acc.length === maxCount) return;
    for (let v = 1; v <= Math.min(most, left); v++) rec(left - v, [...acc, v]);
  };
  rec(total, []);
  return out;
}

/** Increasing positions among `slots` for `count` corners, the first at 0. */
function placements(slots: number, count: number): number[][] {
  const out: number[][] = [];
  const rec = (from: number, acc: number[]) => {
    if (acc.length === count) {
      out.push([...acc]);
      return;
    }
    for (let i = from; i < slots; i++) rec(i + 1, [...acc, i]);
  };
  if (count === 0) return [[]];
  rec(1, [0]);
  return out;
}

function regular(n: number): Point[] {
  const r = 1 / (2 * Math.sin(Math.PI / n));
  return Array.from({ length: n }, (_, i) => {
    const a = Math.PI / 2 - (i * 2 * Math.PI) / n;
    return { x: r * Math.cos(a), y: r * Math.sin(a) };
  });
}

function oddShape(n: number): Point[] {
  const base = evenShape(n + 1);
  let best: Point[] | null = null;
  let bestStrain = Infinity;
  for (let drop = 0; drop < base.length; drop++) {
    const ring = base.filter((_, i) => i !== drop).map((p) => ({ ...p }));
    // the two either side of the one taken out drawn together to a bond apart
    const iB = (drop - 1 + ring.length) % ring.length;
    const iA = drop % ring.length;
    const dx = ring[iA].x - ring[iB].x;
    const dy = ring[iA].y - ring[iB].y;
    const d = Math.hypot(dx, dy);
    const k = (d - 1) / (2 * d);
    ring[iB] = { x: ring[iB].x + dx * k, y: ring[iB].y + dy * k };
    ring[iA] = { x: ring[iA].x - dx * k, y: ring[iA].y - dy * k };
    const strain = relaxRing(ring);
    if (strain < bestStrain) {
      bestStrain = strain;
      best = ring;
    }
  }
  return best ?? regular(n);
}

/**
 * Eases a ring until its bonds are 1 and each atom's neighbours sqrt 3
 * apart (a 120 degree angle, inside or out); returns what strain is left.
 */
function relaxRing(ps: Point[]): number {
  const n = ps.length;
  const pull = (i: number, j: number, target: number, k: number) => {
    const dx = ps[j].x - ps[i].x;
    const dy = ps[j].y - ps[i].y;
    const d = Math.hypot(dx, dy) || 1e-9;
    const f = ((d - target) / d) * 0.5 * k;
    ps[i].x += dx * f;
    ps[i].y += dy * f;
    ps[j].x -= dx * f;
    ps[j].y -= dy * f;
  };
  for (let it = 0; it < 3000; it++) {
    for (let i = 0; i < n; i++) pull(i, (i + 1) % n, 1, 1);
    for (let i = 0; i < n; i++) pull(i, (i + 2) % n, Math.sqrt(3), 0.3);
  }
  let strain = 0;
  for (let i = 0; i < n; i++) {
    strain += (Math.hypot(ps[(i + 1) % n].x - ps[i].x, ps[(i + 1) % n].y - ps[i].y) - 1) ** 2;
    strain +=
      0.3 * (Math.hypot(ps[(i + 2) % n].x - ps[i].x, ps[(i + 2) % n].y - ps[i].y) - Math.sqrt(3)) ** 2;
  }
  return strain;
}
