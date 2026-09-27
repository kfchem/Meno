/** Plane geometry for the layout engine: points, turns and mirrors. */

export type Point = { x: number; y: number };

export const pt = (x: number, y: number): Point => ({ x, y });
export const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Point, k: number): Point => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y;
export const cross = (a: Point, b: Point): number => a.x * b.y - a.y * b.x;
export const len = (a: Point): number => Math.hypot(a.x, a.y);
export const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
export const angleOf = (a: Point): number => Math.atan2(a.y, a.x);
/** The unit vector at `angle` radians. */
export const dir = (angle: number): Point => ({ x: Math.cos(angle), y: Math.sin(angle) });
export const rad = (deg: number): number => (deg * Math.PI) / 180;
export const deg = (r: number): number => (r * 180) / Math.PI;

export function norm(a: Point): Point {
  const l = len(a);
  return l > 1e-12 ? { x: a.x / l, y: a.y / l } : { x: 1, y: 0 };
}

export function rotate(a: Point, angle: number): Point {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
}

/** An angle brought into (-pi, pi]. */
export function wrap(angle: number): number {
  let a = angle % (2 * Math.PI);
  if (a <= -Math.PI) a += 2 * Math.PI;
  if (a > Math.PI) a -= 2 * Math.PI;
  return a;
}

/** The reflection of `p` in the line through `a` and `b`. */
export function mirror(p: Point, a: Point, b: Point): Point {
  const d = norm(sub(b, a));
  const v = sub(p, a);
  const along = scale(d, dot(v, d));
  const across = sub(v, along);
  return add(a, sub(along, across));
}

export function centroid(points: readonly Point[]): Point {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  const n = Math.max(points.length, 1);
  return { x: x / n, y: y / n };
}

/** Whether segments ab and cd cross (not merely touch at an end). */
export function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const o = (p: Point, q: Point, r: Point) => Math.sign(cross(sub(q, p), sub(r, p)));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

/**
 * The directions free round a ring atom: `count` of them splitting evenly the
 * widest gap between its bonds that no ring lies in (a ring lies in the gap
 * its centre is seen in). At a fusion of three rings every gap is 120
 * degrees, and only one of them is outside.
 */
export function splitOutside(
  taken: readonly number[],
  ringCentres: readonly number[],
  count: number,
): number[] {
  if (count <= 0) return [];
  const sorted = [...taken].sort((p, q) => p - q);
  if (sorted.length < 2) return splitWidestGap(taken, count);
  let from = sorted[0];
  let gap = -1;
  sorted.forEach((t, i) => {
    const next = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + 2 * Math.PI;
    const inside = ringCentres.some((c) => {
      let u = c - t;
      while (u < 0) u += 2 * Math.PI;
      while (u >= 2 * Math.PI) u -= 2 * Math.PI;
      return u > 1e-6 && u < next - t - 1e-6;
    });
    if (!inside && next - t > gap + 1e-9) {
      gap = next - t;
      from = t;
    }
  });
  if (gap < 0) return splitWidestGap(taken, count);
  return Array.from({ length: count }, (_, i) => from + (gap * (i + 1)) / (count + 1));
}

/**
 * The directions free around a point, given the directions already taken:
 * `count` directions splitting the widest gap between them evenly. With
 * nothing taken, `count` directions evenly round, the first at `start`.
 */
export function splitWidestGap(taken: readonly number[], count: number, start = 0): number[] {
  if (count <= 0) return [];
  if (!taken.length) {
    return Array.from({ length: count }, (_, i) => start + (i * 2 * Math.PI) / count);
  }
  const sorted = [...taken].sort((p, q) => p - q);
  let from = sorted[0];
  let gap = -1;
  sorted.forEach((t, i) => {
    const next = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + 2 * Math.PI;
    if (next - t > gap + 1e-9) {
      gap = next - t;
      from = t;
    }
  });
  return Array.from({ length: count }, (_, i) => from + (gap * (i + 1)) / (count + 1));
}
