/**
 * Growing a structure out from its frame: each bond placed by the rules for
 * the atom it leaves, and the choices those rules leave free - which way a
 * chain turns, which side a branch goes, which way round a ring system is
 * hung - settled first by the rules of reading order, then by trying the
 * other way wherever it would do better.
 */
import {
  add,
  angleOf,
  centroid,
  cross,
  dir,
  mirror,
  rotate,
  splitOutside,
  splitWidestGap,
  sub,
  wrap,
  type Point,
} from "./geometry";
import { key, orderOf, type Molecule } from "./perceive";
import { MACROCYCLE } from "./ringSystem";

/** How the frame is set: turned by a multiple of 60 degrees, and mirrored or not. */
export type Frame = { turn: number; mirrored: boolean };

export const FRAMES: Frame[] = [false, true].flatMap((mirrored) =>
  [0, 1, 2, 3, 4, 5].map((k) => ({ turn: (k * Math.PI) / 3, mirrored })),
);


/** For each acyclic bond (by key, and which end), how many atoms lie beyond it. */
export function sidesOf(mol: Molecule): Map<string, number> {
  const out = new Map<string, number>();
  for (const [k] of mol.bondIndex) {
    if (mol.ringBonds.has(k)) continue;
    const [a, b] = k.split(",").map(Number);
    for (const [from, to] of [
      [a, b],
      [b, a],
    ]) {
      const seen = new Set([from, to]);
      const todo = [to];
      while (todo.length) {
        const u = todo.pop()!;
        for (const v of mol.neighbours[u]) {
          if (!seen.has(v)) {
            seen.add(v);
            todo.push(v);
          }
        }
      }
      out.set(`${from}>${to}`, seen.size - 1);
    }
  }
  return out;
}

/** The middle atom of a piece's longest path: where a structure with no ring starts. */
function middleOfLongestPath(mol: Molecule, piece: number[]): { middle: number; path: number[] } {
  const far = (s: number) => {
    const d = new Map([[s, 0]]);
    const parent = new Map<number, number>();
    const q = [s];
    for (let h = 0; h < q.length; h++) {
      for (const v of mol.neighbours[q[h]]) {
        if (!d.has(v)) {
          d.set(v, d.get(q[h])! + 1);
          parent.set(v, q[h]);
          q.push(v);
        }
      }
    }
    // the furthest; among those, a carbon chain's end before a heteroatom's
    let best = s;
    for (const v of q) {
      const better =
        d.get(v)! > d.get(best)! ||
        (d.get(v)! === d.get(best)! && mol.el[v] === "C" && mol.el[best] !== "C");
      if (better) best = v;
    }
    const path = [best];
    while (parent.has(path[path.length - 1])) path.push(parent.get(path[path.length - 1])!);
    return { end: best, path };
  };
  const a = far(piece[0]).end;
  const { path } = far(a);
  return { middle: path[Math.floor((path.length - 1) / 2)], path };
}

export type Grown = Map<number, Point>;

/**
 * Lays out one connected piece with its frame set as `frame`: the largest
 * ring system (or, with no ring, the middle of the longest chain) placed
 * first, and everything else grown out from it.
 */
export function grow(
  mol: Molecule,
  piece: number[],
  local: Map<number, Map<number, Point>>,
  frame: Frame,
  sides: Map<string, number>,
  hints: Map<number, Map<number, Point>> = new Map(),
  upright: ReadonlySet<number> = new Set(),
): Grown {
  const pos: Grown = new Map();
  const queue: number[] = [];
  // how each ring system's own frame was set down: to carry its hints over
  const transforms = new Map<number, (p: Point) => Point>();
  const setFrame = (p: Point): Point => {
    const q = frame.mirrored ? { x: -p.x, y: p.y } : p;
    return rotate(q, frame.turn);
  };

  const root = rootSystem(mol, piece);
  if (root >= 0) {
    const L = local.get(root)!;
    const c = centroid([...L.values()]);
    // a cage drawn in perspective stays upright, as it was drawn
    const set = upright.has(root) ? (p: Point) => p : setFrame;
    transforms.set(root, (p) => set(sub(p, c)));
    for (const [a, p] of L) pos.set(a, set(sub(p, c)));
    queue.push(...mol.systems[root].atoms);
  } else {
    const { middle, path } = middleOfLongestPath(mol, piece);
    pos.set(middle, { x: 0, y: 0 });
    // the longest chain level through the middle, the middle at a peak;
    // anything else on it straight up
    const i = path.indexOf(middle);
    const along = [path[i - 1], path[i + 1]].filter((v) => v != null);
    const others = mol.neighbours[middle].filter((v) => !along.includes(v));
    const deg = mol.neighbours[middle].length;
    const slots =
      deg === 1
        ? [0]
        : deg === 2
          ? [(-150 * Math.PI) / 180, (-30 * Math.PI) / 180]
          : deg === 3
            ? [(-150 * Math.PI) / 180, (-30 * Math.PI) / 180, Math.PI / 2]
            : splitWidestGap([], deg, Math.PI);
    const order = [...along, ...others];
    order.forEach((v, k) => {
      const t = slots[k] ?? slots[slots.length - 1];
      placeChild(mol, pos, local, queue, middle, v, setFrameAngle(frame, t), transforms, hints, upright);
    });
    queue.push(...order);
  }

  for (let h = 0; h < queue.length; h++) {
    const a = queue[h];
    const children = mol.neighbours[a].filter((v) => !pos.has(v));
    if (!children.length) continue;
    const placed = mol.neighbours[a].filter((v) => pos.has(v));
    const at = pos.get(a)!;
    const taken = placed.map((v) => angleOf(sub(pos.get(v)!, at)));
    // a cage's bonds out go where the solid puts them
    const hinted = hints.get(a);
    const T = transforms.get(mol.systemOf[a]);
    const byHint: [number, number][] = [];
    if (hinted && T) {
      for (const c of children) {
        const h = hinted.get(c);
        if (h) byHint.push([c, angleOf(sub(T(h), at))]);
      }
    }
    // an upright cage hung from here comes in along its own bond out, as
    // it is drawn: that bond's way is set by the cage, not by this atom
    for (const c of children) {
      const s = mol.systemOf[c];
      const back = hints.get(c)?.get(a);
      if (s < 0 || !upright.has(s) || !back || byHint.some(([h]) => h === c)) continue;
      byHint.push([c, angleOf(sub(local.get(s)!.get(c)!, back))]);
    }
    const rest = children.filter((c) => !byHint.some(([h]) => h === c));
    const assigned = rest.length
      ? assign(mol, pos, sides, a, placed, [...taken, ...byHint.map(([, t]) => t)], rest)
      : [];
    for (const [child, t] of [...byHint, ...assigned]) {
      placeChild(mol, pos, local, queue, a, child, t, transforms, hints, upright);
    }
  }
  return pos;
}

/**
 * The ring system a piece is built round, its frame: the one nearest all
 * the rest of it (atorvastatin's pyrrole, not one of its phenyls), and of
 * those the largest; -1 for a piece with no ring.
 */
export function rootSystem(mol: Molecule, piece: number[]): number {
  const systemsHere = [...new Set(piece.map((a) => mol.systemOf[a]).filter((s) => s >= 0))];
  if (!systemsHere.length) return -1;
  const reach = (s: number) => {
    const d = new Map<number, number>();
    const q = [...mol.systems[s].atoms];
    q.forEach((a) => d.set(a, 0));
    for (let h = 0; h < q.length; h++) {
      for (const v of mol.neighbours[q[h]]) {
        if (!d.has(v)) {
          d.set(v, d.get(q[h])! + 1);
          q.push(v);
        }
      }
    }
    return Math.max(...d.values());
  };
  const far = new Map(systemsHere.map((s) => [s, reach(s)]));
  return systemsHere.sort(
    (p, q) =>
      far.get(p)! - far.get(q)! ||
      mol.systems[q].atoms.length - mol.systems[p].atoms.length ||
      mol.systems[q].rings.length - mol.systems[p].rings.length,
  )[0];
}

/**
 * The ways of setting a piece's frame down: turned by sixty degrees at a
 * time, and mirrored - and, for a frame of squares and no hexagons (a
 * penam), by thirty degrees at a time, the square's sides able to lie
 * level and upright either way round.
 */
export function framesFor(mol: Molecule, piece: number[]): Frame[] {
  const root = rootSystem(mol, piece);
  if (root < 0) return FRAMES;
  const sizes = mol.systems[root].rings.map((r) => mol.rings[r].length);
  if (!sizes.includes(4) || sizes.includes(6)) return FRAMES;
  return [false, true].flatMap((mirrored) =>
    Array.from({ length: 12 }, (_, k) => ({ turn: (k * Math.PI) / 6, mirrored })),
  );
}

function setFrameAngle(frame: Frame, t: number): number {
  const v = dir(t);
  const q = frame.mirrored ? { x: -v.x, y: v.y } : v;
  return angleOf(q) + frame.turn;
}

/** Which child goes which way from atom `a`. */
function assign(
  mol: Molecule,
  pos: Grown,
  sides: Map<string, number>,
  a: number,
  placed: number[],
  taken: number[],
  children: number[],
): [number, number][] {
  const at = pos.get(a)!;
  const k = children.length;
  const weight = (c: number) => sides.get(`${a}>${c}`) ?? 1;
  const byWeight = [...children].sort((p, q) => weight(q) - weight(p) || p - q);

  if (mol.systemOf[a] >= 0 || placed.length !== 1) {
    // a ring atom: the room outside the rings split evenly, the heaviest
    // branch nearest straight out
    // (a macrocycle's centre is not counted: at a zigzag corner the
    // substituent takes the wider side, inside the macrocycle or out)
    const centres = mol.ringsOf[a]
      .filter((r) => mol.rings[r].length < MACROCYCLE)
      .map((r) => angleOf(sub(centroid(mol.rings[r].map((v) => pos.get(v)!)), at)));
    const slots = mol.systemOf[a] >= 0 ? splitOutside(taken, centres, k) : splitWidestGap(taken, k);
    const mid = slots.reduce((s, t) => s + t, 0) / slots.length;
    const byCentre = [...slots].sort((p, q) => Math.abs(wrap(p - mid)) - Math.abs(wrap(q - mid)));
    return byWeight.map((c, i) => [c, byCentre[i]]);
  }

  const parent = placed[0];
  const p = taken[0];
  const deg = k + 1;
  const orders = mol.neighbours[a].map((v) => orderOf(mol, a, v));
  const straight =
    deg === 2 && (orders.includes(3) || orders.filter((o) => o === 2).length === 2);
  if (straight) return [[children[0], p + Math.PI]];
  if (deg === 4) {
    const slots = [p + Math.PI, p + Math.PI / 2, p - Math.PI / 2];
    return byWeight.map((c, i) => [c, slots[i]]);
  }
  if (deg > 4) {
    const slots = splitWidestGap(taken, k);
    return byWeight.map((c, i) => [c, slots[i]]);
  }

  // two or three bonds at 120 degrees: which side each child goes
  const both = [p + (2 * Math.PI) / 3, p - (2 * Math.PI) / 3];
  const bond = sub(at, pos.get(parent)!);
  const sideOf = (t: number) => Math.sign(cross(bond, dir(t)));

  // a stereo double bond to the parent decides
  const required = stereoSides(mol, pos, parent, a, children);
  if (required) {
    const out: [number, number][] = [];
    for (const c of children) {
      const want = required.get(c);
      const t = want != null ? both.find((s) => sideOf(s) === want) ?? both[0] : both[0];
      out.push([c, t]);
    }
    if (k === 2 && out[0][1] === out[1][1]) out[1][1] = both.find((s) => s !== out[0][1])!;
    return out;
  }

  // the chain carries on as a zigzag: trans to what the parent came from
  const grand = mol.neighbours[parent].filter((v) => v !== a && pos.has(v));
  let carryOn: number | null = null;
  if (mol.systemOf[parent] < 0 && grand.length === 1) {
    const g = pos.get(grand[0])!;
    const gSide = Math.sign(cross(bond, sub(g, pos.get(parent)!)));
    if (gSide !== 0) carryOn = both.find((s) => sideOf(s) === -gSide) ?? null;
  }
  if (carryOn == null) {
    // free: the way that runs the chain nearest level
    const level = (t: number) => {
      const axis = add(dir(angleOf(bond)), dir(t));
      return Math.abs(Math.sin(angleOf(axis)));
    };
    carryOn = level(both[0]) <= level(both[1]) + 1e-9 ? both[0] : both[1];
  }
  // Two bonds past a cis double bond the chain takes up again the line it
  // ran along before it: the double bond a step in a straight chain, as a
  // fatty acid's is drawn - not a bend it runs off along.
  const resumed = resume(mol, pos, a, parent, grand);
  if (resumed) {
    const along = (t: number) => {
      const axis = add(dir(angleOf(bond)), dir(t));
      return Math.cos(angleOf(axis) - angleOf(resumed));
    };
    carryOn = along(both[0]) >= along(both[1]) ? both[0] : both[1];
  }
  const other = both.find((s) => s !== carryOn)!;
  if (k === 1) return [[children[0], carryOn]];
  // At an alpha carbon the backbone carries on, N to C(=O) or back, and the
  // side chain branches off - however much heavier the side chain is.
  const next = backbone(mol, a, parent, children);
  const first = next ?? byWeight[0];
  const second = children.find((c) => c !== first)!;
  return [
    [first, carryOn],
    [second, other],
  ];
}

/** A carbonyl carbon of an acid, an ester or an amide: C(=O)O or C(=O)N. */
function isCarbonyl(mol: Molecule, c: number): boolean {
  if (mol.el[c] !== "C") return false;
  const nb = mol.neighbours[c];
  return (
    nb.some((v) => mol.el[v] === "O" && orderOf(mol, c, v) === 2) &&
    nb.some((v) => (mol.el[v] === "O" || mol.el[v] === "N") && orderOf(mol, c, v) === 1)
  );
}

/**
 * Where `a` is an alpha carbon reached from its N or its carbonyl carbon,
 * the child that carries the backbone on: the other of the two.
 */
function backbone(mol: Molecule, a: number, parent: number, children: number[]): number | null {
  if (mol.el[a] !== "C") return null;
  if (mol.el[parent] === "N") return children.find((c) => isCarbonyl(mol, c)) ?? null;
  if (isCarbonyl(mol, parent)) return children.find((c) => mol.el[c] === "N") ?? null;
  return null;
}

/**
 * The line a chain ran along before a cis double bond two bonds back from
 * `a` - parent, then the double bond's near end (`grand`), then its far
 * end - as the chain's own zigzag had it there; null where there is none.
 */
function resume(mol: Molecule, pos: Grown, a: number, parent: number, grand: number[]): Point | null {
  if (grand.length !== 1 || mol.systemOf[a] >= 0 || mol.systemOf[parent] >= 0) return null;
  const g = grand[0];
  const placedBeside = (u: number, not: number) =>
    mol.neighbours[u].filter((v) => v !== not && pos.has(v) && mol.systemOf[v] < 0);
  const [far] = placedBeside(g, parent);
  if (far == null) return null;
  const bi = mol.bondIndex.get(key(g, far));
  const b = bi != null ? mol.bonds[bi] : null;
  if (!b || b.order !== 2 || !b.stereo?.cis) return null;
  const [before] = placedBeside(far, g);
  if (before == null) return null;
  const [twoBefore] = placedBeside(before, far);
  if (twoBefore == null) return null;
  return sub(pos.get(far)!, pos.get(twoBefore)!);
}

/**
 * Where the bond parent=a is a stereo double bond, which side of it (as seen
 * along parent to a) each of a's children must go.
 */
function stereoSides(
  mol: Molecule,
  pos: Grown,
  parent: number,
  a: number,
  children: number[],
): Map<number, number> | null {
  const i = mol.bondIndex.get(key(parent, a));
  if (i == null) return null;
  const bond = mol.bonds[i];
  if (bond.order !== 2 || !bond.stereo) return null;
  const [r1, r2] = bond.stereo.refs;
  const onParent = mol.neighbours[parent].includes(r1) && r1 !== a ? r1 : r2;
  const onA = onParent === r1 ? r2 : r1;
  const pp = pos.get(onParent);
  if (!pp) return null;
  const line = sub(pos.get(a)!, pos.get(parent)!);
  const refSide = Math.sign(cross(line, sub(pp, pos.get(parent)!)));
  if (!refSide) return null;
  const wantRef = bond.stereo.cis ? refSide : -refSide;
  const out = new Map<number, number>();
  for (const c of children) out.set(c, c === onA ? wantRef : -wantRef);
  return out;
}

/** Places `child`, bonded to placed `a`, in direction `t` - an atom, or its whole ring system. */
function placeChild(
  mol: Molecule,
  pos: Grown,
  local: Map<number, Map<number, Point>>,
  queue: number[],
  a: number,
  child: number,
  t: number,
  transforms: Map<number, (p: Point) => Point>,
  hints: Map<number, Map<number, Point>>,
  upright: ReadonlySet<number> = new Set(),
): void {
  const at = add(pos.get(a)!, dir(t));
  const s = mol.systemOf[child];
  if (s < 0) {
    pos.set(child, at);
    queue.push(child);
    return;
  }
  const L = local.get(s)!;
  const c0 = L.get(child)!;
  if (upright.has(s)) {
    transforms.set(s, (p) => add(at, sub(p, c0)));
    for (const [v, p] of L) {
      if (pos.has(v)) continue;
      pos.set(v, add(at, sub(p, c0)));
      queue.push(v);
    }
    return;
  }
  // the way out of the ring system at `child`, in its own frame
  const ringNb = mol.neighbours[child].filter((v) => L.has(v));
  const out = mol.neighbours[child].filter((v) => !L.has(v));
  const slots = splitOutside(
    ringNb.map((v) => angleOf(sub(L.get(v)!, c0))),
    mol.ringsOf[child]
      .filter((r) => mol.rings[r].length < MACROCYCLE)
      .map((r) => angleOf(sub(centroid(mol.rings[r].map((v) => L.get(v)!)), c0))),
    out.length,
  );
  const mid = slots.reduce((sum, x) => sum + x, 0) / slots.length;
  const hinted = hints.get(child)?.get(a);
  const slot = hinted
    ? angleOf(sub(hinted, c0))
    : [...slots].sort((p, q) => Math.abs(wrap(p - mid)) - Math.abs(wrap(q - mid)))[0];
  const turn = t + Math.PI - slot;
  transforms.set(s, (p) => add(at, rotate(sub(p, c0), turn)));
  for (const [v, p] of L) {
    if (pos.has(v)) continue;
    pos.set(v, add(at, rotate(sub(p, c0), turn)));
    queue.push(v);
  }
}

/**
 * Mirrors the smaller side of an acyclic single bond across the bond's own
 * line - the one free choice a single bond leaves.
 */
export function flip(mol: Molecule, pos: Grown, a: number, b: number, sides: Map<string, number>): void {
  const beyondB = sides.get(`${a}>${b}`) ?? 0;
  const beyondA = sides.get(`${b}>${a}`) ?? 0;
  const [from, to] = beyondB <= beyondA ? [a, b] : [b, a];
  const pa = pos.get(from)!;
  const pb = pos.get(to)!;
  const seen = new Set([from, to]);
  const todo = [to];
  while (todo.length) {
    const u = todo.pop()!;
    for (const v of mol.neighbours[u]) {
      if (seen.has(v)) continue;
      seen.add(v);
      todo.push(v);
      pos.set(v, mirror(pos.get(v)!, pa, pb));
    }
  }
}

/** The atoms on `to`'s side of the bond from-to (acyclic), `to` among them. */
export function sideAtoms(mol: Molecule, from: number, to: number): number[] {
  const seen = new Set([from, to]);
  const out = [to];
  for (let h = 0; h < out.length; h++) {
    for (const v of mol.neighbours[out[h]]) {
      if (!seen.has(v)) {
        seen.add(v);
        out.push(v);
      }
    }
  }
  return out;
}

/** Turns the atoms `side` about the atom at `pivot` by `angle`. */
export function turnSide(pos: Grown, side: readonly number[], pivot: Point, angle: number): void {
  for (const v of side) pos.set(v, add(pivot, rotate(sub(pos.get(v)!, pivot), angle)));
}

/** Moves the atoms `side` along the bond from `from` to `to` by `by`: stretching it. */
export function stretchSide(pos: Grown, side: readonly number[], from: Point, to: Point, by: number): void {
  const d = dir(angleOf(sub(to, from)));
  for (const v of side) pos.set(v, add(pos.get(v)!, { x: d.x * by, y: d.y * by }));
}

/** The bonds whose smaller side can be mirrored and change the drawing. */
export function flippable(mol: Molecule, sides: Map<string, number>): [number, number][] {
  const out: [number, number][] = [];
  for (const [k, i] of mol.bondIndex) {
    if (mol.ringBonds.has(k) || mol.bonds[i].order !== 1) continue;
    const [a, b] = k.split(",").map(Number);
    const small = Math.min(sides.get(`${a}>${b}`) ?? 0, sides.get(`${b}>${a}`) ?? 0);
    // one atom beyond is on the line itself; two or more can move
    if (small >= 2) out.push([a, b]);
  }
  return out;
}

