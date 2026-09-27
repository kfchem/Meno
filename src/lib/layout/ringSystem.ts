/**
 * A ring system laid out on its own, in a frame of its own: its rings as
 * regular polygons on the lattice, one after another.
 *
 * The first ring is set square on the lattice - a six-membered ring with two
 * sides upright - or, where the system has a macrocycle, the macrocycle is
 * first, drawn as a chain closed on itself. Each ring after it has some of
 * its atoms placed already, by the rings before it; the rest of the ring is
 * a run of atoms between two placed ones, laid on the arc of the ring's own
 * regular polygon between them. On a shared side, that is the regular
 * polygon fused on that side. Where more of the ring is placed - a ring
 * fused on two sides at once, as in pyrene, or a bridge - it is the part of
 * the polygon the placed atoms leave, on whichever side has room.
 */
import {
  add,
  angleOf,
  centroid,
  cross,
  dir,
  dist,
  len,
  norm,
  scale,
  splitWidestGap,
  sub,
  type Point,
} from "./geometry";
import { macrocycleShape } from "./macrocycle";
import type { Molecule, RingSystem } from "./perceive";

/** Rings this size and over are macrocycles, drawn as a closed zigzag. */
export const MACROCYCLE = 9;

/** The circumradius of a regular polygon of `n` sides of length 1. */
const radius = (n: number) => 1 / (2 * Math.sin(Math.PI / n));

/**
 * The angle of a regular ring's first atom, round from its centre, that sets
 * it square: a triangle, pentagon, hexagon or heptagon with an apex at the
 * top; a square or octagon with a side level at the top.
 */
function squareStart(n: number): number {
  return n === 4 || n === 8 ? Math.PI / 2 + Math.PI / n : Math.PI / 2;
}

export function placeRingSystem(mol: Molecule, sys: RingSystem): Map<number, Point> {
  const pos = new Map<number, Point>();
  const rings = sys.rings.map((i) => mol.rings[i]);
  const placedRing = new Set<number>();

  // first: the largest macrocycle; else a six-membered ring, or a four,
  // among the most fused; else the largest ring
  const fusedCount = (r: number[]) =>
    rings.filter((q) => q !== r && q.filter((a) => r.includes(a)).length >= 2).length;
  // (a ring that can lie square on the lattice - six, then four - sets the
  // system square)
  const fit = (r: number[]) => (r.length === 6 ? 2 : r.length === 4 ? 1 : 0);
  const first = [...rings].sort((p, q) => {
    const pm = p.length >= MACROCYCLE ? p.length : 0;
    const qm = q.length >= MACROCYCLE ? q.length : 0;
    if (pm !== qm) return qm - pm;
    if (fit(p) !== fit(q)) return fit(q) - fit(p);
    const f = fusedCount(q) - fusedCount(p);
    if (f) return f;
    return q.length - p.length;
  })[0];

  if (first.length >= MACROCYCLE) {
    const shape = macrocycleShape(first.length);
    const at = macrocycleFit(mol, first, shape, rings);
    first.forEach((a, i) => pos.set(a, shape[at(i)]));
  } else {
    const r = radius(first.length);
    const t0 = squareStart(first.length);
    first.forEach((a, i) => pos.set(a, scale(dir(t0 - (i * 2 * Math.PI) / first.length), r)));
  }
  placedRing.add(rings.indexOf(first));

  while (placedRing.size < rings.length) {
    // next: the ring most fused to what is placed - on a side before a
    // bridge, a bridge before one touching at an atom (spiro)
    let next = -1;
    let nextRank = -Infinity;
    rings.forEach((r, i) => {
      if (placedRing.has(i)) return;
      const shared = r.filter((a) => pos.has(a)).length;
      if (!shared) return;
      const rank =
        (shared === 2 ? 1000 : shared > 2 ? 500 : 0) +
        (r.length === 6 ? 50 : 0) +
        (r.length < MACROCYCLE ? 20 : 0) -
        r.length;
      if (rank > nextRank) {
        nextRank = rank;
        next = i;
      }
    });
    if (next < 0) break;
    placeRing(rings[next], pos);
    placedRing.add(next);
  }
  return pos;
}

/**
 * Which corner of the macrocycle's shape each of its atoms takes (as a map
 * from the atom's place in the ring to the shape's). A zigzag's corners
 * alternate: one points out, with room for what hangs there; the next points
 * in, with room for nothing. So the atoms that carry something - a branch, a
 * ring fused on - take the corners that point out, the bare CH2s the ones
 * that point in: of every way round the shape, and either direction, the
 * one that leaves the least on corners pointing in.
 */
function macrocycleFit(
  mol: Molecule,
  ring: number[],
  shape: Point[],
  rings: number[][],
): (i: number) => number {
  const n = ring.length;
  let area = 0;
  for (let i = 0; i < n; i++) area += cross(shape[i], shape[(i + 1) % n]);
  const inward = shape.map((p, i) => {
    const prev = shape[(i - 1 + n) % n];
    const next = shape[(i + 1) % n];
    // a turn against the way round is a corner pointing in
    return Math.sign(cross(sub(p, prev), sub(next, p))) * Math.sign(area) < 0;
  });
  const inRing = new Set(ring);
  // how much hangs off each atom of the ring, a few atoms deep
  const load = ring.map((a) => {
    let weight = 0;
    for (const b of mol.neighbours[a]) {
      if (inRing.has(b)) continue;
      const seen = new Set([a, b]);
      const todo = [b];
      while (todo.length && seen.size < 8) {
        const u = todo.pop()!;
        for (const v of mol.neighbours[u]) {
          if (!seen.has(v) && !inRing.has(v)) {
            seen.add(v);
            todo.push(v);
          }
        }
      }
      weight += 1 + 0.5 * (seen.size - 2);
    }
    // a ring fused on this atom needs room outside too
    if (rings.some((r) => r !== ring && r.includes(a))) weight += 3;
    return weight;
  });
  let best = { shift: 0, way: 1 };
  let bestCost = Infinity;
  for (const way of [1, -1]) {
    for (let shift = 0; shift < n; shift++) {
      let cost = 0;
      for (let i = 0; i < n; i++) {
        if (inward[(((shift + way * i) % n) + n) % n]) cost += load[i];
      }
      if (cost < bestCost - 1e-9) {
        bestCost = cost;
        best = { shift, way };
      }
    }
  }
  return (i) => (((best.shift + best.way * i) % n) + n) % n;
}

/** Places the atoms of a ring not yet placed, given those that are. */
function placeRing(ring: number[], pos: Map<number, Point>): void {
  const n = ring.length;
  const placed = ring.map((a) => pos.has(a));
  const count = placed.filter(Boolean).length;
  if (count === 1) {
    placeSpiro(ring, pos);
    return;
  }
  // the runs of unplaced atoms, each between two placed ones
  for (let i = 0; i < n; i++) {
    if (!placed[i] || placed[(i + 1) % n]) continue;
    const run: number[] = [];
    let j = (i + 1) % n;
    while (!placed[j]) {
      run.push(ring[j]);
      j = (j + 1) % n;
    }
    placeRun(ring[i], ring[j], run, n, pos);
  }
}

/** A ring touching what is placed at one atom: set on the far side of it. */
function placeSpiro(ring: number[], pos: Map<number, Point>): void {
  const n = ring.length;
  const i0 = ring.findIndex((a) => pos.has(a));
  const at = pos.get(ring[i0])!;
  // the way out from the atom: away from the placed atoms near it
  const near = [...pos.entries()].filter(([a, p]) => a !== ring[i0] && dist(p, at) < 1.5);
  const taken = near.map(([, p]) => angleOf(sub(p, at)));
  const [out] = splitWidestGap(taken, 1);
  const r = radius(n);
  const c = add(at, scale(dir(out), r));
  const start = out + Math.PI; // the shared atom, seen from the centre
  for (let k = 1; k < n; k++) {
    pos.set(ring[(i0 + k) % n], add(c, scale(dir(start - (k * 2 * Math.PI) / n), r)));
  }
}

/**
 * Places `run`, the atoms of an `n`-membered ring between placed atoms `from`
 * and `to`, on an arc of the ring's regular polygon between them - of the
 * four such arcs (two circles, the short way round or the long), the one
 * whose bonds come nearest 1 and that keeps clear of what is placed.
 */
function placeRun(from: number, to: number, run: number[], n: number, pos: Map<number, Point>): void {
  const a = pos.get(from)!;
  const b = pos.get(to)!;
  const d = dist(a, b);
  const steps = run.length + 1;
  let r = radius(n);
  if (d > 2 * r) r = d / 2;
  const mid = scale(add(a, b), 0.5);
  const across = norm({ x: -(b.y - a.y), y: b.x - a.x });
  // across a diameter (para atoms of a ring fused on two sides) the centre
  // is the midpoint itself: rounding must not move it off
  const h = d > 2 * r * (1 - 1e-6) ? 0 : Math.sqrt(Math.max(0, r * r - (d * d) / 4));
  const others = [...pos.entries()].filter(([k]) => k !== from && k !== to).map(([, p]) => p);
  const middle = others.length ? centroid(others) : mid;

  let best: Point[] | null = null;
  let bestCost = Infinity;
  for (const side of [1, -1]) {
    const c = add(mid, scale(across, side * h));
    const ta = angleOf(sub(a, c));
    const tb = angleOf(sub(b, c));
    for (const way of [1, -1]) {
      // from a to b going `way` round the circle
      let sweep = (tb - ta) * way;
      while (sweep <= 0) sweep += 2 * Math.PI;
      const pts: Point[] = [];
      for (let k = 1; k < steps; k++) pts.push(add(c, scale(dir(ta + (way * sweep * k) / steps), r)));
      const step = 2 * r * Math.sin(sweep / steps / 2);
      let cost = 40 * Math.abs(step - 1);
      for (const p of pts) {
        for (const o of others) {
          const dd = dist(p, o);
          if (dd < 0.55) cost += 100;
          else if (dd < 0.9) cost += 5 * (0.9 - dd);
        }
      }
      // outward, away from the middle of what is placed
      const bulge = centroid(pts);
      cost -= 0.5 * len(sub(bulge, middle));
      // a convex ring: the run on the far side of the line from the placed
      // atoms' middle
      const sideOfRun = Math.sign(cross(sub(b, a), sub(bulge, a)));
      const sideOfRest = Math.sign(cross(sub(b, a), sub(middle, a)));
      if (others.length && sideOfRun === sideOfRest) cost += 2;
      if (cost < bestCost) {
        bestCost = cost;
        best = pts;
      }
    }
  }
  run.forEach((atom, i) => pos.set(atom, best![i]));
}
