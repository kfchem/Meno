/**
 * A reader's answer as Meno carries it from its own worker to the page
 * (docs/FILE-IO.md, *Response*): runs of numbers - a molecule's geometries,
 * the coordinates of its atoms - in buffers, handed over rather than
 * copied; the rest as it is, small plain data. What is read is the same;
 * only how it is carried differs. Measured, a 2000-frame XYZ file came over
 * in 48 ms with no frame dropped this way, against 124 ms and a page held
 * up 24 ms as objects.
 *
 * - A list of numbers - a frame - goes as one buffer.
 * - A list of points - objects with numbers `x`, `y` and maybe `z`: atoms,
 *   "+" signs - goes as their coordinates in one buffer, a column after
 *   another, and the rest of each as it is, its coordinates' places kept
 *   (as 0) so that each comes back with its fields in their order.
 * Short lists go as they are: a buffer is not worth it for a few numbers.
 */

/** Lists shorter than this go as they are. */
const LEAST = 8;

const NUMBERS = "__numbers";
const POINTS = "__points";

type Numbers = { [NUMBERS]: Float64Array };
type Points = { [POINTS]: { axes: ("x" | "y" | "z")[]; at: Float64Array; rest: unknown[] } };

const isNumber = (v: unknown): v is number => typeof v === "number";
const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) && !ArrayBuffer.isView(v) && Object.getPrototypeOf(v) === Object.prototype;

/** `value` as Meno's worker sends it, and the buffers to hand over with it. */
export function pack(value: unknown): { packed: unknown; transfer: ArrayBuffer[] } {
  const transfer: ArrayBuffer[] = [];
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) {
      if (v.length >= LEAST && v.every(isNumber)) {
        const f = Float64Array.from(v);
        transfer.push(f.buffer);
        return { [NUMBERS]: f } satisfies Numbers;
      }
      if (v.length >= LEAST && v.every((p) => isPlain(p) && isNumber(p.x) && isNumber(p.y))) {
        const axes: ("x" | "y" | "z")[] = v.every((p) => isNumber((p as { z?: unknown }).z)) ? ["x", "y", "z"] : ["x", "y"];
        const at = new Float64Array(axes.length * v.length);
        const rest = v.map((p, i) => {
          const point = p as Record<string, unknown>;
          axes.forEach((axis, k) => (at[k * v.length + i] = point[axis] as number));
          return walk({ ...point, ...Object.fromEntries(axes.map((axis) => [axis, 0])) });
        });
        transfer.push(at.buffer);
        return { [POINTS]: { axes, at, rest } } satisfies Points;
      }
      return v.map(walk);
    }
    if (isPlain(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return { packed: walk(value), transfer };
}

/** What `pack` sent, as it was. */
export function unpack(packed: unknown): unknown {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (!isPlain(v)) return v;
    if (NUMBERS in v) return Array.from((v as Numbers)[NUMBERS]);
    if (POINTS in v) {
      const { axes, at, rest } = (v as Points)[POINTS];
      const n = rest.length;
      return rest.map((r, i) => {
        const point = walk(r) as Record<string, unknown>;
        axes.forEach((axis, k) => (point[axis] = at[k * n + i]));
        return point;
      });
    }
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
  };
  return walk(packed);
}
