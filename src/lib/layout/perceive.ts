/**
 * What the layout engine needs to know about a molecule before it places
 * anything: who is bonded to whom, the rings, and the ring systems - rings
 * sharing an atom or more, laid out together as one piece.
 */
import { smallestRings } from "./rings";
import type { Axial, Tetrahedral } from "./stereo";

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
  /**
   * For a star ("*") at the centre of a pi system bound to a metal through
   * all its atoms (a haptic bond): the system's atoms.
   */
  pi?: readonly number[];
};
export type LayoutBond = { a: number; b: number; order: number; stereo?: CisTrans };
export type LayoutInput = {
  atoms: readonly LayoutAtom[];
  bonds: readonly LayoutBond[];
  /** Its axes of chirality (BINAP's), each shown by a wedge (stereo.ts). */
  axes?: readonly Axial[];
};

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
  /**
   * The rings bound face-on to a metal through all their atoms (η⁵-Cp,
   * η⁶-arene): each one's star - at its centre, a member of its ring
   * system - its ring in order round, and its metal (-1 for none).
   */
  eta: EtaRing[];
  /**
   * The metals in no ring with rings bound face-on, each with them as one
   * system (a sandwich, a half-sandwich): drawn as one, the metal at its
   * middle.
   */
  units: MetalUnit[];
  /**
   * Each atom's neighbours and, for a ring bound face-on and its star, each
   * other: what is moved with an atom - a side of a bond, a branch - goes
   * through a metal to its rings and on.
   */
  linked: number[][];
};

/** A ring bound face-on to a metal through all its atoms, as `Molecule.eta` has it. */
export type EtaRing = {
  star: number;
  ring: number[];
  metal: number;
  /** The atoms of its own ring system, and its star. */
  atoms: number[];
  /** The system it is drawn in: its own, or its metal's unit's. */
  system: number;
};

/** A metal and the rings bound face-on to it, drawn as one system. */
export type MetalUnit = { metal: number; eta: EtaRing[]; system: number };

export const key = (a: number, b: number): string => (a < b ? `${a},${b}` : `${b},${a}`);

export function perceive(input: LayoutInput): Molecule {
  const n = input.atoms.length;
  const neighbours: number[][] = Array.from({ length: n }, () => []);
  const bondIndex = new Map<string, number>();
  const bonds: LayoutBond[] = [...input.bonds];
  const join = (a: number, b: number, i: number) => {
    if (a === b || bondIndex.has(key(a, b))) return;
    neighbours[a].push(b);
    neighbours[b].push(a);
    bondIndex.set(key(a, b), i);
  };
  input.bonds.forEach(({ a, b }, i) => join(a, b, i));
  // A star's pi system: a ring of it (Cp, an arene) is drawn round it, the
  // star a member of the ring's system; any other (an alkene's C=C, an
  // allyl) hangs from it by a bond to its first atom, as a chain would
  const ringOfPi = new Map<number, number[]>();
  input.atoms.forEach((a, star) => {
    if (!a.pi || a.pi.length < 2) return;
    const cycle = cycleOf(a.pi, neighbours);
    if (cycle) ringOfPi.set(star, cycle);
    else {
      bonds.push({ a: star, b: a.pi[0], order: 1 });
      join(star, a.pi[0], bonds.length - 1);
    }
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
  // each ring bound face-on joined by its star, at its centre
  const eta: EtaRing[] = [];
  for (const [star, ring] of ringOfPi) {
    const system = systemOf[ring[0]];
    if (system < 0 || systemOf[star] >= 0) continue;
    systems[system].atoms.push(star);
    systemOf[star] = system;
    const metal = neighbours[star].find((m) => isMetal(input.atoms[m].el)) ?? -1;
    eta.push({ star, ring, metal, atoms: systems[system].atoms, system });
  }
  // and a metal in no ring with its rings bound face-on: one system
  const units: MetalUnit[] = [];
  for (let m = 0; m < n; m++) {
    const own = eta.filter((e) => e.metal === m);
    if (!own.length || systemOf[m] >= 0 || !isMetal(input.atoms[m].el)) continue;
    const merged = { atoms: [m, ...own.flatMap((e) => e.atoms)], rings: own.flatMap((e) => systems[e.system].rings) };
    const index = systems.length;
    systems.push(merged);
    for (const e of own) {
      systems[e.system] = { atoms: [], rings: [] };
      e.system = index;
    }
    for (const a of merged.atoms) systemOf[a] = index;
    units.push({ metal: m, eta: own, system: index });
  }
  // (the systems a unit took in, emptied, are left out)
  const kept = systems.map((sys, i) => (sys.atoms.length ? i : -1)).filter((i) => i >= 0);
  const renumber = new Map(kept.map((old, i) => [old, i]));
  systems.splice(0, systems.length, ...kept.map((i) => systems[i]));
  for (let a = 0; a < n; a++) if (systemOf[a] >= 0) systemOf[a] = renumber.get(systemOf[a])!;
  for (const e of eta) e.system = renumber.get(e.system)!;
  for (const u of units) u.system = renumber.get(u.system)!;

  const pieces: number[][] = [];
  const seen = new Array<boolean>(n).fill(false);
  for (let s = 0; s < n; s++) {
    if (seen[s]) continue;
    const piece = [s];
    seen[s] = true;
    for (let h = 0; h < piece.length; h++) {
      // (a ring bound face-on is the same piece as its star)
      const u = piece[h];
      const near = [...neighbours[u], ...(ringOfPi.get(u) ?? []), ...eta.filter((e) => e.ring.includes(u)).map((e) => e.star)];
      for (const b of near) {
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
    bonds,
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
    eta,
    units,
    linked: neighbours.map((nb, a) => [
      ...nb,
      ...(ringOfPi.get(a) ?? []),
      ...eta.filter((e) => e.ring.includes(a)).map((e) => e.star),
    ]),
  };
}

/**
 * How long a bond between a metal and a ligand's atom is drawn, in bond
 * lengths: longer, as it is (Pd-P 2.3 Å against C-C 1.5 Å), so that the
 * ligands round a metal have room (docs/LAYOUT-2D.md, section 7).
 */
export const METAL_BOND = 1.4;

/**
 * The metals: the d block and the lanthanides, as a complex's formula has
 * them (chem/ligands) - Pr aside, being propyl's label as well.
 */
const METALS = new Set(
  "Sc Ti V Cr Mn Fe Co Ni Cu Zn Y Zr Nb Mo Tc Ru Rh Pd Ag Cd Hf Ta W Re Os Ir Pt Au Hg La Ce Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu".split(" "),
);

/** Whether an atom is a metal's: one ligands are drawn round (docs/LAYOUT-2D.md, section 7). */
export function isMetal(el: string): boolean {
  return METALS.has(el);
}

/**
 * The atoms of a pi system in order round, where they make a ring by
 * their own bonds (Cp, an arene), or null (an alkene's two, an allyl's
 * three).
 */
function cycleOf(atoms: readonly number[], neighbours: number[][]): number[] | null {
  if (atoms.length < 3) return null;
  const inside = new Set(atoms);
  const near = (a: number) => neighbours[a].filter((b) => inside.has(b));
  if (atoms.some((a) => near(a).length !== 2)) return null;
  const order = [atoms[0]];
  let prev = -1;
  while (order.length < atoms.length) {
    const at = order[order.length - 1];
    const next = near(at).find((b) => b !== prev && !order.includes(b));
    if (next == null) return null;
    prev = at;
    order.push(next);
  }
  return near(order[order.length - 1]).includes(order[0]) ? order : null;
}

/** The order of the bond between two atoms, or 0. */
export function orderOf(mol: Molecule, a: number, b: number): number {
  const i = mol.bondIndex.get(key(a, b));
  return i == null ? 0 : mol.bonds[i].order;
}
