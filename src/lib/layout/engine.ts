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
  FRAMES,
  flip,
  flippable,
  grow,
  sideAtoms,
  sidesOf,
  stretchSide,
  turnSide,
  type Grown,
} from "./assemble";
import { dist, segmentsCross } from "./geometry";
import { layoutMetrics } from "./metrics";
import { perceive, type LayoutInput, type Molecule } from "./perceive";
import { placeRingSystem, ringSystemVariants } from "./ringSystem";
import { flatCost, isSmallBicycle, projectCage } from "./cage";
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
} & Stereo;

export function layout2D(input: LayoutInput): Layout2D {
  const mol = perceive(input);
  const local = new Map<number, Map<number, Point>>();
  const depth = new Array<number | null>(mol.n).fill(null);
  const hints = new Map<number, Map<number, Point>>();
  mol.systems.forEach((_, i) => {
    const laid = layoutSystem(mol, i);
    local.set(i, laid.pos);
    laid.depth?.forEach((d, a) => (depth[a] = d));
    laid.hints?.forEach((m, a) => hints.set(a, m));
  });
  const sides = sidesOf(mol);
  const flips = flippable(mol, sides);
  // a macrocycle's shape chosen for what hangs from it: each shape offered
  // tried, grown in every frame, and the best kept
  mol.systems.forEach((sys, i) => {
    const count = ringSystemVariants(mol, sys);
    if (count < 2) return;
    const piece = mol.pieces.find((p) => p.includes(sys.atoms[0]))!;
    const score = scorer(mol, piece);
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
      for (const frame of FRAMES) {
        const pos = grow(mol, piece, local, frame, sides, hints);
        const s = score(pos);
        if (s < topScore) {
          topScore = s;
          top = pos;
        }
      }
      const better = improve(mol, top!, topScore, flipsHere, sides, score);
      const s = untangle(mol, piece, better.pos, better.score, score).score;
      if (s < bestScore) {
        bestScore = s;
        best = v;
      }
    }
    local.set(i, placeRingSystem(mol, sys, best));
  });

  const x = new Array<number>(mol.n).fill(0);
  const y = new Array<number>(mol.n).fill(0);
  let right = 0;
  // the largest piece first, the rest after it to the right
  const pieces = [...mol.pieces].sort((p, q) => q.length - p.length);
  for (const piece of pieces) {
    const score = scorer(mol, piece);
    const here = new Set(piece);
    const flipsHere = flips.filter(([a]) => here.has(a));
    const tried = FRAMES.map((frame) => {
      const pos = grow(mol, piece, local, frame, sides, hints);
      return { pos, score: score(pos) };
    }).sort((p, q) => p.score - q.score);
    let best = tried[0];
    // every frame tried the other way where it helps, for a small piece;
    // the most promising few for a large one
    const worth = piece.length <= 80 ? tried.length : 4;
    for (const cand of tried.slice(0, worth)) {
      const improved = improve(mol, cand.pos, cand.score, flipsHere, sides, score);
      if (improved.score < best.score - 1e-9) best = improved;
    }
    best = untangle(mol, piece, best.pos, best.score, score);
    squareUp(mol, piece, best.pos);
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
  // a stereocentre in a cage drawn in perspective shows itself there
  const tetra = new Map<number, Tetrahedral>();
  input.atoms.forEach((a, i) => a.tetra && depth[i] == null && tetra.set(i, a.tetra));
  const final = new Map(x.map((v, i) => [i, { x: v, y: y[i] }]));
  return { x, y, depth, ...placeStereo(mol, final, tetra) };
}

/**
 * A ring system in its own frame: flat, by its rings; or, where it will not
 * lie flat - a bridge crowding or crossing the ring it spans, the faces of
 * cubane - as the cage it is, in perspective: whichever reads better.
 */
function layoutSystem(
  mol: Molecule,
  i: number,
): { pos: Map<number, Point>; depth?: Map<number, number>; hints?: Map<number, Map<number, Point>> } {
  const sys = mol.systems[i];
  // a small bridged bicycle - norbornane, tropane, quinuclidine - is drawn
  // in perspective, the way it always is
  if (isSmallBicycle(mol, sys)) return projectCage(mol, sys);
  let flat = placeRingSystem(mol, sys);
  const rings = sys.rings.map((r) => mol.rings[r]);
  const bridged = rings.some((r, j) =>
    rings.some((q, k) => k > j && q.filter((a) => r.includes(a)).length >= 3 && q.length < 9 && r.length < 9),
  );
  // a bridged system laid flat from each of its rings in turn: which ring
  // stays regular and which arcs round it decides whether it reads
  if (bridged && !rings.some((r) => r.length >= 9)) {
    let least = flatCost(mol, sys, flat);
    for (const r of sys.rings) {
      const trial = placeRingSystem(mol, sys, 0, r);
      const cost = flatCost(mol, sys, trial);
      if (cost < least - 1e-9) {
        least = cost;
        flat = trial;
      }
    }
  }
  if ((!bridged && rings.length < 3) || sys.atoms.length > 20) return { pos: flat };
  if (rings.some((r) => r.length >= 9)) return { pos: flat };
  const flatScore = flatCost(mol, sys, flat);
  if (flatScore < 2) return { pos: flat };
  const cage = projectCage(mol, sys);
  return cage.cost < flatScore ? cage : { pos: flat };
}

/** Tries each single bond the other way round, keeping what scores better, until nothing does. */
export function improve(
  mol: Molecule,
  start: Grown,
  startScore: number,
  flips: [number, number][],
  sides: Map<string, number>,
  score: (pos: Grown) => number,
): { pos: Grown; score: number } {
  let pos = start;
  let current = startScore;
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
  return { pos, score: current };
}

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
): { pos: Grown; score: number } {
  let pos = start;
  let current = startScore;
  const acyclic = [...mol.bondIndex.entries()]
    .filter(([k, i]) => !mol.ringBonds.has(k) && mol.bonds[i].order === 1)
    .map(([k]) => k.split(",").map(Number) as [number, number])
    .filter(([a]) => pos.has(a));
  for (let round = 0; round < 6; round++) {
    const hit = clashing(mol, piece, pos);
    if (!hit.size) break;
    let better = false;
    for (const [a, b] of acyclic) {
      for (const [from, to] of [
        [a, b],
        [b, a],
      ]) {
        const side = sideAtoms(mol, from, to);
        if (side.length > piece.length / 2 || !side.some((v) => hit.has(v))) continue;
        const moves: ((p: Grown) => void)[] = [];
        for (const t of [15, -15, 30, -30, 45, -45, 60, -60, 90, -90]) {
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
export function scorer(mol: Molecule, piece: number[]): (pos: Grown) => number {
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
    }).score;
}
