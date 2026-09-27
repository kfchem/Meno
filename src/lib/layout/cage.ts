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

/**
 * The solid as it really is: bonds 1, atoms two bonds apart at a
 * tetrahedral 1.63, and nothing else nearer than 1.9 - eased in from the
 * rough placement until those hold.
 */
function settle(X: Vec3[], hop: number[][]): Vec3[] {
  const n = X.length;
  const P = X.map((p) => [...p] as Vec3);
  const pull = (i: number, j: number, target: number, k: number, onlyApart: boolean) => {
    const d: Vec3 = [P[j][0] - P[i][0], P[j][1] - P[i][1], P[j][2] - P[i][2]];
    const l = Math.hypot(...d) || 1e-9;
    if (onlyApart && l >= target) return;
    const f = ((l - target) / l) * 0.5 * k;
    for (let c = 0; c < 3; c++) {
      P[i][c] += d[c] * f;
      P[j][c] -= d[c] * f;
    }
  };
  for (let it = 0; it < 400; it++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const h = hop[i][j];
        if (h === 1) pull(i, j, 1, 1, false);
        else if (h === 2) pull(i, j, 1.633, 0.6, false);
        else pull(i, j, 1.9, 0.3, true);
      }
    }
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
      if (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) / mean < 0.6) cost += 10;
    }
    for (const [a, b] of bonds) {
      if (a === i || b === i) continue;
      const vx = pts[b].x - pts[a].x;
      const vy = pts[b].y - pts[a].y;
      const l2 = vx * vx + vy * vy;
      const t = l2 ? Math.max(0, Math.min(1, ((pts[i].x - pts[a].x) * vx + (pts[i].y - pts[a].y) * vy) / l2)) : 0;
      const d = Math.hypot(pts[i].x - (pts[a].x + t * vx), pts[i].y - (pts[a].y + t * vy));
      if (d / mean < 0.3) cost += 5;
    }
  }
  for (let i = 0; i < bonds.length; i++) {
    for (let j = i + 1; j < bonds.length; j++) {
      const [a, b] = bonds[i];
      const [c, d] = bonds[j];
      if (a === c || a === d || b === c || b === d) continue;
      // a bond passing behind another is drawn broken there, which reads
      if (segmentsCross(pts[a], pts[b], pts[c], pts[d])) cost += 1;
    }
  }
  return cost;
}

/**
 * The cage seen from its best side, in the ring system's atoms, bonds
 * scaled to about 1; and how well that view reads (lower better).
 */
export type CageView = {
  pos: Map<number, Point>;
  /**
   * Where each bond out of the cage points, as seen: the neighbour's place
   * at a bond's length, in the same frame - the solid's own tetrahedral
   * directions, the stereocentres' as their configuration puts them.
   */
  hints: Map<number, Map<number, Point>>;
  /** How near each atom is to the viewer: a bond passing behind another is broken there. */
  depth: Map<number, number>;
  cost: number;
};

/**
 * The bridged bicycle's own view, the way it is always drawn - norbornane,
 * camphor, tropane, quinuclidine: the two bridgeheads level, the shortest
 * bridge on top, the other two in front and behind, seen from a little
 * above and a little to one side. Null if the system is not a bicycle.
 */
function bicycleAxes(mol: Molecule, sys: RingSystem, X: Vec3[], index: Map<number, number>) {
  if (sys.rings.length !== 2) return null;
  const [r1, r2] = sys.rings.map((i) => mol.rings[i]);
  const shared = r1.filter((a) => r2.includes(a));
  if (shared.length < 3) return null;
  const ends = shared.filter((a) => mol.neighbours[a].filter((b) => shared.includes(b)).length === 1);
  if (ends.length !== 2) return null;
  const bridges = [
    shared.filter((a) => !ends.includes(a)),
    r1.filter((a) => !shared.includes(a)),
    r2.filter((a) => !shared.includes(a)),
  ].sort((p, q) => p.length - q.length);
  const at = (a: number) => X[index.get(a)!];
  const b1 = at(ends[0]);
  const b2 = at(ends[1]);
  const mid: Vec3 = [(b1[0] + b2[0]) / 2, (b1[1] + b2[1]) / 2, (b1[2] + b2[2]) / 2];
  const e1 = normalise([b2[0] - b1[0], b2[1] - b1[1], b2[2] - b1[2]]);
  const top = bridges[0].map(at);
  const c: Vec3 = [0, 1, 2].map((k) => top.reduce((sum, p) => sum + p[k], 0) / top.length - mid[k]) as Vec3;
  const along = dotV(c, e1);
  const e3 = normalise([c[0] - along * e1[0], c[1] - along * e1[1], c[2] - along * e1[2]]);
  const e2 = crossV(e3, e1);
  return { e1, e2, e3 };
}

/** The view along `toViewer`, the screen's up as near `up` as it can be. */
function look(
  X: Vec3[],
  toViewer: Vec3,
  up: Vec3,
): { pts: Point[]; depth: number[]; toViewer: Vec3; up: Vec3 } {
  const k = dotV(up, toViewer);
  const sy = normalise([up[0] - k * toViewer[0], up[1] - k * toViewer[1], up[2] - k * toViewer[2]]);
  const sx = crossV(sy, toViewer);
  return {
    pts: X.map((p) => ({ x: dotV(p, sx), y: dotV(p, sy) })),
    depth: X.map((p) => dotV(p, toViewer)),
    toViewer,
    up: sy,
  };
}

/** The solid a cage system is taken to be: its atoms' places in three dimensions. */
export function solidOf(mol: Molecule, sys: RingSystem): Map<number, Vec3> {
  const index = new Map(sys.atoms.map((a, i) => [a, i]));
  const hop = hops(mol, sys.atoms);
  const D = hop.map((row) => row.map(span));
  let X = settle(majorise(classical(D), D), hop);
  if (handedness(mol, sys.atoms, index, X) < 0) X = X.map(([x, y, z]) => [x, y, -z] as Vec3);
  return new Map(sys.atoms.map((a, i) => [a, X[i]]));
}

export function projectCage(mol: Molecule, sys: RingSystem): CageView {
  const atoms = sys.atoms;
  const index = new Map(atoms.map((a, i) => [a, i]));
  const bonds: [number, number][] = [];
  for (const [k] of mol.bondIndex) {
    const [a, b] = k.split(",").map(Number);
    if (index.has(a) && index.has(b)) bonds.push([index.get(a)!, index.get(b)!]);
  }
  const hop = hops(mol, atoms);
  const D = hop.map((row) => row.map(span));
  let X = settle(majorise(classical(D), D), hop);
  // the solid is found from distances, which cannot tell a shape from its
  // mirror image: the one whose stereocentres are as given is taken
  if (handedness(mol, atoms, index, X) < 0) X = X.map(([x, y, z]) => [x, y, -z] as Vec3);

  let best: Point[] = [];
  let bestDepth: number[] = [];
  let bestCost = Infinity;
  let bestView: Vec3 = [0, 0, 1];
  let bestUp: Vec3 = [0, 1, 0];
  const consider = (view: { pts: Point[]; depth: number[]; toViewer: Vec3; up: Vec3 }, bias = 0) => {
    const cost = viewCost(view.pts, bonds) + bias;
    if (cost < bestCost - 1e-9) {
      bestCost = cost;
      best = view.pts;
      bestDepth = view.depth;
      bestView = view.toViewer;
      bestUp = view.up;
    }
  };
  // Every six-membered ring of the solid seen the way a chair or a boat is
  // always drawn: its mean plane edge on from a little above, two of its
  // opposite atoms the ends, left and right - the textbook chair, from
  // which cages (adamantane is four of them) are drawn.
  for (const r of sys.rings.map((i) => mol.rings[i]).filter((r) => r.length === 6)) {
    const P = r.map((a) => X[index.get(a)!]);
    const c: Vec3 = [0, 1, 2].map((k) => P.reduce((sum, p) => sum + p[k], 0) / 6) as Vec3;
    // the mean plane's normal, from the ring's turn
    let nrm: Vec3 = [0, 0, 0];
    for (let i = 0; i < 6; i++) {
      const u: Vec3 = [P[i][0] - c[0], P[i][1] - c[1], P[i][2] - c[2]];
      const v: Vec3 = [P[(i + 1) % 6][0] - c[0], P[(i + 1) % 6][1] - c[1], P[(i + 1) % 6][2] - c[2]];
      const w = crossV(u, v);
      nrm = [nrm[0] + w[0], nrm[1] + w[1], nrm[2] + w[2]];
    }
    nrm = normalise(nrm);
    for (let i = 0; i < 3; i++) {
      const d: Vec3 = [P[i + 3][0] - P[i][0], P[i + 3][1] - P[i][1], P[i + 3][2] - P[i][2]];
      const k = dotV(d, nrm);
      const e1 = normalise([d[0] - k * nrm[0], d[1] - k * nrm[1], d[2] - k * nrm[2]]);
      const e2 = crossV(nrm, e1);
      for (const up of [1, -1]) {
        for (const front of [1, -1]) {
          for (const elev of [15, 20, 25]) {
            const ce = Math.cos((elev * Math.PI) / 180);
            const se = Math.sin((elev * Math.PI) / 180);
            const n2: Vec3 = [nrm[0] * up, nrm[1] * up, nrm[2] * up];
            const toViewer = normalise([0, 1, 2].map((j) => ce * front * e2[j] + se * n2[j]) as Vec3);
            consider(look(X, toViewer, n2), 0.02 * Math.abs(elev - 20));
          }
        }
      }
    }
  }
  // A cage with an atom on an axis of its symmetry - adamantane's
  // bridgeheads, cubane's corners - seen along that axis, tilted a little
  // so nothing hides behind: the hexagon with a Y inside that it always is.
  if (sys.rings.length >= 3) {
    const c: Vec3 = [0, 1, 2].map((k) => X.reduce((sum, p) => sum + p[k], 0) / X.length) as Vec3;
    for (let i = 0; i < X.length; i++) {
      const axis = normalise([X[i][0] - c[0], X[i][1] - c[1], X[i][2] - c[2]]);
      const helper: Vec3 = Math.abs(axis[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
      const p1 = normalise(crossV(axis, helper));
      const p2 = crossV(axis, p1);
      for (const tilt of [8, 12, 16]) {
        for (let k = 0; k < 6; k++) {
          const t = (tilt * Math.PI) / 180;
          const phi = (k * Math.PI) / 3;
          const side: Vec3 = [0, 1, 2].map((j) => Math.cos(phi) * p1[j] + Math.sin(phi) * p2[j]) as Vec3;
          const toViewer = normalise([0, 1, 2].map((j) => Math.cos(t) * axis[j] + Math.sin(t) * side[j]) as Vec3);
          consider(look(X, toViewer, side), 0.02 * Math.abs(tilt - 12));
        }
      }
    }
  }
  // a textbook view - a chair, a boat, down an axis - that hides no atom is
  // taken as it is: that is how the cage is drawn, even where some other
  // view crosses fewer bonds
  const textbook = bestCost < 10;
  const axes = bicycleAxes(mol, sys, X, index);
  if (textbook) {
    // (kept)
  } else if (axes) {
    const { e1, e2, e3 } = axes;
    for (const elev of [15, 20, 25, 30, 40]) {
      for (const az of [0, 10, -10, 20, -20, 30, -30]) {
        const ce = Math.cos((elev * Math.PI) / 180);
        const se = Math.sin((elev * Math.PI) / 180);
        const ca = Math.cos((az * Math.PI) / 180);
        const sa = Math.sin((az * Math.PI) / 180);
        const toViewer = normalise([0, 1, 2].map((i) => ce * (ca * e2[i] + sa * e1[i]) + se * e3[i]) as Vec3);
        // a little above and to the side reads best; straight on hides the back
        consider(look(X, toViewer, e3), 0.02 * Math.abs(elev - 25) + 0.01 * Math.abs(Math.abs(az) - 15));
      }
    }
  } else {
    const views = 600;
    for (let k = 0; k < views; k++) {
      // directions spread evenly over the sphere
      const z = 1 - (2 * (k + 0.5)) / views;
      const r = Math.sqrt(1 - z * z);
      const t = k * Math.PI * (3 - Math.sqrt(5));
      const v: Vec3 = [r * Math.cos(t), r * Math.sin(t), z];
      const helper: Vec3 = Math.abs(v[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
      consider(look(X, v, helper));
    }
  }
  const lens = bonds.map(([a, b]) => Math.hypot(best[a].x - best[b].x, best[a].y - best[b].y));
  const mean = lens.reduce((s, v) => s + v, 0) / lens.length;
  const pos = new Map<number, Point>();
  const depth = new Map<number, number>();
  atoms.forEach((a, i) => {
    pos.set(a, { x: best[i].x / mean, y: best[i].y / mean });
    depth.set(a, bestDepth[i] / mean);
  });
  // the bonds out, placed in the solid and seen from the same side
  const hints = new Map<number, Map<number, Point>>();
  const toViewer = bestView;
  const sy = bestUp;
  const sx = crossV(sy, toViewer);
  atoms.forEach((a, i) => {
    const out = mol.neighbours[a].filter((b) => !index.has(b));
    if (!out.length) return;
    const dirs = outward(mol, a, i, X, index, out);
    const m = new Map<number, Point>();
    out.forEach((b, k) => {
      const d = dirs[k];
      const flat = { x: dotV(d, sx), y: dotV(d, sy) };
      const l = Math.hypot(flat.x, flat.y) || 1;
      // seen end on, a bond still shows at half its length
      const shown = Math.max(0.5, l);
      m.set(b, {
        x: pos.get(a)!.x + (flat.x / l) * shown,
        y: pos.get(a)!.y + (flat.y / l) * shown,
      });
    });
    hints.set(a, m);
  });
  return { pos, depth, hints, cost: bestCost };
}

/**
 * Whether the solid's stereocentres at its bridgeheads - those whose four
 * bonds the cage itself fixes, three of them inside it - are as their
 * configurations say (+1), the mirror image (-1), or have none to say (0).
 */
function handedness(mol: Molecule, atoms: number[], index: Map<number, number>, X: Vec3[]): number {
  let vote = 0;
  atoms.forEach((a, i) => {
    const t = mol.tetra.get(a);
    if (!t) return;
    const inside = mol.neighbours[a].filter((b) => index.has(b));
    if (inside.length < 3) return;
    const out = mol.neighbours[a].filter((b) => !index.has(b));
    const dirs = outward(mol, a, i, X, index, out);
    const v = t.neighbours.slice(0, 3).map((n): Vec3 => {
      if (index.has(n)) {
        const q = X[index.get(n)!];
        return [q[0] - X[i][0], q[1] - X[i][1], q[2] - X[i][2]];
      }
      const k = out.indexOf(n);
      return k >= 0 ? dirs[k] : dirs[0];
    });
    const vol = dotV(v[0], crossV(v[1], v[2]));
    vote += Math.sign(vol) === t.volume ? 1 : -1;
  });
  return Math.sign(vote);
}

/**
 * The directions, in the solid, of an atom's bonds out of the cage: the
 * tetrahedron's free corners (or, beside a double bond, the plane's), the
 * one a stereocentre's configuration asks for where there is a choice.
 */
function outward(
  mol: Molecule,
  a: number,
  i: number,
  X: Vec3[],
  index: Map<number, number>,
  out: number[],
): Vec3[] {
  const inside = mol.neighbours[a].filter((b) => index.has(b));
  const unit = (b: number): Vec3 => {
    const q = X[index.get(b)!];
    return normalise([q[0] - X[i][0], q[1] - X[i][1], q[2] - X[i][2]]);
  };
  const us = inside.map(unit);
  const sum: Vec3 = [0, 1, 2].map((c) => us.reduce((s, u) => s + u[c], 0)) as Vec3;
  const away = normalise([-sum[0], -sum[1], -sum[2]]);
  if (us.length >= 3 || us.length < 2) return out.map(() => away);
  // two bonds in the cage: the two free corners either side of their plane
  const across = normalise(crossV(us[0], us[1]));
  const k = Math.cos((54.75 * Math.PI) / 180);
  const j = Math.sin((54.75 * Math.PI) / 180);
  const corners: Vec3[] = [
    [0, 1, 2].map((c) => away[c] * k + across[c] * j) as Vec3,
    [0, 1, 2].map((c) => away[c] * k - across[c] * j) as Vec3,
  ];
  const double = out.some((b) => {
    const bi = mol.bondIndex.get(a < b ? `${a},${b}` : `${b},${a}`);
    return bi != null && mol.bonds[bi].order === 2;
  });
  if (double) return out.map(() => away);
  if (out.length >= 2) return out.map((_, k2) => corners[k2 % 2]);
  // one bond out and an H: the corner the configuration asks for
  const t = mol.tetra.get(a);
  if (!t) return [away];
  const at = (n: number, corner: Vec3): Vec3 =>
    n === out[0] ? corner : n === -1 ? [0, 1, 2].map((c) => -corner[c] + 2 * away[c] * k) as Vec3 : unit(n);
  for (const corner of corners) {
    const other = corners.find((c) => c !== corner)!;
    const v = t.neighbours.slice(0, 3).map((n) => (n === -1 ? other : at(n, corner)));
    const vol = dotV(v[0], crossV(v[1], v[2]));
    if (Math.sign(vol) === t.volume) return [corner];
  }
  return [away];
}

/** Whether a ring system is a small bridged bicycle - norbornane, tropane, quinuclidine - drawn in perspective. */
export function isSmallBicycle(mol: Molecule, sys: RingSystem): boolean {
  if (sys.rings.length !== 2) return false;
  const [r1, r2] = sys.rings.map((i) => mol.rings[i]);
  return r1.filter((a) => r2.includes(a)).length >= 3 && Math.max(r1.length, r2.length) <= 7;
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
