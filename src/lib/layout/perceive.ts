/**
 * What the layout engine needs to know about a molecule before it places
 * anything: who is bonded to whom, the rings, and the ring systems - rings
 * sharing an atom or more, laid out together as one piece.
 */
import { smallestRings } from "./rings";
import type { Tetrahedral } from "./stereo";

export type CisTrans = {
  /** An atom on each end of the double bond, each bonded to its end. */
  refs: readonly [number, number];
  /** Whether those two are on the same side. */
  cis: boolean;
};

export type LayoutAtom = {
  el: string;
  charge?: number;
  hs?: number;
  /** Its configuration, where it is a stereocentre. */
  tetra?: Tetrahedral;
};
export type LayoutBond = { a: number; b: number; order: number; stereo?: CisTrans };
export type LayoutInput = { atoms: readonly LayoutAtom[]; bonds: readonly LayoutBond[] };

export type RingSystem = {
  /** Its atoms, in no particular order. */
  atoms: number[];
  /** Indices into `Molecule.rings`. */
  rings: number[];
};

export type Molecule = {
  n: number;
  el: string[];
  hs: number[];
  charge: number[];
  bonds: readonly LayoutBond[];
  neighbours: number[][];
  /** The bond between two atoms, by `key(a, b)`. */
  bondIndex: Map<string, number>;
  rings: number[][];
  /** For each atom, the rings it is in. */
  ringsOf: number[][];
  systems: RingSystem[];
  /** For each atom, its ring system, or -1. */
  systemOf: number[];
  /** Bonds in a ring, by `key`. */
  ringBonds: Set<string>;
  /** Connected pieces (a salt's ions), as atom lists. */
  pieces: number[][];
  /** Each stereocentre's configuration, as given. */
  tetra: Map<number, Tetrahedral>;
};

export const key = (a: number, b: number): string => (a < b ? `${a},${b}` : `${b},${a}`);

export function perceive(input: LayoutInput): Molecule {
  const n = input.atoms.length;
  const neighbours: number[][] = Array.from({ length: n }, () => []);
  const bondIndex = new Map<string, number>();
  input.bonds.forEach(({ a, b }, i) => {
    if (a === b || bondIndex.has(key(a, b))) return;
    neighbours[a].push(b);
    neighbours[b].push(a);
    bondIndex.set(key(a, b), i);
  });
  const edges = [...bondIndex.keys()].map((k) => k.split(",").map(Number) as [number, number]);
  const rings = smallestRings(n, edges);
  const ringsOf: number[][] = Array.from({ length: n }, () => []);
  rings.forEach((r, i) => r.forEach((a) => ringsOf[a].push(i)));
  const ringBonds = new Set<string>();
  for (const r of rings) r.forEach((a, i) => ringBonds.add(key(a, r[(i + 1) % r.length])));

  // ring systems: rings sharing an atom, merged
  const systemOf = new Array<number>(n).fill(-1);
  const groupOf = rings.map((_, i) => i);
  const find = (i: number): number => (groupOf[i] === i ? i : (groupOf[i] = find(groupOf[i])));
  for (let a = 0; a < n; a++) {
    const rs = ringsOf[a];
    for (let i = 1; i < rs.length; i++) groupOf[find(rs[i])] = find(rs[0]);
  }
  const byGroup = new Map<number, RingSystem>();
  rings.forEach((r, i) => {
    const g = find(i);
    const sys = byGroup.get(g) ?? { atoms: [], rings: [] };
    sys.rings.push(i);
    for (const a of r) if (!sys.atoms.includes(a)) sys.atoms.push(a);
    byGroup.set(g, sys);
  });
  const systems = [...byGroup.values()];
  systems.forEach((s, i) => s.atoms.forEach((a) => (systemOf[a] = i)));

  const pieces: number[][] = [];
  const seen = new Array<boolean>(n).fill(false);
  for (let s = 0; s < n; s++) {
    if (seen[s]) continue;
    const piece = [s];
    seen[s] = true;
    for (let h = 0; h < piece.length; h++) {
      for (const b of neighbours[piece[h]]) {
        if (!seen[b]) {
          seen[b] = true;
          piece.push(b);
        }
      }
    }
    pieces.push(piece);
  }

  return {
    n,
    el: input.atoms.map((a) => a.el),
    hs: input.atoms.map((a) => a.hs ?? 0),
    charge: input.atoms.map((a) => a.charge ?? 0),
    bonds: input.bonds,
    neighbours,
    bondIndex,
    rings,
    ringsOf,
    systems,
    systemOf,
    ringBonds,
    pieces,
    tetra: new Map(
      input.atoms.flatMap((a, i): [number, Tetrahedral][] => (a.tetra ? [[i, a.tetra]] : [])),
    ),
  };
}

/** The order of the bond between two atoms, or 0. */
export function orderOf(mol: Molecule, a: number, b: number): number {
  const i = mol.bondIndex.get(key(a, b));
  return i == null ? 0 : mol.bonds[i].order;
}
