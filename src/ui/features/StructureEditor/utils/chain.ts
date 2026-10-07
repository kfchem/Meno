/**
 * A chain traced on its honeycomb (./honeycomb): the walk the pointer leads
 * it on, bond by bond, and the rings drawn on the way. Pure.
 *
 * - The pointer leads: the chain goes along the honeycomb to the point
 *   nearest it, one bond at a time, each to the next point nearer the
 *   pointer; led back the way it came - or beside it, near enough - it
 *   takes its bonds back again, as far as the point it is led back to. Led
 *   round a hexagon of the honeycomb to a point it has been through, it
 *   closes a six-membered ring; led round further, to a point it went
 *   through longer ago, it is taken back to it, and the loop draws a
 *   six-membered ring there.
 * - Led round in a loop back to a point of the chain - not straight back
 *   the way it came, but round, so that the way it went encloses room - it
 *   draws a six-membered ring there: the ring has the bond the loop began
 *   along, on the side the loop went round. Led on from there, the ring
 *   stays; led back further, it goes. A loop is taken as the hand meant it:
 *   a way out and back that encloses only a sliver is no loop.
 * - A chain makes six-membered rings, and no other (the maintainer,
 *   2026-10-07): a ring of another size is drawn by hand.
 */
import { cellOf, honeycombFrom, neighboursOf, type Cell, type Honeycomb, type Pt } from "./honeycomb";

export type ChainRing = {
  /** The point of the walk the ring is drawn at, by its place in the walk. */
  at: number;
  /** The ring's other atoms, in order round it: the first is bonded to the walk's point, as is the last. */
  points: Pt[];
};

export type Chain = {
  honeycomb: Honeycomb;
  /** The points of the honeycomb the chain has gone through, from its start: one bond a step. */
  walk: string[];
  /** Where the pointer has been; and for each step of the walk after the first, where in that it was taken. */
  trail: Pt[];
  stepAt: number[];
  /** How much of the trail a ring has used up: no loop is looked for in it again. */
  trailFrom: number;
  rings: ChainRing[];
  /** A ring the latest step back drew, kept once the chain goes on from it (or ends). */
  pending: ChainRing | null;
};

/** How much nearer the pointer the next point has to be than the one the chain is at, as a part of a bond. */
const STEP_MARGIN = 0.12;
/** How much further from the pointer the point the chain came from may be than another, and still be gone back to first. */
const BACK_MARGIN = 0.25;
/** How far the pointer has to have gone for another point of the trail, as a part of a bond. */
const TRAIL_STEP = 0.04;
/** The least a loop encloses and the least way it goes, in a bond's squares and lengths, to draw a ring. */
const LOOP_AREA = 0.35;
const LOOP_LENGTH = 2.3;
/** How round a loop has to be to draw a ring: 4π times what it encloses over its length squared, 1 for a circle. */
const LOOP_ROUND = 0.45;
/** How far apart a loop's points are taken, as a part of a bond: any closer, and the hand's tremble lengthens it. */
const LOOP_STEP = 0.25;
/** The ring a chain makes: six-membered, and no other. */
export const CHAIN_RING = 6;

/** A chain from `start`, its honeycomb turned so that a bond it already has (`bondedTo`) is one of its own. */
export function startChain(start: Pt, bondedTo: Pt[], length: number): Chain {
  const honeycomb = honeycombFrom(start, bondedTo, length);
  return { honeycomb, walk: ["0,0,A"], trail: [{ ...start }], stepAt: [], trailFrom: 0, rings: [], pending: null };
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** The chain after the pointer has moved to `pointer`. */
export function followChain(c: Chain, pointer: Pt): Chain {
  const L = c.honeycomb.length;
  const last = c.trail[c.trail.length - 1];
  const trail = dist(last, pointer) >= TRAIL_STEP * L ? [...c.trail, { ...pointer }] : c.trail;
  let walk = c.walk;
  let stepAt = c.stepAt;
  let rings = c.rings;
  let pending = c.pending;
  let trailFrom = c.trailFrom;
  for (let i = 0; i < 64; i++) {
    const head: Cell = cellOf(c.honeycomb, walk[walk.length - 1]);
    const ways = neighboursOf(c.honeycomb, head);
    let best: Cell | null = null;
    for (const o of ways) if (!best || dist(o, pointer) < dist(best, pointer)) best = o;
    // (back the way it came, rather than off beside it, when the two are
    // much the same)
    const came = walk.length >= 2 ? ways.find((o) => o.key === walk[walk.length - 2]) : undefined;
    if (came && best && dist(came, pointer) <= dist(best, pointer) + BACK_MARGIN * L) best = came;
    if (!best || dist(best, pointer) >= dist(head, pointer) - STEP_MARGIN * L) break;
    if (walk.length >= 2 && best.key === walk[walk.length - 2]) {
      // back the way it came: the bond goes again - and where the pointer
      // went round, a ring is drawn where it came back to
      const departed = stepAt[stepAt.length - 1];
      walk = walk.slice(0, -1);
      stepAt = stepAt.slice(0, -1);
      rings = rings.filter((r) => r.at < walk.length);
      const loop = trail.slice(Math.max(departed, trailFrom));
      pending = loopRing(walk.length - 1, best, head, loop, L);
    } else {
      // round to a point it has been through: a ring of the honeycomb's -
      // unless the loop the pointer went round is longer or shorter than
      // that, when the ring is as many members as the loop is long; and
      // back to it without going round at all, the chain is taken back
      // to it
      const back = walk.lastIndexOf(best.key);
      if (back >= 0 && back < walk.length - 1) {
        const loop = trail.slice(Math.max(stepAt[back], trailFrom));
        const ring = loopRing(back, best, cellOf(c.honeycomb, walk[back + 1]), loop, L);
        // (round a hexagon, going round: closed; round anything longer,
        // taken back to it, the loop drawing a six-membered ring there; and
        // back to it without going round, taken back to it)
        if (!ring || walk.length - back !== CHAIN_RING) {
          walk = walk.slice(0, back + 1);
          stepAt = stepAt.slice(0, back);
          rings = rings.filter((r) => r.at < walk.length);
          pending = ring;
          continue;
        }
      }
      // on: a ring drawn where it goes on from is kept
      if (pending && pending.at === walk.length - 1) {
        rings = [...rings, pending];
        trailFrom = trail.length - 1;
      }
      pending = null;
      walk = [...walk, best.key];
      stepAt = [...stepAt, trail.length - 1];
    }
  }
  return { ...c, trail, walk, stepAt, rings, pending, trailFrom };
}

/** The chain as it ends: a ring the latest step back drew is kept. */
export function endChain(c: Chain): Chain {
  return c.pending ? { ...c, rings: [...c.rings, c.pending], pending: null } : c;
}

/** All the chain's rings, the one it may yet keep among them. */
export function ringsOf(c: Chain): ChainRing[] {
  return c.pending ? [...c.rings, c.pending] : c.rings;
}

/**
 * The ring a loop draws at `at`, the point it came back to, `j`, having
 * gone off along the bond to `s` and round: or none, where the way it went
 * encloses too little room, is too short or is not round - a step straight
 * back, or out and back beside the way out.
 */
function loopRing(at: number, j: Pt, s: Pt, loop: Pt[], L: number): ChainRing | null {
  // (its points no closer than the hand is steady; and all the way round:
  // the pointer may not be quite back yet)
  const path = [j];
  for (const p of loop) if (dist(p, path[path.length - 1]) >= LOOP_STEP * L) path.push(p);
  const end = loop[loop.length - 1];
  if (end && path[path.length - 1] !== end) path.push(end);
  let length = dist(path[path.length - 1], j);
  for (let i = 1; i < path.length; i++) length += dist(path[i - 1], path[i]);
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    const q = path[(i + 1) % path.length];
    const cross = p.x * q.y - q.x * p.y;
    area += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  const encloses = Math.abs(area / 2);
  if (encloses < LOOP_AREA * L * L || length < LOOP_LENGTH * L || (4 * Math.PI * encloses) / (length * length) < LOOP_ROUND) return null;
  const centroid = { x: cx / (3 * area), y: cy / (3 * area) };
  return { at, points: regularRing(j, s, CHAIN_RING, centroid) };
}

/**
 * A regular ring of `n` members with the bond from `j` to `s` as one of its
 * sides, on the side of `toward`: its atoms after `j`, `s` first, in order
 * round it.
 */
export function regularRing(j: Pt, s: Pt, n: number, toward: Pt): Pt[] {
  const side = dist(j, s);
  const mid = { x: (j.x + s.x) / 2, y: (j.y + s.y) / 2 };
  const ux = (s.x - j.x) / side;
  const uy = (s.y - j.y) / side;
  // (the side `toward` lies on, square to the bond)
  let px = -uy;
  let py = ux;
  if ((toward.x - mid.x) * px + (toward.y - mid.y) * py < 0) {
    px = -px;
    py = -py;
  }
  const apothem = side / (2 * Math.tan(Math.PI / n));
  const c = { x: mid.x + px * apothem, y: mid.y + py * apothem };
  // round from j, through s, the way that goes
  const a0 = Math.atan2(j.y - c.y, j.x - c.x);
  const a1 = Math.atan2(s.y - c.y, s.x - c.x);
  const turn = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0)) >= 0 ? 1 : -1;
  const r = side / (2 * Math.sin(Math.PI / n));
  const out: Pt[] = [];
  for (let k = 1; k < n; k++) {
    const a = a0 + (turn * 2 * Math.PI * k) / n;
    out.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
  }
  return out;
}
