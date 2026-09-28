/**
 * The stereochemistry a drawing shows, read back out of it: each
 * stereocentre's configuration and the side each double bond's groups are
 * on, in the form the layout engine takes them (perceive.ts).
 *
 * - A centre drawn flat shows its configuration by its wedges: a neighbour
 *   on a wedge stands out of the page, one on hashes behind it (as
 *   `drawnVolume` reads it).
 * - A centre in a structure drawn in perspective - a cage, as the engine
 *   draws one - shows it by the drawing itself. Its atoms have a depth, so
 *   the bonds between them are known in three dimensions; a bond out of
 *   the cage points one of the ways the centre's other bonds leave free, and
 *   which one is read from the way it is drawn. Turn a substituent the other
 *   way - from one side of a chair to the other - and the configuration
 *   turns with it.
 * - A double bond's groups are on the side they are drawn on.
 */
import { freeCorners, solidOf } from "./cage";
import { key, perceive, type CisTrans } from "./perceive";
import { drawnVolume, placeStereo, type Stereo, type Tetrahedral } from "./stereo";

export type DrawnAtom = {
  x: number;
  y: number;
  /** What it is: C unless said, for where an H drawn beside it can go. */
  el?: string;
  /** Its depth where the structure is drawn in perspective: nearer the viewer is larger. */
  z?: number;
  /** Hydrogens it carries but are not drawn as atoms. */
  hs: number;
  /**
   * A stereocentre whose configuration the drawing shows without a wedge:
   * one in a structure drawn in perspective.
   */
  centre?: boolean;
};

export type DrawnBond = {
  a: number;
  b: number;
  order: number;
  /** A wedge (up) or hashes (down), narrow at `narrow`, the stereocentre. */
  wedge?: { narrow: number; stereo: "up" | "down" };
  /** A wavy bond: either configuration, so none is read at its ends. */
  either?: boolean;
};

export type DrawnStereo = {
  tetra: Map<number, Tetrahedral>;
  /** By bond index. */
  cisTrans: Map<number, CisTrans>;
};

type V3 = [number, number, number];
const sub3 = (p: V3, q: V3): V3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const dot3 = (p: V3, q: V3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const cross3 = (p: V3, q: V3): V3 => [
  p[1] * q[2] - p[2] * q[1],
  p[2] * q[0] - p[0] * q[2],
  p[0] * q[1] - p[1] * q[0],
];
const unit3 = (p: V3): V3 => {
  const l = Math.hypot(p[0], p[1], p[2]) || 1;
  return [p[0] / l, p[1] / l, p[2] / l];
};
const det3 = (p: V3, q: V3, r: V3) => dot3(p, cross3(q, r));

/** Half the tetrahedral angle, and how far a free bond leans off the bisector. */
const HALF_TETRAHEDRAL = Math.acos(-1 / 3) / 2;
/** How far out of the page a wedge is taken to stand, as a share of its length. */
const WEDGE_LIFT = 0.8;

export function readStereo(
  atoms: readonly DrawnAtom[],
  bonds: readonly DrawnBond[],
): DrawnStereo {
  const neighbours: number[][] = atoms.map(() => []);
  const bondOf = new Map<string, DrawnBond>();
  bonds.forEach((b) => {
    if (b.a === b.b || bondOf.has(key(b.a, b.b))) return;
    neighbours[b.a].push(b.b);
    neighbours[b.b].push(b.a);
    bondOf.set(key(b.a, b.b), b);
  });
  // how a bond out of a centre stands: +1 on a wedge, -1 on hashes, 0 in
  // the page (a wedge narrow at the other end says nothing about this one)
  const lift = (c: number, n: number) => {
    const w = bondOf.get(key(c, n))?.wedge;
    return w && w.narrow === c ? (w.stereo === "up" ? 1 : -1) : 0;
  };

  const fits = cageFits(atoms, bonds);
  const tetra = new Map<number, Tetrahedral>();
  atoms.forEach((atom, c) => {
    const around = neighbours[c];
    if (atom.hs > 1 || around.length + atom.hs !== 4) return;
    if (around.some((n) => bondOf.get(key(c, n))!.either)) return;
    const wedged = around.some((n) => lift(c, n) !== 0);
    if (!wedged && !atom.centre) return;
    const order = atom.hs ? [...around, -1] : around;
    const volume = atom.z != null ? volumeInSpace(atoms, c, around, lift, fits.get(c)) : 0;
    const v =
      volume ||
      drawnVolume(
        atom,
        order.map((n) => (n === -1 ? null : atoms[n])),
        order.map((n) => (n === -1 ? 0 : lift(c, n))),
      );
    if (v) tetra.set(c, { neighbours: order, volume: v > 0 ? 1 : -1 });
  });

  const cisTrans = new Map<number, CisTrans>();
  bonds.forEach((bond, i) => {
    if (bond.order !== 2 || bondOf.get(key(bond.a, bond.b)) !== bond) return;
    const { a, b } = bond;
    const ra = neighbours[a].find((n) => n !== b);
    const rb = neighbours[b].find((n) => n !== a);
    if (ra == null || rb == null) return;
    // a wavy bond at either end: either configuration
    if ([a, b].some((x) => neighbours[x].some((n) => bondOf.get(key(x, n))!.either))) return;
    const along = { x: atoms[b].x - atoms[a].x, y: atoms[b].y - atoms[a].y };
    const side = (r: number, from: number) => {
      const v = { x: atoms[r].x - atoms[from].x, y: atoms[r].y - atoms[from].y };
      const s = along.x * v.y - along.y * v.x;
      return Math.abs(s) < 1e-6 * (Math.hypot(along.x, along.y) * Math.hypot(v.x, v.y) || 1) ? 0 : Math.sign(s);
    };
    const sa = side(ra, a);
    const sb = side(rb, b);
    if (!sa || !sb) return;
    cisTrans.set(i, { refs: [ra, rb], cis: sa === sb });
  });

  return { tetra, cisTrans };
}

/**
 * A cage drawn in perspective, as the solid it is drawn from: the solid
 * the engine takes it to be (cage.ts), and the map that takes that solid to
 * where its atoms are drawn, their depth as the third coordinate - fitted,
 * as the engine may draw a cage the way textbooks do rather than exactly
 * as it is seen.
 */
type CageFit = { solid: Map<number, V3>; map: (v: V3) => V3 };

function cageFits(atoms: readonly DrawnAtom[], bonds: readonly DrawnBond[]): Map<number, CageFit> {
  const out = new Map<number, CageFit>();
  if (!atoms.some((a) => a.z != null)) return out;
  const mol = perceive({
    atoms: atoms.map((a) => ({ el: "C", hs: a.hs })),
    bonds: bonds.map(({ a, b, order }) => ({ a, b, order })),
  });
  for (const sys of mol.systems) {
    if (sys.atoms.length < 4 || sys.atoms.some((a) => atoms[a].z == null)) continue;
    const solid = solidOf(mol, sys);
    const map = fitLinear(
      sys.atoms.map((a) => solid.get(a)!),
      sys.atoms.map((a): V3 => [atoms[a].x, atoms[a].y, atoms[a].z!]),
    );
    if (!map) continue;
    const fit = { solid, map };
    for (const a of sys.atoms) out.set(a, fit);
  }
  return out;
}

/** The linear part of the affine map that best takes `from` to `to`, or null where `from` is flat. */
function fitLinear(from: readonly V3[], to: readonly V3[]): ((v: V3) => V3) | null {
  const n = from.length;
  const mean = (ps: readonly V3[]): V3 => [0, 1, 2].map((k) => ps.reduce((s, p) => s + p[k], 0) / n) as V3;
  const pf = mean(from);
  const pt = mean(to);
  const P = [0, 1, 2].map(() => [0, 0, 0]);
  const Q = [0, 1, 2].map(() => [0, 0, 0]);
  for (let i = 0; i < n; i++) {
    const p = sub3(from[i], pf);
    const q = sub3(to[i], pt);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        P[r][c] += p[r] * p[c];
        Q[r][c] += q[r] * p[c];
      }
    }
  }
  const d = det3(P[0] as V3, P[1] as V3, P[2] as V3);
  if (Math.abs(d) < 1e-9) return null;
  // P's inverse, by its cofactors (P is symmetric)
  const cof = (r: number, c: number) => {
    const [r1, r2] = [0, 1, 2].filter((k) => k !== r);
    const [c1, c2] = [0, 1, 2].filter((k) => k !== c);
    return ((r + c) % 2 ? -1 : 1) * (P[r1][c1] * P[r2][c2] - P[r1][c2] * P[r2][c1]);
  };
  const inv = [0, 1, 2].map((r) => [0, 1, 2].map((c) => cof(c, r) / d));
  const L = [0, 1, 2].map((r) => [0, 1, 2].map((c) => Q[r][0] * inv[0][c] + Q[r][1] * inv[1][c] + Q[r][2] * inv[2][c]));
  return (v) => [0, 1, 2].map((r) => L[r][0] * v[0] + L[r][1] * v[1] + L[r][2] * v[2]) as V3;
}

/**
 * The sign of the volume a perspective centre's first three bonds span, or
 * 0 where the drawing does not give enough of it in three dimensions. Bonds
 * to atoms with a depth are known; a wedge stands out of the page, hashes
 * behind it; the rest take the ways the known ones leave free, whichever
 * each is drawn nearer to - the ways the cage's solid leaves free, where
 * the centre is in one, as the drawing shows them.
 */
function volumeInSpace(
  atoms: readonly DrawnAtom[],
  c: number,
  around: readonly number[],
  lift: (c: number, n: number) => number,
  fit?: CageFit,
): number {
  const at: V3 = [atoms[c].x, atoms[c].y, atoms[c].z!];
  const dirs = new Map<number, V3>();
  const unknown: number[] = [];
  for (const n of around) {
    const p = atoms[n];
    const flat: V3 = [p.x - at[0], p.y - at[1], 0];
    const l = lift(c, n);
    const inCage = fit ? fit.solid.has(n) : p.z != null;
    if (inCage && !l) dirs.set(n, sub3([p.x, p.y, p.z!], at));
    else if (l) dirs.set(n, [flat[0], flat[1], l * WEDGE_LIFT * Math.hypot(flat[0], flat[1])]);
    else unknown.push(n);
  }
  if (dirs.size < 2) return 0;
  if (unknown.length) {
    let free: V3[];
    if (fit) {
      // the solid's free corners at the centre, as the drawing shows them
      const s = fit.solid.get(c)!;
      const us = around.filter((n) => fit.solid.has(n)).map((n) => unit3(sub3(fit.solid.get(n)!, s)));
      if (us.length < 2) return 0;
      free = freeCorners(us).map((corner) => fit.map(corner));
    } else if (dirs.size >= 3) {
      free = [unit3([...dirs.values()].reduce((s, u) => sub3(s, unit3(u)), [0, 0, 0] as V3))];
    } else {
      const [u1, u2] = [...dirs.values()].map(unit3);
      const mid = unit3([-(u1[0] + u2[0]), -(u1[1] + u2[1]), -(u1[2] + u2[2])]);
      const across = unit3(cross3(u1, u2));
      const c0 = Math.cos(HALF_TETRAHEDRAL);
      const s0 = Math.sin(HALF_TETRAHEDRAL);
      free = [1, -1].map((s): V3 => [
        mid[0] * c0 + s * across[0] * s0,
        mid[1] * c0 + s * across[1] * s0,
        mid[2] * c0 + s * across[2] * s0,
      ]);
    }
    // how near a free way is to where a bond is drawn, seen from the front
    const fitTo = (n: number, d: V3) => {
      const p = atoms[n];
      const vx = p.x - at[0];
      const vy = p.y - at[1];
      const lv = Math.hypot(vx, vy) || 1;
      const ld = Math.hypot(d[0], d[1]);
      return ld < 1e-9 ? 0 : (vx * d[0] + vy * d[1]) / (lv * ld);
    };
    if (unknown.length === 1) {
      const [n] = unknown;
      dirs.set(n, free.reduce((best, d) => (fitTo(n, d) > fitTo(n, best) ? d : best)));
    } else if (unknown.length === 2 && free.length === 2) {
      const [m, n] = unknown;
      const straight = fitTo(m, free[0]) + fitTo(n, free[1]);
      const crossed = fitTo(m, free[1]) + fitTo(n, free[0]);
      dirs.set(m, straight >= crossed ? free[0] : free[1]);
      dirs.set(n, straight >= crossed ? free[1] : free[0]);
    } else {
      return 0;
    }
  }
  const [p, q, r] = around.slice(0, 3).map((n) => unit3(dirs.get(n)!));
  const d = det3(p, q, r);
  return Math.abs(d) < 1e-6 ? 0 : Math.sign(d);
}

/**
 * What a drawing that shows some of its stereochemistry in perspective
 * needs to say it to a reader that knows only wedges - a MOL file, RDKit,
 * another program: a wedge on a bond out of each centre the perspective
 * shows (and an H, where the centre has no other bond to put it on, drawn
 * where the engine would), read as flat. A centre with a wedge of its own
 * says it already. The drawing is left as it is.
 */
export function wedgesForFlat(atoms: readonly DrawnAtom[], bonds: readonly DrawnBond[]): Stereo {
  const { tetra } = readStereo(atoms, bonds);
  const wedged = new Set(bonds.flatMap((b) => (b.wedge ? [b.wedge.narrow] : [])));
  const shown = new Map([...tetra].filter(([c]) => atoms[c].z != null && !wedged.has(c)));
  if (!shown.size) return { wedges: [], hydrogens: [] };
  const mol = perceive({
    atoms: atoms.map((a) => ({ el: a.el ?? "C", hs: a.hs })),
    bonds: bonds.map(({ a, b, order }) => ({ a, b, order })),
  });
  // (placed as the engine places them, at its bond length of 1)
  const lengths = bonds.map(({ a, b }) => Math.hypot(atoms[a].x - atoms[b].x, atoms[a].y - atoms[b].y)).sort((p, q) => p - q);
  const k = lengths[lengths.length >> 1] || 1;
  const pos = new Map(atoms.map((a, i) => [i, { x: a.x / k, y: a.y / k }]));
  const { wedges, hydrogens } = placeStereo(mol, pos, shown);
  return { wedges, hydrogens: hydrogens.map(({ on, at }) => ({ on, at: { x: at.x * k, y: at.y * k } })) };
}

/**
 * Whether two readings of a centre say the same: the same neighbours, in
 * orders an even number of swaps apart with the same volume, or an odd
 * number with the opposite one. Neighbours are matched through `as` where
 * one reading names an atom the other counts as its implicit H (-1).
 */
export function sameConfiguration(
  p: Tetrahedral,
  q: Tetrahedral,
  as: (n: number) => number = (n) => n,
): boolean {
  const a = p.neighbours.map(as);
  const b = q.neighbours.map(as);
  if (a.length !== b.length || a.some((n) => !b.includes(n))) return false;
  const perm = a.map((n) => b.indexOf(n));
  let swaps = 0;
  const seen = perm.map(() => false);
  for (let i = 0; i < perm.length; i++) {
    let len = 0;
    for (let j = i; !seen[j]; j = perm[j]) {
      seen[j] = true;
      len++;
    }
    if (len) swaps += len - 1;
  }
  return (swaps % 2 === 0) === (p.volume === q.volume);
}
