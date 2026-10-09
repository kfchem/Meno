/**
 * What a selection takes in, and what is done to it - pure, over the
 * editor's model:
 *
 * - the atoms a box or a lasso holds, and the bonds between them;
 * - the atoms and bonds along the bonds from one atom to another (a
 *   Shift+click's);
 * - where the selected atoms go when the selection is turned about its
 *   middle, or turned over.
 */
import type { Bond, Model, Sel } from "../store/types";

type Pt = { x: number; y: number };

/** The bonds whose two atoms are both among `atoms`. */
export function bondsAmong(model: Pick<Model, "bonds">, atoms: ReadonlySet<number>): Set<number> {
  return new Set(model.bonds.filter((b) => atoms.has(b.a) && atoms.has(b.b)).map((b) => b.id));
}

/** The atoms inside the box with corners `p` and `q`, and the bonds among them. */
export function inBox(model: Model, p: Pt, q: Pt): Sel {
  const [x0, x1] = [Math.min(p.x, q.x), Math.max(p.x, q.x)];
  const [y0, y1] = [Math.min(p.y, q.y), Math.max(p.y, q.y)];
  const atoms = new Set(model.atoms.filter((a) => a.x >= x0 && a.x <= x1 && a.y >= y0 && a.y <= y1).map((a) => a.id));
  return { atoms, bonds: bondsAmong(model, atoms) };
}

/** Whether `p` is inside the polygon `ring` (by the even-odd rule). */
export function insidePolygon(p: Pt, ring: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** The atoms inside a lasso - the path the pointer drew, closed - and the bonds among them. */
export function inLasso(model: Model, path: readonly Pt[]): Sel {
  if (path.length < 3) return { atoms: new Set(), bonds: new Set() };
  const atoms = new Set(model.atoms.filter((a) => insidePolygon(a, path)).map((a) => a.id));
  return { atoms, bonds: bondsAmong(model, atoms) };
}

/**
 * The molecules in 3D a box (two corners) or a lasso (three points or more)
 * takes: those whose centre stands inside it.
 */
export function molecules3dIn(molecules: readonly { id: number; at: Pt }[], kind: "box" | "lasso", points: readonly Pt[]): number[] {
  if (kind === "box") {
    if (points.length < 2) return [];
    const [p, q] = points;
    const [x0, x1] = [Math.min(p.x, q.x), Math.max(p.x, q.x)];
    const [y0, y1] = [Math.min(p.y, q.y), Math.max(p.y, q.y)];
    return molecules.filter((m) => m.at.x >= x0 && m.at.x <= x1 && m.at.y >= y0 && m.at.y <= y1).map((m) => m.id);
  }
  if (points.length < 3) return [];
  return molecules.filter((m) => insidePolygon(m.at, points)).map((m) => m.id);
}

/** A picture's corners on the page, as it is turned: lower left, lower right, upper right, upper left, before it is. */
export function cornersOf(p: { x: number; y: number; w: number; h: number; turn?: number }): Pt[] {
  const c = Math.cos(p.turn ?? 0);
  const s = Math.sin(p.turn ?? 0);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([i, j]) => {
    const dx = (i * p.w) / 2;
    const dy = (j * p.h) / 2;
    return { x: p.x + dx * c - dy * s, y: p.y + dx * s + dy * c };
  });
}

/**
 * The atoms and bonds along the bonds from `from` to `to`, the shortest way
 * (the fewest bonds), both ends included; null where no bonds join them.
 */
export function pathBetween(model: Model, from: number, to: number): Sel | null {
  const next = new Map<number, { atom: number; bond: number }[]>();
  for (const b of model.bonds) {
    next.set(b.a, [...(next.get(b.a) ?? []), { atom: b.b, bond: b.id }]);
    next.set(b.b, [...(next.get(b.b) ?? []), { atom: b.a, bond: b.id }]);
  }
  const back = new Map<number, { atom: number; bond: number } | null>([[from, null]]);
  const queue = [from];
  while (queue.length && !back.has(to)) {
    const at = queue.shift()!;
    for (const step of next.get(at) ?? []) {
      if (back.has(step.atom)) continue;
      back.set(step.atom, { atom: at, bond: step.bond });
      queue.push(step.atom);
    }
  }
  if (!back.has(to)) return null;
  const atoms = new Set<number>([to]);
  const bonds = new Set<number>();
  for (let at = to, step = back.get(to); step; at = step.atom, step = back.get(at)) {
    atoms.add(step.atom);
    bonds.add(step.bond);
  }
  return { atoms, bonds };
}

/** The middle of the selected atoms: of the box round them. */
export function middleOf(model: Model, atoms: ReadonlySet<number>): Pt | null {
  const at = model.atoms.filter((a) => atoms.has(a.id));
  if (!at.length) return null;
  const xs = at.map((a) => a.x);
  const ys = at.map((a) => a.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

/** Where the selected atoms go, the selection turned by `angle` (radians, anticlockwise) about `about`. */
export function turned(
  atoms: readonly { id: number; x: number; y: number }[],
  about: Pt,
  angle: number,
): { id: number; x: number; y: number }[] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return atoms.map((a) => {
    const dx = a.x - about.x;
    const dy = a.y - about.y;
    return { id: a.id, x: about.x + dx * c - dy * s, y: about.y + dx * s + dy * c };
  });
}

/**
 * The selection turned over, left to right (about the upright line through
 * its middle) or top to bottom: what was in front of the page is now
 * behind it, so each wedge on it becomes hashes and each hashes a wedge, and
 * a depth changes sign - the same molecule, seen from its other side, not
 * its mirror image.
 */
export function turnedOver(
  model: Model,
  atoms: ReadonlySet<number>,
  axis: "vertical" | "horizontal",
): { atoms: { id: number; x: number; y: number; z?: number }[]; bonds: Pick<Bond, "id" | "stereo">[] } {
  const mid = middleOf(model, atoms);
  if (!mid) return { atoms: [], bonds: [] };
  const moved = model.atoms
    .filter((a) => atoms.has(a.id))
    .map((a) => ({
      id: a.id,
      x: axis === "vertical" ? 2 * mid.x - a.x : a.x,
      y: axis === "horizontal" ? 2 * mid.y - a.y : a.y,
      ...(a.z != null ? { z: -a.z } : {}),
    }));
  const bonds = model.bonds
    .filter((b) => atoms.has(b.a) && atoms.has(b.b) && (b.stereo === "up" || b.stereo === "down"))
    .map((b) => ({ id: b.id, stereo: b.stereo === "up" ? ("down" as const) : ("up" as const) }));
  return { atoms: moved, bonds };
}
