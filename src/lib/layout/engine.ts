/**
 * Meno's own 2D layout: coordinates for a molecule from its graph alone,
 * by the rules in docs/LAYOUT-2D.md.
 *
 * Each ring system is laid out on its own first. Then, for each way of
 * setting the frame square on the lattice, the structure is grown out from
 * it, the free choices tried the other way where that reads better, and the
 * whole measured by the same rules the benchmark uses (metrics.ts); the
 * best is kept. Bonds come out of length 1.
 */
import {
  flip,
  framesFor,
  flippable,
  grow,
  sideAtoms,
  sidesOf,
  stretchSide,
  turnSide,
  type Frame,
  type Grown,
} from "./assemble";
import { dist, mirror, segmentsCross, sub } from "./geometry";
import { layoutMetrics } from "./metrics";
import { perceive, type LayoutInput, type Molecule } from "./perceive";
import { misshapen, placeRingSystem, regularize, ringSystemVariants } from "./ringSystem";
import { bridgeAcross } from "./bridge";
import { flatCost, isCage, projectCage, type CageView } from "./cage";
import { placeStereo, type Stereo, type Tetrahedral } from "./stereo";
import type { Point } from "./geometry";

export type { LayoutInput } from "./perceive";

export type Layout2D = {
  x: number[];
  y: number[];
  /**
   * How near each atom of a cage drawn in perspective is to the viewer
   * (null elsewhere): a bond passing behind another is drawn broken there.
   */
  depth: (number | null)[];
  /**
   * The atoms of a cage drawn as the solid it is: its rings foreshortened,
   * its stereochemistry shown by the drawing itself rather than by wedges.
   */
  solid: boolean[];
} & Stereo;

export function layout2D(input: LayoutInput): Layout2D {
  const mol = perceive(input);
  const local = new Map<number, Map<number, Point>>();
  const depth = new Array<number | null>(mol.n).fill(null);
  const hints = new Map<number, Map<number, Point>>();
  // the cages drawn in perspective: kept upright, as drawn
  const upright = new Set<number>();
  const solid = new Array<boolean>(mol.n).fill(false);
  // and each seen from its other side, for a frame set down mirrored
  const others = new Map<number, Omit<CageView, "other">>();
  mol.systems.forEach((sys, i) => {
    const laid = layoutSystem(mol, i);
    local.set(i, laid.pos);
    laid.depth?.forEach((d, a) => (depth[a] = d));
    laid.hints?.forEach((m, a) => hints.set(a, m));
    if (laid.solid) {
      upright.add(i);
      for (const a of sys.atoms) solid[a] = true;
      if (laid.other) others.set(i, laid.other);
    }
  });
  // what a frame grows from: in a mirrored one, each cage seen from its
  // other side
  const hintsM = new Map(hints);
  for (const view of others.values()) view.hints.forEach((m, a) => hintsM.set(a, m));
  const setUp = (frame: Frame) => {
    if (!frame.mirrored || !others.size) return { L: local, H: hints };
    const L = new Map(local);
    for (const [i, view] of others) L.set(i, view.pos);
    return { L, H: hintsM };
  };
  const fixed = (atoms: readonly number[]) => atoms.some((a) => upright.has(mol.systemOf[a]));
  const sides = sidesOf(mol);
  // (a flip mirrors a side across a bond's line, which would tip a cage over)
  const flips = flippable(mol, sides).filter(([a, b]) => {
    const beyondB = sides.get(`${a}>${b}`) ?? 0;
    const beyondA = sides.get(`${b}>${a}`) ?? 0;
    const [from, to] = beyondB <= beyondA ? [a, b] : [b, a];
    return !fixed(sideAtoms(mol, from, to));
  });
  // a macrocycle's shape chosen for what hangs from it: each shape offered
  // tried, grown in every frame, and the best kept
  mol.systems.forEach((sys, i) => {
    const count = ringSystemVariants(mol, sys);
    if (count < 2) return;
    const piece = mol.pieces.find((p) => p.includes(sys.atoms[0]))!;
    const score = scorer(mol, piece, depth, solid);
    let best = 0;
    let bestScore = Infinity;
    const here = new Set(piece);
    const flipsHere = flips.filter(([a]) => here.has(a));
    for (let v = 0; v < count; v++) {
      local.set(i, placeRingSystem(mol, sys, v));
      // the frame it grows best in, tried the other way and untangled
      // where it helps: substituents inside a macrocycle are crowded until then
      let top: Grown | null = null;
      let topScore = Infinity;
      for (const frame of framesFor(mol, piece)) {
        const { L, H } = setUp(frame);
        const pos = grow(mol, piece, L, frame, sides, H, upright);
        const s = score(pos);
        if (s < topScore) {
          topScore = s;
          top = pos;
        }
      }
      const better = improve(mol, top!, topScore, flipsHere, sides, score);
      const s = untangle(mol, piece, better.pos, better.score, score, fixed).score;
      if (s < bestScore) {
        bestScore = s;
        best = v;
      }
    }
    local.set(i, placeRingSystem(mol, sys, best));
  });

  // the drawing each system ended up as
  const used = new Map(local);
  const x = new Array<number>(mol.n).fill(0);
  const y = new Array<number>(mol.n).fill(0);
  let right = 0;
  // the largest piece first, the rest after it to the right
  const pieces = [...mol.pieces].sort((p, q) => q.length - p.length);
  for (const piece of pieces) {
    const score = scorer(mol, piece, depth, solid);
    const here = new Set(piece);
    const flipsHere = flips.filter(([a]) => here.has(a));
    const tried = framesFor(mol, piece).map((frame) => {
      const { L, H } = setUp(frame);
      const pos = grow(mol, piece, L, frame, sides, H, upright);
      return { pos, score: score(pos), mirrored: frame.mirrored };
    }).sort((p, q) => p.score - q.score);
    let best = tried[0];
    // every frame tried the other way where it helps, for a small piece;
    // the most promising few for a large one
    const worth = piece.length <= 80 ? tried.length : 4;
    const improved = tried
      .slice(0, worth)
      .map((cand) => ({ ...improve(mol, cand.pos, cand.score, flipsHere, sides, score), mirrored: cand.mirrored }))
      .sort((p, q) => p.score - q.score);
    // and the best few set right within their small sides - every one, for
    // a small piece
    for (const cand of improved.slice(0, piece.length <= 40 ? improved.length : 3)) {
      const deeper = { ...improve(mol, cand.pos, cand.score, flipsHere, sides, score, true), mirrored: cand.mirrored };
      if (deeper.score < best.score - 1e-9) best = deeper;
    }
    best = { ...rejoin(mol, piece, best.pos, best.score, score, fixed), mirrored: best.mirrored };
    best = { ...untangle(mol, piece, best.pos, best.score, score, fixed), mirrored: best.mirrored };
    // a cage in a mirrored frame is the one seen from its other side
    if (best.mirrored) {
      for (const [i, view] of others) {
        if (!piece.includes(mol.systems[i].atoms[0])) continue;
        used.set(i, view.pos);
        view.depth.forEach((d, a) => (depth[a] = d));
      }
    }
    if (!fixed(piece)) squareUp(mol, piece, best.pos);
    const xs = piece.map((a) => best.pos.get(a)!.x);
    const ys = piece.map((a) => best.pos.get(a)!.y);
    const shift = (right ? right + 1.5 : 0) - Math.min(...xs);
    const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
    for (const a of piece) {
      x[a] = best.pos.get(a)!.x + shift;
      y[a] = best.pos.get(a)!.y - midY;
    }
    right = Math.max(...piece.map((a) => x[a]));
  }
  // a flat system drawn with depth (a bridge across a ring), seen from its
  // other side (the frame mirrored), is nearer where it was further: the
  // drawing is the molecule turned round, not its mirror image. (A cage is
  // never mirrored: a mirrored frame has it seen from its other side.)
  mol.systems.forEach((sys, i) => {
    if (depth[sys.atoms[0]] == null) return;
    const L = used.get(i)!;
    // the way round the widest triangle of its atoms goes, before and after
    const [o, ...rest] = sys.atoms;
    const turn = (p: (a: number) => Point, a: number, b: number) => {
      const u = sub(p(a), p(o));
      const v = sub(p(b), p(o));
      return u.x * v.y - u.y * v.x;
    };
    let widest: [number, number] = [rest[0], rest[1]];
    for (const a of rest) {
      for (const b of rest) {
        if (Math.abs(turn((v) => L.get(v)!, a, b)) > Math.abs(turn((v) => L.get(v)!, ...widest))) widest = [a, b];
      }
    }
    const before = turn((v) => L.get(v)!, ...widest);
    const after = turn((v) => ({ x: x[v], y: y[v] }), ...widest);
    if (Math.sign(before) !== Math.sign(after)) for (const a of sys.atoms) depth[a] = -depth[a]!;
  });
  // a stereocentre in a cage drawn in perspective shows itself there
  const tetra = new Map<number, Tetrahedral>();
  input.atoms.forEach((a, i) => a.tetra && !solid[i] && tetra.set(i, a.tetra));
  const final = new Map(x.map((v, i) => [i, { x: v, y: y[i] }]));
  return { x, y, depth, solid, ...placeStereo(mol, final, tetra) };
}

/**
 * A ring system in its own frame: flat, by its rings; or, where it will not
 * lie flat - a bridge crowding or crossing the ring it spans, the faces of
 * cubane - as the cage it is, in perspective: whichever reads better.
 */
function layoutSystem(
  mol: Molecule,
  i: number,
): {
  pos: Map<number, Point>;
  depth?: Map<number, number>;
  hints?: Map<number, Map<number, Point>>;
  solid?: boolean;
  other?: Omit<CageView, "other">;
} {
  const sys = mol.systems[i];
  // a cage - norbornane, tropane, quinuclidine, adamantane - is drawn in
  // perspective, the way it always is; anything else flat
  if (isCage(mol, sys)) return { ...projectCage(mol, sys), solid: true };
  let flat = placeRingSystem(mol, sys);
  const rings = sys.rings.map((r) => mol.rings[r]);
  const bridged = rings.some((r, j) =>
    rings.some((q, k) => k > j && q.filter((a) => r.includes(a)).length >= 3 && q.length < 9 && r.length < 9),
  );
  // a bridged system laid flat from each of its rings in turn: which ring
  // stays regular and which arcs round it decides whether it reads
  if (bridged && !rings.some((r) => r.length >= 9)) {
    // how it reads, flat - its rings' shapes counted as well as its faults -
    // and each with a fault in it (a crowded atom, a stretched bond) tried
    // eased toward rings of their own shape, where that is better
    const cost = (pos: Map<number, Point>) => flatCost(mol, sys, pos) + 20 * misshapen(mol, sys, pos);
    const eased = (pos: Map<number, Point>) => {
      if (flatCost(mol, sys, pos) < 1) return pos;
      const trial = new Map(pos);
      regularize(mol, sys, trial);
      return cost(trial) < cost(pos) - 1e-9 ? trial : pos;
    };
    flat = eased(flat);
    let least = cost(flat);
    for (const r of sys.rings) {
      const trial = eased(placeRingSystem(mol, sys, 0, r));
      const c = cost(trial);
      if (c < least - 1e-9) {
        least = c;
        flat = trial;
      }
    }
    // where that crowds or stretches it (morphine, artemisinin): the fused
    // rings flat and regular, the bridge across the face of one
    if (least >= 1) {
      const across = bridgeAcross(mol, sys);
      if (across && flatCost(mol, sys, across.pos, across.depth) < least) return across;
    }
  }
  return { pos: flat };
}

/**
 * Tries each single bond the other way round, keeping what scores better,
 * until nothing does. Then, `deep`, each small side turned over is tried
 * with each bond within it turned back as well: what hangs on it - a
 * carboxyl's C=O, up - set right again, where turning the side alone would
 * put it wrong; and if that helps, single bonds again.
 */
export function improve(
  mol: Molecule,
  start: Grown,
  startScore: number,
  flips: [number, number][],
  sides: Map<string, number>,
  score: (pos: Grown) => number,
  deep = false,
): { pos: Grown; score: number } {
  let pos = start;
  let current = startScore;
  const singly = () => {
    for (let pass = 0; pass < 4; pass++) {
      let better = false;
      for (const [a, b] of flips) {
        const trial = new Map(pos);
        flip(mol, trial, a, b, sides);
        const s = score(trial);
        if (s < current - 1e-6) {
          pos = trial;
          current = s;
          better = true;
        }
      }
      if (!better) break;
    }
  };
  // a side turned over and a bond within it turned back: the best pair
  const doubly = () => {
    let found: Grown | null = null;
    for (const [a, b] of flips) {
      const beyondB = sides.get(`${a}>${b}`) ?? 0;
      const beyondA = sides.get(`${b}>${a}`) ?? 0;
      if (Math.min(beyondA, beyondB) > SMALL_SIDE) continue;
      const [from, to] = beyondB <= beyondA ? [a, b] : [b, a];
      const moved = new Set(sideAtoms(mol, from, to));
      const trial = new Map(pos);
      flip(mol, trial, a, b, sides);
      for (const [c, d] of flips) {
        if ((c === a && d === b) || !moved.has(c) || !moved.has(d)) continue;
        const again = new Map(trial);
        flip(mol, again, c, d, sides);
        const s = score(again);
        if (s < current - 1e-6) {
          current = s;
          found = again;
        }
      }
    }
    if (found) pos = found;
    return found != null;
  };
  singly();
  for (let round = 0; deep && round < 2 && doubly(); round++) singly();
  return { pos, score: current };
}

/** The most atoms a side turned over may have and still be set right within. */
const SMALL_SIDE = 10;

/**
 * A piece with no ring that can lie square - its rings all five-membered,
 * say, or none - has nothing setting it on the lattice but its other bonds:
 * turn it the little way that brings them nearest.
 */
function squareUp(mol: Molecule, piece: number[], pos: Grown): void {
  const here = new Set(piece);
  const square = mol.rings.some(
    (r) =>
      here.has(r[0]) &&
      (r.length === 4 || r.length === 6) &&
      mol.rings.every((q) => q === r || q.filter((a) => r.includes(a)).length <= 2),
  );
  if (square) return;
  const dirs: number[] = [];
  for (const [k] of mol.bondIndex) {
    const [a, b] = k.split(",").map(Number);
    if (!here.has(a) || mol.ringBonds.has(k)) continue;
    const p = pos.get(a)!;
    const q = pos.get(b)!;
    dirs.push(Math.atan2(q.y - p.y, q.x - p.x));
  }
  if (!dirs.length) return;
  const step = Math.PI / 6;
  const off = (turn: number) =>
    dirs.reduce((sum, t) => {
      const u = t - turn;
      return sum + Math.abs(u - step * Math.round(u / step));
    }, 0);
  let turn = 0;
  let least = off(0);
  for (let i = -150; i < 150; i++) {
    const t = (i / 10) * (Math.PI / 180);
    const e = off(t);
    if (e < least - 1e-9) {
      least = e;
      turn = t;
    }
  }
  if (!turn) return;
  const c = Math.cos(-turn);
  const sn = Math.sin(-turn);
  for (const a of piece) {
    const p = pos.get(a)!;
    pos.set(a, { x: p.x * c - p.y * sn, y: p.x * sn + p.y * c });
  }
}

/**
 * Where a part with rings of its own hangs from the rest by a single bond
 * - a sugar on its glycosidic oxygen, taxol's side chain on its ester -
 * each part is drawn well on its own and then joined: the part may be
 * turned a little about the atom it hangs from, or about its own atom at
 * the join, where the whole reads better for it, though the angle there
 * then gives a little from 120 degrees.
 */
function rejoin(
  mol: Molecule,
  piece: number[],
  start: Grown,
  startScore: number,
  score: (pos: Grown) => number,
  fixed: (atoms: readonly number[]) => boolean = () => false,
): { pos: Grown; score: number } {
  let pos = start;
  let current = startScore;
  const here = new Set(piece);
  const joins = [...mol.bondIndex.entries()]
    .filter(([k, i]) => !mol.ringBonds.has(k) && mol.bonds[i].order === 1)
    .map(([k]) => k.split(",").map(Number) as [number, number])
    .filter(([a]) => here.has(a));
  for (let pass = 0; pass < 2; pass++) {
    let better = false;
    for (const [a, b] of joins) {
      for (const [from, to] of [
        [a, b],
        [b, a],
      ]) {
        const side = sideAtoms(mol, from, to);
        if (side.length < 4 || side.length > piece.length / 2) continue;
        // a part with rings of its own; or a long chain hung from a branch
        // (a lipid's acyl chain on its glycerol), drawn straight on its own
        const chain = side.length >= 8 && mol.neighbours[from].length >= 3;
        if (!chain && !side.some((v) => mol.systemOf[v] >= 0)) continue;
        const beyond = side.filter((v) => v !== to);
        // a little either way about either end of the join; and the part
        // turned right round about its own atom there, in steps of the
        // lattice, where it is a ring that has a way it should face (a
        // sugar: its oxygen up, its anomeric carbon right)
        const moves: [number, number[], number][] = [];
        for (const t of [20, -20, 30, -30]) {
          moves.push([t, side, from], [t, beyond, to]);
        }
        if (mol.systemOf[to] >= 0) {
          for (const t of [60, -60, 90, -90, 120, -120, 150, -150, 180]) moves.push([t, beyond, to]);
        }
        // and, for a ring, the same seen from its other face: mirrored across
        // the join first - a turn alone cannot change which way round it is
        const faces = mol.systemOf[to] >= 0 ? [false, true] : [false];
        for (const mirrored of faces) {
          for (const [t, group, pivot] of mirrored ? moves.filter(([, g]) => g === beyond) : moves) {
            // an upright cage is not turned
            if (fixed(group)) continue;
            const trial = new Map(pos);
            if (mirrored) {
              const p0 = trial.get(from)!;
              const p1 = trial.get(to)!;
              for (const v of beyond) trial.set(v, mirror(trial.get(v)!, p0, p1));
            }
            turnSide(trial, group, trial.get(pivot)!, (t * Math.PI) / 180);
            const s = score(trial);
            if (s < current - 1e-6) {
              pos = trial;
              current = s;
              better = true;
            }
          }
        }
      }
    }
    if (!better) break;
  }
  return { pos, score: current };
}

/** Atoms in the way of each other: on top of one another, on a bond, or at the ends of crossing bonds. */
function clashing(mol: Molecule, piece: number[], pos: Grown): Set<number> {
  const out = new Set<number>();
  const bonds = [...mol.bondIndex.keys()]
    .map((k) => k.split(",").map(Number) as [number, number])
    .filter(([a]) => pos.has(a));
  for (let i = 0; i < piece.length; i++) {
    for (let j = i + 1; j < piece.length; j++) {
      const a = piece[i];
      const b = piece[j];
      if (mol.neighbours[a].includes(b)) continue;
      const d = dist(pos.get(a)!, pos.get(b)!);
      // labels need more room than bare carbons
      const labelled = mol.el[a] !== "C" && mol.el[b] !== "C";
      if (d < 0.6 || (labelled && d < 0.8)) out.add(a).add(b);
    }
  }
  for (let i = 0; i < bonds.length; i++) {
    const [a, b] = bonds[i];
    for (let j = i + 1; j < bonds.length; j++) {
      const [c, d] = bonds[j];
      if (a === c || a === d || b === c || b === d) continue;
      if (segmentsCross(pos.get(a)!, pos.get(b)!, pos.get(c)!, pos.get(d)!)) {
        out.add(a).add(b).add(c).add(d);
      }
    }
  }
  return out;
}

/**
 * Where parts are still in each other's way: turn a branch off its ideal
 * angle, a little and then more, and at last stretch the bond it hangs
 * from - each kept only if the drawing scores better for it.
 */
export function untangle(
  mol: Molecule,
  piece: number[],
  start: Grown,
  startScore: number,
  score: (pos: Grown) => number,
  fixed: (atoms: readonly number[]) => boolean = () => false,
): { pos: Grown; score: number } {
  let pos = start;
  let current = startScore;
  const acyclic = [...mol.bondIndex.entries()]
    .filter(([k, i]) => !mol.ringBonds.has(k) && mol.bonds[i].order === 1)
    .map(([k]) => k.split(",").map(Number) as [number, number])
    .filter(([a]) => pos.has(a));
  // and a carbonyl's O, turned off its line where it lies on an atom and
  // nothing else will clear it (a macrocycle's amide against a ring of it)
  const carbonyls = [...mol.bondIndex.entries()]
    .filter(([k, i]) => !mol.ringBonds.has(k) && mol.bonds[i].order === 2)
    .map(([, i]) => mol.bonds[i])
    .flatMap(({ a, b }) =>
      mol.el[a] === "C" && mol.neighbours[b].length === 1
        ? [[a, b] as [number, number]]
        : mol.el[b] === "C" && mol.neighbours[a].length === 1
          ? [[b, a] as [number, number]]
          : [],
    )
    .filter(([a]) => pos.has(a));
  for (let round = 0; round < 6; round++) {
    const hit = clashing(mol, piece, pos);
    if (!hit.size) break;
    const onAtom = (o: number) =>
      piece.some((v) => v !== o && !mol.neighbours[o].includes(v) && dist(pos.get(v)!, pos.get(o)!) < 0.6);
    const turnable = [...acyclic, ...carbonyls.filter(([, o]) => onAtom(o))];
    let better = false;
    for (const [a, b] of turnable) {
      for (const [from, to] of [
        [a, b],
        [b, a],
      ]) {
        const side = sideAtoms(mol, from, to);
        if (side.length > piece.length / 2 || !side.some((v) => hit.has(v))) continue;
        const moves: ((p: Grown) => void)[] = [];
        // (an upright cage is moved, not turned)
        for (const t of fixed(side) ? [] : [15, -15, 30, -30, 45, -45, 60, -60, 90, -90]) {
          moves.push((p) => turnSide(p, side, p.get(from)!, (t * Math.PI) / 180));
        }
        for (const by of [0.3, 0.6]) {
          moves.push((p) => stretchSide(p, side, p.get(from)!, p.get(to)!, by));
        }
        for (const move of moves) {
          const trial = new Map(pos);
          move(trial);
          const s = score(trial);
          if (s < current - 1e-6) {
            pos = trial;
            current = s;
            better = true;
          }
        }
      }
    }
    if (!better) break;
  }
  return { pos, score: current };
}

/** The benchmark's score for a piece as laid out. */
export function scorer(
  mol: Molecule,
  piece: number[],
  depth: readonly (number | null)[] = [],
  solid: readonly boolean[] = [],
): (pos: Grown) => number {
  const index = new Map(piece.map((a, i) => [a, i]));
  const edges: [number, number][] = [];
  const orders: number[] = [];
  const cisTrans: { bond: number; refs: [number, number]; cis: boolean }[] = [];
  for (const [k, i] of mol.bondIndex) {
    const [a, b] = k.split(",").map(Number);
    if (!index.has(a)) continue;
    const st = mol.bonds[i].stereo;
    if (st && mol.bonds[i].order === 2) {
      // (the bond's ends in the same order as the edge, the refs with them)
      cisTrans.push({ bond: edges.length, refs: [index.get(st.refs[0])!, index.get(st.refs[1])!], cis: st.cis });
    }
    edges.push([index.get(a)!, index.get(b)!]);
    orders.push(mol.bonds[i].order);
  }
  const rings = mol.rings
    .filter((r) => index.has(r[0]))
    .map((r) => r.map((a) => index.get(a)!));
  const elements = piece.map((a) => mol.el[a]);
  const hydrogens = piece.map((a) => mol.hs[a]);
  const labelled = piece.map((a) => mol.el[a] !== "C" || mol.charge[a] !== 0);
  const perspective = piece.map((a) => solid[a] ?? false);
  const depths = piece.map((a) => depth[a] ?? null);
  const tetra = piece.map((a) => {
    const t = mol.tetra.get(a);
    return t && { neighbours: t.neighbours.map((b) => (b < 0 ? -1 : index.get(b)!)), volume: t.volume };
  });
  return (pos) =>
    layoutMetrics({
      x: piece.map((a) => pos.get(a)!.x),
      y: piece.map((a) => pos.get(a)!.y),
      edges,
      orders,
      elements,
      hydrogens,
      labelled,
      rings,
      cisTrans,
      perspective,
      depth: depths,
      tetra,
    }).score;
}
