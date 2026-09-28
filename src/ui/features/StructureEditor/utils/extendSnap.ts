/**
 * Where a bond being drawn out of an atom goes, as the pointer leads it.
 *
 * A bond drawn on its own points at the pointer, held to a 30-degree grid -
 * except that it is drawn to the direction that makes 120 degrees with a
 * bond already at the atom whenever the pointer is near it, which is where
 * a chemist's next bond almost always goes. A chain drawn in one stroke
 * turns 120 degrees at every atom, one way or the other, whichever brings
 * it nearer the pointer, and zigzags when the pointer goes straight.
 */

export type Pt = { x: number; y: number };

const TAU = Math.PI * 2;
const GRID = Math.PI / 6; // 30°
const TRIGONAL = (2 * Math.PI) / 3; // 120°
/** How near the pointer's direction has to be for 120° to take it. */
const TRIGONAL_REACH = (20 * Math.PI) / 180;
/** How near another bond a new one may point: 60 degrees, not 30 or 0. */
const CROWDED = (45 * Math.PI) / 180;

const norm = (a: number) => ((a % TAU) + TAU) % TAU;
const between = (a: number, b: number) => {
  const d = Math.abs(norm(a) - norm(b));
  return d > Math.PI ? TAU - d : d;
};
const toward = (from: Pt, to: Pt) => Math.atan2(to.y - from.y, to.x - from.x);
const out = (from: Pt, angle: number, length: number): Pt => ({
  x: from.x + length * Math.cos(angle),
  y: from.y + length * Math.sin(angle),
});

export type SnappedBond = {
  /** Where the new atom goes. */
  end: Pt;
  angle: number;
  /**
   * The direction of the bond it makes 120 degrees with, when that is what
   * it snapped to: the arc between the two is shown, so a 120-degree bond
   * can be told from one that only happens to sit on the grid.
   */
  trigonalTo?: number;
};

/**
 * A single bond out of `tip`, which already has bonds to `neighbours`,
 * toward `pointer`, `length` long.
 */
export function snapBond(
  tip: Pt,
  neighbours: Pt[],
  pointer: Pt,
  length: number,
): SnappedBond {
  const want = toward(tip, pointer);
  const taken = neighbours
    .filter((n) => Math.hypot(n.x - tip.x, n.y - tip.y) > 1e-9)
    .map((n) => toward(tip, n));
  let best: { angle: number; from: number; off: number } | null = null;
  for (const from of taken) {
    for (const turn of [TRIGONAL, -TRIGONAL]) {
      const angle = norm(from + turn);
      // not onto, or crowding, another bond at the atom
      if (taken.some((t) => between(t, angle) < CROWDED)) continue;
      const off = between(angle, want);
      if (off <= TRIGONAL_REACH && (!best || off < best.off)) {
        best = { angle, from, off };
      }
    }
  }
  if (best) {
    return {
      end: out(tip, best.angle, length),
      angle: best.angle,
      trigonalTo: best.from,
    };
  }
  // the grid angle nearest the pointer that does not run into a bond there
  const near = Math.round(want / GRID) * GRID;
  let angle = near;
  for (let k = 0; k <= 6; k++) {
    const tries = k === 0 ? [near] : [near + k * GRID, near - k * GRID];
    tries.sort((a, b) => between(a, want) - between(b, want));
    const free = tries.find((a) => !taken.some((t) => between(t, a) < CROWDED));
    if (free != null) {
      angle = free;
      break;
    }
  }
  return { end: out(tip, angle, length), angle };
}

/**
 * The first bond of a chain. Out of a bare atom it leaves 30 degrees to one
 * side of the way the pointer leads, so that a straight stroke draws the
 * usual zigzag along it rather than a crenellation; out of an atom with a
 * bond it leaves at 120 degrees to one, whichever way is nearer the
 * pointer. `turn` says which side of the pointer's way it went, for the
 * chain to turn back the other way next.
 */
export function chainStart(
  tip: Pt,
  neighbours: Pt[],
  pointer: Pt,
  length: number,
): SnappedBond & { turn: 1 | -1 | 0 } {
  const want = toward(tip, pointer);
  const taken = neighbours
    .filter((n) => Math.hypot(n.x - tip.x, n.y - tip.y) > 1e-9)
    .map((n) => toward(tip, n));
  const side = (angle: number): 1 | -1 =>
    Math.sin(angle - want) >= 0 ? 1 : -1;
  if (taken.length === 0) {
    const axis = Math.round(want / GRID) * GRID;
    const angle = axis + GRID; // 30° anticlockwise of it, then clockwise...
    return { end: out(tip, angle, length), angle, turn: side(angle) };
  }
  let best: { angle: number; from: number } | null = null;
  for (const from of taken) {
    for (const turn of [TRIGONAL, -TRIGONAL]) {
      const angle = norm(from + turn);
      if (taken.some((t) => between(t, angle) < CROWDED)) continue;
      if (!best || between(angle, want) < between(best.angle, want)) {
        best = { angle, from };
      }
    }
  }
  if (!best) return { ...snapBond(tip, neighbours, pointer, length), turn: 0 };
  return {
    end: out(tip, best.angle, length),
    angle: best.angle,
    trigonalTo: best.from,
    turn: side(best.angle),
  };
}

/**
 * The next bond of a chain drawn in one stroke: out of `tip`, which the
 * chain reached from `previous`, turned 120 degrees one way or the other -
 * toward the pointer, or, when both are about as near, the other way from
 * the last turn (`lastTurn`, +1 or -1), which zigzags a straight stroke.
 */
export function chainStep(
  previous: Pt,
  tip: Pt,
  pointer: Pt,
  lastTurn: number,
  length: number,
): { end: Pt; angle: number; turn: 1 | -1 } {
  const back = toward(tip, previous);
  const ways = ([1, -1] as const).map((turn) => {
    // a turn of +1 bends the chain to the left of where it was going
    const angle = norm(back - turn * TRIGONAL);
    const end = out(tip, angle, length);
    return { end, angle, turn, far: Math.hypot(end.x - pointer.x, end.y - pointer.y) };
  });
  const [a, b] = ways;
  const tie = Math.abs(a.far - b.far) < 0.25 * length;
  const pick = tie
    ? lastTurn === 1
      ? b
      : a
    : a.far < b.far
      ? a
      : b;
  return { end: pick.end, angle: pick.angle, turn: pick.turn };
}
