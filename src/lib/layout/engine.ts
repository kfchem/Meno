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
import { placeRingSystem } from "./ringSystem";
import type { Point } from "./geometry";

export type { LayoutInput } from "./perceive";

export type Layout2D = { x: number[]; y: number[] };

export function layout2D(input: LayoutInput): Layout2D {
  const mol = perceive(input);
  const local = new Map<number, Map<number, Point>>();
  mol.systems.forEach((s, i) => local.set(i, placeRingSystem(mol, s)));
  const sides = sidesOf(mol);
  const flips = flippable(mol, sides);

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
      const pos = grow(mol, piece, local, frame, sides);
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
  return { x, y };
}

/** Tries each single bond the other way round, keeping what scores better, until nothing does. */
function improve(
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
      if (dist(pos.get(a)!, pos.get(b)!) < 0.6) out.add(a).add(b);
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
function untangle(
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
        for (const t of [15, -15, 30, -30, 45, -45, 60, -60]) {
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
function scorer(mol: Molecule, piece: number[]): (pos: Grown) => number {
  const index = new Map(piece.map((a, i) => [a, i]));
  const edges: [number, number][] = [];
  const orders: number[] = [];
  for (const [k, i] of mol.bondIndex) {
    const [a, b] = k.split(",").map(Number);
    if (!index.has(a)) continue;
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
    }).score;
}
