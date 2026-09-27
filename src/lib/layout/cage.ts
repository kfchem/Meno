/**
 * A cage - a ring system whose bridges will not lie flat inside its rings,
 * as adamantane's, cubane's or quinuclidine's will not - drawn the way it is
 * always drawn: as the solid it is, seen from the side that shows every
 * atom.
 *
 * The solid is found from the bonds alone: atoms a bond apart at 1, two
 * bonds apart at a tetrahedral 1.63, further apart further, placed in three
 * dimensions to fit those distances as well as they can (classical scaling,
 * then stress majorisation). Then it is looked at from many directions, and
 * the view kept is the one in which no atom hides another or sits on a bond,
 * the fewest bonds cross, and the bonds come out most nearly one length.
 */
import { segmentsCross, type Point } from "./geometry";
import type { Molecule, RingSystem } from "./perceive";

type Vec3 = [number, number, number];

/** Graph distances between the system's atoms, through its own bonds. */
function hops(mol: Molecule, atoms: number[]): number[][] {
  const index = new Map(atoms.map((a, i) => [a, i]));
  return atoms.map((s) => {
    const d = new Array<number>(atoms.length).fill(Infinity);
    d[index.get(s)!] = 0;
    const q = [s];
    for (let h = 0; h < q.length; h++) {
      const u = q[h];
      for (const v of mol.neighbours[u]) {
        const j = index.get(v);
        if (j == null || d[j] !== Infinity) continue;
        d[j] = d[index.get(u)!] + 1;
        q.push(v);
      }
    }
    return d;
  });
}

/** The distance two atoms `k` bonds apart keep in a cage. */
const span = (k: number) => (k === 0 ? 0 : k === 1 ? 1 : k === 2 ? 1.63 : 1.63 + 0.8 * (k - 2));

/** Three dimensions that fit the distances `D` best, by classical scaling. */
function classical(D: number[][]): Vec3[] {
  const n = D.length;
  const sq = D.map((row) => row.map((v) => v * v));
  const rowMean = sq.map((row) => row.reduce((s, v) => s + v, 0) / n);
  const all = rowMean.reduce((s, v) => s + v, 0) / n;
  const B = sq.map((row, i) => row.map((v, j) => -0.5 * (v - rowMean[i] - rowMean[j] + all)));
  const out: Vec3[] = Array.from({ length: n }, () => [0, 0, 0]);
  const found: number[][] = [];
  for (let k = 0; k < 3; k++) {
    // the next eigenvector by power iteration, the earlier ones taken out
    let v = Array.from({ length: n }, (_, i) => Math.sin(1 + i * (k + 1.7)));
    let value = 0;
    for (let it = 0; it < 200; it++) {
      let w = B.map((row) => row.reduce((s, b, j) => s + b * v[j], 0));
      for (const f of found) {
        const d = w.reduce((s, x, i) => s + x * f[i], 0);
        w = w.map((x, i) => x - d * f[i]);
      }
      const norm = Math.hypot(...w) || 1;
      value = norm;
      v = w.map((x) => x / norm);
    }
    found.push(v);
    const scale = Math.sqrt(Math.max(value, 0));
    v.forEach((x, i) => (out[i][k] = x * scale));
  }
  return out;
}

/** Stress majorisation: moves the points to fit `D`, weighting near pairs most. */
function majorise(X: Vec3[], D: number[][]): Vec3[] {
  const n = X.length;
  let P = X.map((p) => [...p] as Vec3);
  for (let it = 0; it < 300; it++) {
    const next: Vec3[] = [];
    for (let i = 0; i < n; i++) {
      const acc: Vec3 = [0, 0, 0];
      let wsum = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const w = 1 / (D[i][j] * D[i][j]);
        const dx = P[i][0] - P[j][0];
        const dy = P[i][1] - P[j][1];
        const dz = P[i][2] - P[j][2];
        const d = Math.hypot(dx, dy, dz) || 1e-9;
        const f = D[i][j] / d;
        acc[0] += w * (P[j][0] + f * dx);
        acc[1] += w * (P[j][1] + f * dy);
        acc[2] += w * (P[j][2] + f * dz);
        wsum += w;
      }
      next.push([acc[0] / wsum, acc[1] / wsum, acc[2] / wsum]);
    }
    P = next;
  }
  return P;
}

/** How badly a flat view reads: atoms hidden or on bonds, bonds crossing, bonds uneven. */
function viewCost(pts: Point[], bonds: [number, number][]): number {
  const lens = bonds.map(([a, b]) => Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y));
  const mean = lens.reduce((s, v) => s + v, 0) / lens.length;
  const spread = Math.sqrt(lens.reduce((s, v) => s + (v - mean) ** 2, 0) / lens.length) / mean;
  let cost = 20 * spread;
  for (const l of lens) if (l / mean < 0.55) cost += 5;
  const bonded = new Set(bonds.map(([a, b]) => `${Math.min(a, b)},${Math.max(a, b)}`));
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      if (bonded.has(`${i},${j}`)) continue;
      if (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) / mean < 0.45) cost += 10;
    }
    for (const [a, b] of bonds) {
      if (a === i || b === i) continue;
      const vx = pts[b].x - pts[a].x;
      const vy = pts[b].y - pts[a].y;
      const l2 = vx * vx + vy * vy;
      const t = l2 ? Math.max(0, Math.min(1, ((pts[i].x - pts[a].x) * vx + (pts[i].y - pts[a].y) * vy) / l2)) : 0;
      const d = Math.hypot(pts[i].x - (pts[a].x + t * vx), pts[i].y - (pts[a].y + t * vy));
      if (d / mean < 0.2) cost += 5;
    }
  }
  for (let i = 0; i < bonds.length; i++) {
    for (let j = i + 1; j < bonds.length; j++) {
      const [a, b] = bonds[i];
      const [c, d] = bonds[j];
      if (a === c || a === d || b === c || b === d) continue;
      if (segmentsCross(pts[a], pts[b], pts[c], pts[d])) cost += 2;
    }
  }
  return cost;
}

/**
 * The cage seen from its best side, in the ring system's atoms, bonds
 * scaled to about 1; and how well that view reads (lower better).
 */
export function projectCage(mol: Molecule, sys: RingSystem): { pos: Map<number, Point>; cost: number } {
  const atoms = sys.atoms;
  const index = new Map(atoms.map((a, i) => [a, i]));
  const bonds: [number, number][] = [];
  for (const [k] of mol.bondIndex) {
    const [a, b] = k.split(",").map(Number);
    if (index.has(a) && index.has(b)) bonds.push([index.get(a)!, index.get(b)!]);
  }
  const D = hops(mol, atoms).map((row) => row.map(span));
  const X = majorise(classical(D), D);

  let best: Point[] = [];
  let bestCost = Infinity;
  const views = 600;
  for (let k = 0; k < views; k++) {
    // directions spread evenly over the sphere
    const z = 1 - (2 * (k + 0.5)) / views;
    const r = Math.sqrt(1 - z * z);
    const t = k * Math.PI * (3 - Math.sqrt(5));
    const v: Vec3 = [r * Math.cos(t), r * Math.sin(t), z];
    // two directions square to it
    const helper: Vec3 = Math.abs(v[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const u1 = normalise(crossV(helper, v));
    const u2 = crossV(v, u1);
    const pts = X.map((p) => ({ x: dotV(p, u1), y: dotV(p, u2) }));
    const cost = viewCost(pts, bonds);
    if (cost < bestCost - 1e-9) {
      bestCost = cost;
      best = pts;
    }
  }
  const lens = bonds.map(([a, b]) => Math.hypot(best[a].x - best[b].x, best[a].y - best[b].y));
  const mean = lens.reduce((s, v) => s + v, 0) / lens.length;
  const pos = new Map<number, Point>();
  atoms.forEach((a, i) => pos.set(a, { x: best[i].x / mean, y: best[i].y / mean }));
  return { pos, cost: bestCost };
}

const dotV = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crossV = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalise = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** How badly a flat layout of a ring system reads, by the same measure. */
export function flatCost(mol: Molecule, sys: RingSystem, pos: Map<number, Point>): number {
  const atoms = sys.atoms;
  const index = new Map(atoms.map((a, i) => [a, i]));
  const bonds: [number, number][] = [];
  for (const [k] of mol.bondIndex) {
    const [a, b] = k.split(",").map(Number);
    if (index.has(a) && index.has(b)) bonds.push([index.get(a)!, index.get(b)!]);
  }
  return viewCost(
    atoms.map((a) => pos.get(a)!),
    bonds,
  );
}
