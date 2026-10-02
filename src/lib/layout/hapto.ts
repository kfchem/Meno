/**
 * A ring bound face-on to a metal through all its atoms - η⁵-Cp, Cp*,
 * η⁶-benzene, p-cymene - drawn as it is seen (docs/LAYOUT-2D.md, section
 * 7): the metal on the ring's axis, a bond from its centre, and the ring
 * seen from a little above its plane, so that it is foreshortened across
 * the axis - a flattened polygon - its near half drawn bold. What hangs from
 * the ring lies in its plane, pointing out from its centre.
 *
 * In the ring's own frame its centre (the star) is at the origin and its
 * metal along +y. A ring can be spun about its axis: where its first
 * substituent points is a free choice, each one tried (`etaSpins`), as a
 * macrocycle's shapes are.
 */
import { add, angleOf, centroid, dir, rotate, sub, type Point } from "./geometry";
import type { EtaRing, MetalUnit, Molecule } from "./perceive";
import { placeRingSystem } from "./ringSystem";

/**
 * Seen from a little above its plane, a ring is drawn this much as deep as
 * it is wide: the sine of the angle it is seen at (about 24 degrees).
 */
export const FORESHORTEN = 0.4;

/** How far a ring's centre is from its metal, in bond lengths. */
export const TO_METAL = 1;

/**
 * Where a ring's first substituent may point, round its plane from the side
 * its metal is not on: to either side, or away from the metal. (Not toward
 * the metal, where it would meet it.)
 */
const SPINS = [0, Math.PI, -Math.PI / 2];

/** How far a bent metallocene's rings lean from the line through its metal, away from its other ligands. */
const BENT = Math.PI / 9;

/**
 * The ways a metal's ligands go (docs/LAYOUT-2D.md, section 7), round from
 * the first ring's: two rings bound face-on opposite each other - leaning a
 * little away from any others, between them to one side; one ring, the rest
 * opposite it, spread as a stool's legs; no ring, all of them evenly round.
 * For each, whether it is a ring's.
 */
export function metalSlots(rings: number, others: number): { angle: number; ring: boolean }[] {
  const ring = (angle: number) => ({ angle, ring: true });
  const other = (angle: number) => ({ angle, ring: false });
  const spread = (centre: number, n: number, step: number) =>
    Array.from({ length: n }, (_, i) => other(centre + (i - (n - 1) / 2) * step));
  if (rings === 2) {
    const lean = others ? BENT : 0;
    return [ring(-lean), ring(Math.PI + lean), ...spread(Math.PI / 2, others, others === 2 ? Math.PI / 3 : Math.PI / 4)];
  }
  if (rings === 1) {
    const step = others <= 2 ? Math.PI / 2 : (2 * Math.PI) / 3 / (others - 1);
    return [ring(0), ...spread(Math.PI, others, step)];
  }
  const n = rings + others;
  return Array.from({ length: n }, (_, i) => ({ angle: (2 * Math.PI * i) / n, ring: i < rings }));
}

/** The ring system's atoms that hang from the ring by a bond, with the ring atom each hangs from. */
function hanging(mol: Molecule, eta: EtaRing): [number, number][] {
  const sys = new Set(eta.atoms);
  const out: [number, number][] = [];
  for (const a of eta.atoms) {
    if (a === eta.star) continue;
    for (const b of mol.neighbours[a]) if (!sys.has(b) && b !== eta.star) out.push([a, b]);
  }
  return out;
}

/** How many spins a ring bound face-on is tried in: one, where nothing hangs from its system. */
export function etaSpins(mol: Molecule, eta: EtaRing): number {
  return spinsOf(mol, eta).length;
}

/**
 * The spins a ring is tried in: of SPINS, those that keep what hangs from
 * it 60 degrees or more from its metal's side - or, where none does, those
 * that keep it furthest (Cp*'s methyls, a corner away from the metal): no
 * substituent drawn pointing at the metal where another spin would have
 * none. With nothing hanging from it, its one way: a corner away from the
 * metal for a ring of odd size, one to the side for an even one.
 */
function spinsOf(mol: Molecule, eta: EtaRing): number[] {
  const out = hanging(mol, eta);
  if (!out.length) return [eta.ring.length % 2 ? -Math.PI / 2 : 0];
  const own = eta.atoms.filter((a) => a !== eta.star);
  const rings = mol.rings.map((r, i) => (r.every((a) => own.includes(a)) ? i : -1)).filter((i) => i >= 0);
  const flat = placeRingSystem(mol, { atoms: own, rings });
  const c = centroid(eta.ring.map((a) => flat.get(a)!));
  const first = heaviest(mol, out);
  const toward = angleOf(sub(flat.get(first[0])!, c));
  const offsets = out.map(([a]) => angleOf(sub(flat.get(a)!, c)) - toward);
  // (the metal is along +y, at a quarter turn)
  const gap = (t: number) => Math.abs(Math.atan2(Math.sin(t - Math.PI / 2), Math.cos(t - Math.PI / 2)));
  const clear = SPINS.map((spin) => Math.min(...offsets.map((o) => gap(spin + o))));
  // (60 degrees clear is clear enough: dppf's P to either side, as well as away)
  const enough = Math.min(Math.max(...clear), Math.PI / 3);
  return SPINS.filter((_, k) => clear[k] >= enough - 1e-6);
}

/** The heaviest branch hanging from a ring, by how many atoms lie beyond it. */
function heaviest(mol: Molecule, out: [number, number][]): [number, number] {
  return [...out].sort((p, q) => beyond(mol, ...q) - beyond(mol, ...p))[0];
}

export type EtaLayout = {
  /** Where its system's atoms are, the star at the origin, the metal along +y. */
  pos: Map<number, Point>;
  /** Where the bonds out of it go: the metal's, and each hanging atom's, by atom. */
  hints: Map<number, Map<number, Point>>;
  /** Each atom's place across the axis in the ring's plane, before it is foreshortened: + toward the metal. */
  lift: Map<number, number>;
};

/**
 * A ring system bound face-on to its metal, spun as `spin` says: laid out
 * flat by its rings, turned so that its first substituent (the heaviest
 * branch) points the way the spin gives (`spinsOf`), and foreshortened
 * across the axis.
 */
export function placeEta(mol: Molecule, eta: EtaRing, spin = 0): EtaLayout {
  const own = eta.atoms.filter((a) => a !== eta.star);
  const rings = mol.rings.map((r, i) => (r.every((a) => own.includes(a)) ? i : -1)).filter((i) => i >= 0);
  const flat = placeRingSystem(mol, { atoms: own, rings });
  const c = centroid(eta.ring.map((a) => flat.get(a)!));
  // the heaviest branch hanging from it, by how many atoms lie beyond
  const out = hanging(mol, eta);
  const first = out.length ? heaviest(mol, out) : undefined;
  const toward = first
    ? angleOf(sub(flat.get(first[0])!, c))
    : angleOf(sub(flat.get(eta.ring[0])!, c));
  const spins = spinsOf(mol, eta);
  const want = spins[spin % spins.length];
  const turn = want - toward;
  const inPlane = (p: Point) => rotate(sub(p, c), turn);
  const seen = (q: Point): Point => ({ x: q.x, y: q.y * FORESHORTEN });

  const pos = new Map<number, Point>();
  const lift = new Map<number, number>();
  for (const [a, p] of flat) {
    const q = inPlane(p);
    pos.set(a, seen(q));
    lift.set(a, q.y);
  }
  pos.set(eta.star, { x: 0, y: 0 });
  lift.set(eta.star, 0);

  const hints = new Map<number, Map<number, Point>>();
  const hint = (a: number, b: number, p: Point) => hints.set(a, (hints.get(a) ?? new Map()).set(b, p));
  // the metal on the axis
  for (const m of mol.neighbours[eta.star]) hint(eta.star, m, { x: 0, y: TO_METAL });
  // what hangs from a ring atom: straight out from the centre of its rings,
  // in their plane (two from one atom, either side of that)
  const byAtom = new Map<number, number[]>();
  for (const [a, b] of out) byAtom.set(a, [...(byAtom.get(a) ?? []), b]);
  for (const [a, bs] of byAtom) {
    const centres = mol.ringsOf[a].map((r) => centroid(mol.rings[r].map((v) => flat.get(v)!)));
    const from = centroid(centres);
    const radial = angleOf(sub(flat.get(a)!, from));
    const spread = bs.length === 1 ? [0] : bs.map((_, k) => ((k - (bs.length - 1) / 2) * Math.PI) / 3);
    bs.forEach((b, k) => {
      const end = add(flat.get(a)!, { x: Math.cos(radial + spread[k]), y: Math.sin(radial + spread[k]) });
      hint(a, b, seen(inPlane(end)));
    });
  }
  return { pos, hints, lift };
}

/** How many atoms lie beyond `b`, from `a`: what hangs there, by bonds (and a ring bound face-on, by its star). */
function beyond(mol: Molecule, a: number, b: number): number {
  const seen = new Set([a, b]);
  const todo = [b];
  while (todo.length) {
    const u = todo.pop()!;
    const ring = mol.eta.find((e) => e.star === u);
    for (const v of [...mol.neighbours[u], ...(ring?.atoms ?? [])]) {
      if (seen.has(v)) continue;
      seen.add(v);
      todo.push(v);
    }
  }
  return seen.size - 1;
}

/** How many ways a metal's unit is tried: each of its rings' spins, together. */
export function unitVariants(mol: Molecule, unit: MetalUnit): number {
  return unit.eta.reduce((n, e) => n * etaSpins(mol, e), 1);
}

/**
 * A metal and its rings bound face-on, as one system (section 7): the
 * metal at the origin, each ring's centre a bond from it the way its slot
 * goes (`metalSlots`), the ring square to that line; and the metal's other
 * ligands hinted along the other slots, the bulkiest furthest apart.
 * `variant` gives each ring's spin, the first ring's fastest.
 */
export function placeUnit(mol: Molecule, unit: MetalUnit, variant = 0): EtaLayout {
  const m = unit.metal;
  const stars = new Set(unit.eta.map((e) => e.star));
  const others = mol.neighbours[m].filter((l) => !stars.has(l));
  const slots = metalSlots(unit.eta.length, others.length);
  const ringSlots = slots.filter((t) => t.ring);
  const otherSlots = slots.filter((t) => !t.ring).map((t) => t.angle);
  const pos = new Map<number, Point>([[m, { x: 0, y: 0 }]]);
  const lift = new Map<number, number>([[m, 0]]);
  const hints = new Map<number, Map<number, Point>>();
  let v = variant;
  unit.eta.forEach((e, j) => {
    const spins = etaSpins(mol, e);
    const laid = placeEta(mol, e, v % spins);
    v = Math.floor(v / spins);
    // its centre a bond out along its slot, its own +y back toward the metal
    const out = ringSlots[j].angle;
    const at = dir(out);
    const turn = out + Math.PI - Math.PI / 2;
    const place = (p: Point) => add(at, rotate(p, turn));
    for (const [a, p] of laid.pos) pos.set(a, place(p));
    for (const [a, l] of laid.lift) lift.set(a, l);
    for (const [a, h] of laid.hints) {
      const moved = new Map([...h].filter(([b]) => b !== m).map(([b, p]) => [b, place(p)]));
      if (moved.size) hints.set(a, moved);
    }
  });
  // the other ligands: the bulkiest furthest from each other and from the rings
  const weight = (l: number) => beyond(mol, m, l);
  const ringsAt = ringSlots.map((t, j) => ({ angle: t.angle, w: unit.eta[j].atoms.length }));
  let best: { cost: number; order: number[] } | null = null;
  for (const order of permutations(others.length)) {
    const at = order.map((k, i) => ({ angle: otherSlots[k], w: weight(others[i]) }));
    const all = [...ringsAt, ...at];
    let cost = 0;
    for (let i = 0; i < all.length; i++) for (let k = i + 1; k < all.length; k++) cost += all[i].w * all[k].w * Math.cos(all[i].angle - all[k].angle);
    if (!best || cost < best.cost - 1e-9) best = { cost, order };
  }
  const toMetal = new Map<number, Point>();
  others.forEach((l, i) => toMetal.set(l, dir(otherSlots[best!.order[i]])));
  if (toMetal.size) hints.set(m, toMetal);
  return { pos, hints, lift };
}

/** Each order of 0..n-1 (n up to six; beyond, the one order). */
function permutations(n: number): number[][] {
  if (n > 6) return [Array.from({ length: n }, (_, i) => i)];
  if (n === 0) return [[]];
  return permutations(n - 1).flatMap((p) => Array.from({ length: n }, (_, i) => [...p.slice(0, i), n - 1, ...p.slice(i)]));
}
