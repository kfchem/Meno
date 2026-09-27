/**
 * How good a 2D layout of a molecule is, in numbers: what a chemist sees at
 * a glance as untidy, measured so that one layout can be compared with
 * another, and a change to the layout engine with the last.
 *
 * All lengths are taken against the layout's own typical bond (the median),
 * so the scale it was drawn at does not matter.
 */
import { smallestRings, type Edge } from "./rings";

export type Geometry = {
  x: readonly number[];
  y: readonly number[];
  edges: readonly Edge[];
  /** Bond orders, where known: a triple bond, or two double bonds, sit in a line. */
  orders?: readonly number[];
  /** Which bonds carry a wedge or hashes, by index. */
  wedged?: readonly number[];
  /** Which atoms are drawn with a label (O, N, a charged C...): labels need room. */
  labelled?: readonly boolean[];
};

export type LayoutMetrics = {
  /** How much bond lengths vary: their standard deviation over their mean. */
  bondSpread: number;
  /** How far, on average, the angles between bonds are from ideal, in degrees. */
  angleError: number;
  /** How far, on average, rings of up to eight are from regular polygons, in bond lengths. */
  ringError: number;
  /** Atoms not bonded to each other but closer than half a bond. */
  overlaps: number;
  /** Bonds crossing bonds they do not share an atom with. */
  crossings: number;
  /** Atoms lying on a bond they are not part of (within 0.3 of a bond). */
  clashes: number;
  /**
   * How far, on average, the angles round a large ring (nine or more) are
   * from a zigzag's 120 degrees, either way - a macrocycle drawn as a round
   * polygon is far off - in degrees.
   */
  macroAngleError: number;
  /** Wedges and hashes on ring bonds, where they are hard to read. */
  ringWedges: number;
  /** Labelled atoms, not bonded, so close their labels crowd (under 0.8 of a bond). */
  crowdedLabels: number;
  /** All of it in one number, lower better, for putting layouts in order. */
  score: number;
};

const TAU = Math.PI * 2;
const deg = (r: number) => (r * 180) / Math.PI;

function median(v: number[]): number {
  if (!v.length) return 1;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** How far a ring is from a regular polygon of its size, in bond lengths. */
export function ringIrregularity(
  xs: readonly number[],
  ys: readonly number[],
  ring: readonly number[],
  bond: number,
): number {
  const k = ring.length;
  const cx = ring.reduce((s, i) => s + xs[i], 0) / k;
  const cy = ring.reduce((s, i) => s + ys[i], 0) / k;
  const ideal = bond / (2 * Math.sin(Math.PI / k)); // circumradius
  let best = Infinity;
  for (const dir of [1, -1]) {
    // the regular polygon's turn that best fits these vertices
    let sx = 0;
    let sy = 0;
    ring.forEach((a, i) => {
      const t = Math.atan2(ys[a] - cy, xs[a] - cx) - (dir * i * TAU) / k;
      sx += Math.cos(t);
      sy += Math.sin(t);
    });
    const t0 = Math.atan2(sy, sx);
    let sum = 0;
    ring.forEach((a, i) => {
      const t = t0 + (dir * i * TAU) / k;
      const dx = xs[a] - (cx + ideal * Math.cos(t));
      const dy = ys[a] - (cy + ideal * Math.sin(t));
      sum += dx * dx + dy * dy;
    });
    best = Math.min(best, Math.sqrt(sum / k) / bond);
  }
  return best;
}

function segmentsCross(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): boolean {
  const o = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
    Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
  return (
    o(ax, ay, bx, by, cx, cy) * o(ax, ay, bx, by, dx, dy) < 0 &&
    o(cx, cy, dx, dy, ax, ay) * o(cx, cy, dx, dy, bx, by) < 0
  );
}

function pointToSegment(
  px: number, py: number, ax: number, ay: number, bx: number, by: number,
): number {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2)) : 0;
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

export function layoutMetrics(g: Geometry): LayoutMetrics {
  const { x, y, edges } = g;
  const n = x.length;
  const lengths = edges.map(([a, b]) => Math.hypot(x[a] - x[b], y[a] - y[b]));
  const L = median(lengths);
  const mean = lengths.reduce((s, v) => s + v, 0) / Math.max(lengths.length, 1);
  const bondSpread = lengths.length
    ? Math.sqrt(lengths.reduce((s, v) => s + (v - mean) ** 2, 0) / lengths.length) / mean
    : 0;

  const rings = smallestRings(n, edges);
  const inRing = new Set(rings.flat());
  const bonded = new Set(edges.map(([a, b]) => (a < b ? `${a},${b}` : `${b},${a}`)));
  const neighbours: number[][] = Array.from({ length: n }, () => []);
  const orderOf = new Map<string, number>();
  edges.forEach(([a, b], e) => {
    neighbours[a].push(b);
    neighbours[b].push(a);
    orderOf.set(a < b ? `${a},${b}` : `${b},${a}`, g.orders?.[e] ?? 1);
  });

  // angles: at an atom in no ring, its bonds evenly spread (a pair at 120°,
  // or 180° across a triple bond or between two double bonds)
  let angleSum = 0;
  let angleCount = 0;
  for (let a = 0; a < n; a++) {
    const nb = neighbours[a];
    if (nb.length < 2 || inRing.has(a)) continue;
    const dirs = nb
      .map((b) => Math.atan2(y[b] - y[a], x[b] - x[a]))
      .sort((p, q) => p - q);
    const gaps = dirs.map((d, i) =>
      i + 1 < dirs.length ? dirs[i + 1] - d : dirs[0] + TAU - d,
    );
    let ideal = TAU / nb.length;
    if (nb.length === 2) {
      const o = nb.map((b) => orderOf.get(a < b ? `${a},${b}` : `${b},${a}`) ?? 1);
      const linear = o.includes(3) || (o[0] === 2 && o[1] === 2);
      ideal = linear ? Math.PI : (2 * Math.PI) / 3;
      // either way round: the smaller gap against the ideal
      angleSum += Math.abs(deg(Math.min(...gaps) - (linear ? Math.PI : ideal)));
    } else {
      for (const gap of gaps) angleSum += Math.abs(deg(gap - ideal)) / gaps.length;
    }
    angleCount++;
  }
  const angleError = angleCount ? angleSum / angleCount : 0;

  const small = rings.filter((r) => r.length <= 8);
  const ringError = small.length
    ? small.reduce((s, r) => s + ringIrregularity(x, y, r, L), 0) / small.length
    : 0;

  // round a macrocycle: each atom that is in no smaller ring, its angle
  // inside the ring against 120° or 240°, whichever is nearer
  const inSmall = new Set(rings.filter((r) => r.length <= 8).flat());
  let macroSum = 0;
  let macroCount = 0;
  for (const r of rings.filter((r) => r.length >= 9)) {
    r.forEach((a, i) => {
      if (inSmall.has(a)) return;
      const p = r[(i + r.length - 1) % r.length];
      const q = r[(i + 1) % r.length];
      const t =
        Math.atan2(y[p] - y[a], x[p] - x[a]) - Math.atan2(y[q] - y[a], x[q] - x[a]);
      const inner = deg(Math.abs(Math.atan2(Math.sin(t), Math.cos(t)))); // 0..180
      macroSum += Math.abs(inner - 120);
      macroCount++;
    });
  }
  const macroAngleError = macroCount ? macroSum / macroCount : 0;

  const ringBonds = new Set<string>();
  for (const r of rings) {
    r.forEach((a, i) => {
      const b = r[(i + 1) % r.length];
      ringBonds.add(a < b ? `${a},${b}` : `${b},${a}`);
    });
  }
  const ringWedges = (g.wedged ?? []).filter((e) => {
    const [a, b] = edges[e] ?? [];
    return a != null && ringBonds.has(a < b ? `${a},${b}` : `${b},${a}`);
  }).length;

  let crowdedLabels = 0;
  if (g.labelled) {
    for (let a = 0; a < n; a++) {
      if (!g.labelled[a]) continue;
      for (let b = a + 1; b < n; b++) {
        if (!g.labelled[b] || bonded.has(`${a},${b}`)) continue;
        if (Math.hypot(x[a] - x[b], y[a] - y[b]) < 0.8 * L) crowdedLabels++;
      }
    }
  }

  let overlaps = 0;
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      if (bonded.has(`${a},${b}`)) continue;
      if (Math.hypot(x[a] - x[b], y[a] - y[b]) < 0.5 * L) overlaps++;
    }
  }

  let crossings = 0;
  for (let i = 0; i < edges.length; i++) {
    const [a, b] = edges[i];
    for (let j = i + 1; j < edges.length; j++) {
      const [c, d] = edges[j];
      if (a === c || a === d || b === c || b === d) continue;
      if (segmentsCross(x[a], y[a], x[b], y[b], x[c], y[c], x[d], y[d])) crossings++;
    }
  }

  let clashes = 0;
  for (let p = 0; p < n; p++) {
    for (const [a, b] of edges) {
      if (p === a || p === b) continue;
      if (pointToSegment(x[p], y[p], x[a], y[a], x[b], y[b]) < 0.3 * L) clashes++;
    }
  }

  const score =
    10 * overlaps +
    5 * crossings +
    3 * clashes +
    5 * crowdedLabels +
    2 * ringWedges +
    100 * bondSpread +
    angleError / 5 +
    macroAngleError / 5 +
    30 * ringError;
  return {
    bondSpread,
    angleError,
    ringError,
    overlaps,
    crossings,
    clashes,
    macroAngleError,
    ringWedges,
    crowdedLabels,
    score,
  };
}
