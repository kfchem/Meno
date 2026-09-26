/**
 * The convex outline of a letter's ink, from the path a font draws it with:
 * what a bond keeps clear of. Shared by the tool that writes a font's
 * metrics ahead of time (scripts/fonts/labelMetrics.ts) and by the app when
 * it reads a font the user picked.
 */

export type GlyphPoint = { x: number; y: number };

/** A drawing command of a letter's path, as font readers give them. */
export type GlyphCommand =
  | { type: "M" | "L"; x: number; y: number }
  | { type: "Q"; x1: number; y1: number; x: number; y: number }
  | {
      type: "C";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      x: number;
      y: number;
    }
  | { type: "Z" };

/**
 * The points along a path: its corners, and its curves followed in eight
 * steps each. `flipY` turns a path drawn y down (as font readers draw at a
 * size) back to y up; `scale` takes it to the units wanted.
 */
export function pathPoints(
  commands: readonly GlyphCommand[],
  scale = 1,
  flipY = true,
): GlyphPoint[] {
  const pts: GlyphPoint[] = [];
  const u = (x: number, y: number): GlyphPoint => ({
    x: x * scale,
    y: (flipY ? -y : y) * scale,
  });
  let cur: GlyphPoint = { x: 0, y: 0 };
  let start = cur;
  for (const c of commands) {
    if (c.type === "M") {
      cur = start = u(c.x, c.y);
    } else if (c.type === "L") {
      pts.push(cur);
      cur = u(c.x, c.y);
    } else if (c.type === "Q") {
      const q = u(c.x1, c.y1);
      const r = u(c.x, c.y);
      for (let s = 0; s < 8; s++) {
        const t = s / 8;
        const a = (1 - t) ** 2;
        const b = 2 * (1 - t) * t;
        const d = t * t;
        pts.push({
          x: a * cur.x + b * q.x + d * r.x,
          y: a * cur.y + b * q.y + d * r.y,
        });
      }
      cur = r;
    } else if (c.type === "C") {
      const q1 = u(c.x1, c.y1);
      const q2 = u(c.x2, c.y2);
      const r = u(c.x, c.y);
      for (let s = 0; s < 8; s++) {
        const t = s / 8;
        const a = (1 - t) ** 3;
        const b = 3 * (1 - t) ** 2 * t;
        const d = 3 * (1 - t) * t * t;
        const e = t ** 3;
        pts.push({
          x: a * cur.x + b * q1.x + d * q2.x + e * r.x,
          y: a * cur.y + b * q1.y + d * q2.y + e * r.y,
        });
      }
      cur = r;
    } else {
      pts.push(cur);
      cur = start;
    }
  }
  pts.push(cur);
  return pts;
}

/** The convex hull, anticlockwise, from the lowest point (leftmost of those). */
export function convexHull(points: readonly GlyphPoint[]): GlyphPoint[] {
  const key = (p: GlyphPoint) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`;
  const uniq = [...new Map(points.map((p) => [key(p), p])).values()];
  uniq.sort((a, b) => a.x - b.x || a.y - b.y);
  if (uniq.length < 3) return uniq;
  const cross = (o: GlyphPoint, a: GlyphPoint, b: GlyphPoint) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: GlyphPoint[] = [];
  for (const p of uniq) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    )
      lower.pop();
    lower.push(p);
  }
  const upper: GlyphPoint[] = [];
  for (const p of [...uniq].reverse()) {
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    )
      upper.pop();
    upper.push(p);
  }
  const h = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  let low = 0;
  h.forEach((p, i) => {
    if (p.y < h[low].y || (p.y === h[low].y && p.x < h[low].x)) low = i;
  });
  return [...h.slice(low), ...h.slice(0, low)];
}

/**
 * The hull with fewer corners: while a corner stands less than `tolerance`
 * off the line between its neighbours, the one standing least is dropped -
 * which cuts into the ink by no more than that.
 */
export function easeHull(
  hull: readonly GlyphPoint[],
  tolerance: number,
): GlyphPoint[] {
  const out = [...hull];
  while (out.length > 4) {
    let best = -1;
    let bestD = tolerance;
    for (let i = 0; i < out.length; i++) {
      const a = out[(i + out.length - 1) % out.length];
      const b = out[i];
      const c = out[(i + 1) % out.length];
      const L = Math.hypot(c.x - a.x, c.y - a.y);
      const d = L
        ? Math.abs((c.x - a.x) * (a.y - b.y) - (a.x - b.x) * (c.y - a.y)) / L
        : 0;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) break;
    out.splice(best, 1);
  }
  return out;
}

/**
 * How far a hull may cut into a letter's ink, in ems: 15 units of a
 * 2048-unit em, under a tenth of a point in a 10 pt label.
 */
export const HULL_TOLERANCE_EM = 15 / 2048;

/** A letter's ink hull in ems, y up, from its path drawn at one em, y down. */
export function inkHull(commands: readonly GlyphCommand[]): GlyphPoint[] {
  return easeHull(convexHull(pathPoints(commands)), HULL_TOLERANCE_EM);
}
