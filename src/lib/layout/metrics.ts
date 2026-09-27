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
  /** Element symbols and hydrogen counts, where known: an acid is told by them. */
  elements?: readonly string[];
  hydrogens?: readonly number[];
  /** The rings, where the caller has them already (they depend only on the bonds). */
  rings?: readonly (readonly number[])[];
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
   * polygon is far off - in degrees. Not a ring that runs mostly through
   * other rings (a porphyrin's, a cyclodextrin's): that is a ring of rings.
   */
  macroAngleError: number;
  /** Wedges and hashes on ring bonds, where they are hard to read. */
  ringWedges: number;
  /** Labelled atoms, not bonded, so close their labels crowd (under 0.8 of a bond). */
  crowdedLabels: number;
  /**
   * How far the drawing is turned off the 30-degree lattice, in degrees (0
   * to 15): the turn that brings the bonds that can lie on it - those of
   * four- and six-membered rings, and those in no ring - nearest to it.
   */
  tilt: number;
  /**
   * How far, on average, those bonds are still off the lattice once the
   * drawing is turned onto it: parts drawn askew to the rest, in degrees.
   */
  gridError: number;
  /**
   * How far, on average, a ring atom's other bonds - substituents, an H at a
   * ring fusion - are from splitting the room outside the ring evenly, in
   * degrees.
   */
  substituentError: number;
  /** How far long chains are folded rather than drawn out straight, 0 to 1. */
  chainFold: number;
  /** How far long chains are from running parallel, as lipids' do, in degrees. */
  chainSplay: number;
  /**
   * How far, on average, the open parts of a structure run from level, in
   * degrees: each strand of atoms in no ring - ring to ring, ring to end,
   * branch to branch - along the axis of its zigzag, weighed by its length.
   */
  chainTilt: number;
  /**
   * How far the drawing's long axis is from level, in degrees, scaled by
   * how much longer than broad it is: a round drawing has no axis to tilt.
   */
  axisTilt: number;
  /** Height over width: a drawing reads best wider than it is tall. */
  aspect: number;
  /** Height over width of the tallest ring of twelve or more: a macrocycle lies wide. */
  macroAspect: number;
  /**
   * Breaches of the order a drawing is read in, left to right and top to
   * bottom: an acid at the end of a chain on the right, a ring system to
   * the left of the chains out of it, the rings hung on a macrocycle to its
   * right and below it (half a breach each way it is not).
   */
  readingOrder: number;
  /**
   * How far the largest fused ring system is from the way IUPAC orients a
   * fused system for numbering: as many rings as can be in a horizontal row,
   * then as many of the rest as can be above and to the right of it, and as
   * few below and to the left. Rings short of each, counted.
   */
  ringOrder: number;
  /** All of it in one number, lower better, for putting layouts in order. */
  score: number;
};

/**
 * What each measure costs in the score, per unit. A fault a chemist cannot
 * miss (atoms on top of each other, bonds crossing) outweighs any amount of
 * untidiness; a turned drawing costs more than parts askew within it, which
 * some skeletons cannot avoid.
 */
export const SCORE_WEIGHTS = {
  overlaps: 10,
  crossings: 5,
  clashes: 3,
  crowdedLabels: 5,
  ringWedges: 2,
  bondSpread: 50,
  angleError: 0.3,
  macroAngleError: 0.5,
  ringError: 30,
  tilt: 0.4,
  gridError: 0.1,
  substituentError: 0.2,
  chainFold: 10,
  chainSplay: 0.05,
  chainTilt: 0.08,
  axisTilt: 0.05,
  aspect: 5,
  macroAspect: 5,
  readingOrder: 3,
  ringOrder: 2,
} as const;

/**
 * The score, measure by measure: what each adds. Aspect ratios cost only
 * past square.
 */
export function scoreParts(m: Omit<LayoutMetrics, "score">): Record<keyof typeof SCORE_WEIGHTS, number> {
  const w = SCORE_WEIGHTS;
  const parts = {} as Record<keyof typeof SCORE_WEIGHTS, number>;
  for (const k of Object.keys(w) as (keyof typeof SCORE_WEIGHTS)[]) parts[k] = w[k] * m[k];
  parts.aspect = w.aspect * Math.max(0, m.aspect - 1);
  parts.macroAspect = w.macroAspect * Math.max(0, m.macroAspect - 1);
  return parts;
}

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
  // (a bond to a drawn H is drawn short, by choice: it is left out)
  const isH = (a: number) => g.elements?.[a] === "H";
  const lengths = edges
    .filter(([a, b]) => !isH(a) && !isH(b))
    .map(([a, b]) => Math.hypot(x[a] - x[b], y[a] - y[b]));
  const L = median(lengths);
  const mean = lengths.reduce((s, v) => s + v, 0) / Math.max(lengths.length, 1);
  const bondSpread = lengths.length
    ? Math.sqrt(lengths.reduce((s, v) => s + (v - mean) ** 2, 0) / lengths.length) / mean
    : 0;

  const rings = (g.rings as number[][] | undefined) ?? smallestRings(n, edges);
  const inRing = new Set(rings.flat());
  // ring systems: rings sharing atoms
  const systemOf = new Map<number, number>();
  const systems: Set<number>[] = [];
  for (const r of rings) {
    const touching = [...new Set(r.map((a) => systemOf.get(a)).filter((s): s is number => s != null))];
    const merged = new Set<number>(r);
    for (const t of touching) for (const a of systems[t]) merged.add(a);
    const id = systems.length;
    systems.push(merged);
    for (const a of merged) systemOf.set(a, id);
    for (const t of touching) systems[t] = new Set();
  }
  const live = systems.filter((s) => s.size > 0);
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
  // (not one that runs through other rings - a porphyrin's, a
  // cyclodextrin's: that is a ring of rings, set round a circle)
  const threaded = (r: number[]) =>
    new Set(
      rings
        .filter((q) => q.length < r.length && q.filter((a) => r.includes(a)).length >= 3)
        .flatMap((q) => q.filter((a) => r.includes(a))),
    ).size >=
    0.4 * r.length;
  for (const r of rings.filter((r) => r.length >= 9 && !threaded(r))) {
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

  // the 30° lattice: the bonds of four- and six-membered rings and those in
  // no ring can all lie on it; five-membered rings and macrocycles cannot,
  // nor a ring bridged across another (sharing three atoms or more with
  // it), which is drawn in perspective. The turn that brings those bonds
  // nearest to it is how far the drawing is tilted, and what is left after
  // that turn how far its parts are askew.
  const fitsLattice = new Set<string>();
  const offLattice = new Set<string>();
  const square = (r: readonly number[]) =>
    (r.length === 4 || r.length === 6) &&
    rings.every((q) => q === r || q.filter((a) => r.includes(a)).length <= 2);
  for (const r of rings) {
    const fits = square(r);
    r.forEach((a, i) => {
      const b = r[(i + 1) % r.length];
      (fits ? fitsLattice : offLattice).add(a < b ? `${a},${b}` : `${b},${a}`);
    });
  }
  // The eye takes the largest ring system as the frame the drawing is
  // square to - of those with rings that can lie on the lattice, and all of
  // the largest where several are as large. A ring hung off it askew is then
  // askew, rather than the frame tilted. Without a ring, every bond counts.
  const latticeDirs: { t: number; frame: boolean }[] = [];
  const fitting = live.filter((sys) => rings.some((r) => square(r) && r.every((a) => sys.has(a))));
  const frameSize = Math.max(0, ...fitting.map((sys) => sys.size));
  const frames = fitting.filter((sys) => sys.size === frameSize);
  for (const [a, b] of edges) {
    const k = a < b ? `${a},${b}` : `${b},${a}`;
    if (offLattice.has(k) && !fitsLattice.has(k)) continue;
    const frame = frames.length
      ? fitsLattice.has(k) && frames.some((sys) => sys.has(a) && sys.has(b))
      : true;
    latticeDirs.push({ t: deg(Math.atan2(y[b] - y[a], x[b] - x[a])), frame });
  }
  const offBy = (turn: number, frameOnly: boolean) => {
    let sum = 0;
    let count = 0;
    for (const { t, frame } of latticeDirs) {
      if (frameOnly && !frame) continue;
      const u = t - turn;
      sum += Math.abs(u - 30 * Math.round(u / 30));
      count++;
    }
    return count ? sum / count : 0;
  };
  let turn = 0;
  let best = offBy(0, true);
  for (let i = -150; i < 150; i++) {
    const e = offBy(i / 10, true);
    if (e < best - 1e-9) {
      best = e;
      turn = i / 10;
    }
  }
  let tilt = Math.abs(turn);
  // A frame whose rings cannot all lie on the lattice together - two
  // benzene rings either side of a five-membered one, as in fluorene - is
  // square when it is set straight by its own shape: its long axis level
  // or upright.
  if (frames.length && best > 2) {
    const inFrame = [...new Set(frames.flatMap((sys) => [...sys]))];
    const fx = inFrame.reduce((sum, a) => sum + x[a], 0) / inFrame.length;
    const fy = inFrame.reduce((sum, a) => sum + y[a], 0) / inFrame.length;
    let fxx = 0;
    let fyy = 0;
    let fxy = 0;
    for (const a of inFrame) {
      fxx += (x[a] - fx) ** 2;
      fyy += (y[a] - fy) ** 2;
      fxy += (x[a] - fx) * (y[a] - fy);
    }
    const along = Math.abs(deg(0.5 * Math.atan2(2 * fxy, fxx - fyy))); // 0..90
    tilt = Math.min(tilt, along, 90 - along);
  }
  const gridError = offBy(turn, false);

  // a ring atom's other bonds, against splitting the widest room between
  // its ring bonds evenly
  const ringNeighbours: number[][] = Array.from({ length: n }, () => []);
  for (const r of rings) {
    r.forEach((a, i) => {
      for (const b of [r[(i + 1) % r.length], r[(i + r.length - 1) % r.length]]) {
        if (!ringNeighbours[a].includes(b)) ringNeighbours[a].push(b);
      }
    });
  }
  let subSum = 0;
  let subCount = 0;
  for (let a = 0; a < n; a++) {
    const inside = ringNeighbours[a];
    const outside = neighbours[a].filter((b) => !inside.includes(b));
    if (inside.length < 2 || outside.length === 0) continue;
    const dir = (b: number) => Math.atan2(y[b] - y[a], x[b] - x[a]);
    const ringDirs = inside.map(dir).sort((p, q) => p - q);
    // the widest gap no ring lies in: at a fusion of three rings every gap
    // is 120 degrees, and only one is outside
    const centres = rings
      .filter((r) => r.includes(a) && r.length < 9)
      .map((r) => {
        const rx = r.reduce((sum, v) => sum + x[v], 0) / r.length;
        const ry = r.reduce((sum, v) => sum + y[v], 0) / r.length;
        return Math.atan2(ry - y[a], rx - x[a]);
      });
    let start = 0;
    let gap = -1;
    ringDirs.forEach((d, i) => {
      const next = i + 1 < ringDirs.length ? ringDirs[i + 1] : ringDirs[0] + TAU;
      const holdsRing = centres.some((c) => {
        const u = (((c - d) % TAU) + TAU) % TAU;
        return u > 1e-6 && u < next - d - 1e-6;
      });
      if (!holdsRing && next - d > gap) {
        gap = next - d;
        start = d;
      }
    });
    if (gap < 0) continue;
    // an H drawn at a fusion of rings stands straight up or down, as a
    // steroid's do: measured against upright
    if (inside.length >= 3 && outside.length === 1 && isH(outside[0])) {
      const t = deg(dir(outside[0]));
      subSum += Math.min(Math.abs(t - 90), Math.abs(t + 90));
      subCount++;
      continue;
    }
    const m = outside.length;
    const rel = outside
      .map((b) => (((dir(b) - start) % TAU) + TAU) % TAU)
      .sort((p, q) => p - q);
    rel.forEach((r, k) => {
      subSum += Math.abs(deg(r - (gap * (k + 1)) / (m + 1)));
      subCount++;
    });
  }
  const substituentError = subCount ? subSum / subCount : 0;

  // chains: runs of atoms in no ring, each with two bonds
  const chainAtom = (a: number) => !inRing.has(a) && neighbours[a].length === 2;
  const orderAt = (a: number, b: number) =>
    orderOf.get(a < b ? `${a},${b}` : `${b},${a}`) ?? 1;
  const runs: number[][] = [];
  const done = new Set<number>();
  for (let a = 0; a < n; a++) {
    if (!chainAtom(a) || done.has(a)) continue;
    // walk to one end, then collect to the other
    let prev = -1;
    let cur = a;
    for (;;) {
      const next = neighbours[cur].find((b) => b !== prev && chainAtom(b) && b !== a);
      if (next == null || next === a) break;
      prev = cur;
      cur = next;
      if (cur === a) break;
    }
    const run: number[] = [];
    const endOuter = neighbours[cur].find((b) => b !== prev && !chainAtom(b));
    if (endOuter != null) run.push(endOuter);
    prev = endOuter ?? -1;
    for (;;) {
      run.push(cur);
      done.add(cur);
      const next = neighbours[cur].find((b) => b !== prev);
      if (next == null) break;
      prev = cur;
      cur = next;
      if (!chainAtom(cur)) {
        run.push(cur);
        break;
      }
      if (done.has(cur)) break;
    }
    if (run.length >= 5) runs.push(run);
  }
  const zig = Math.cos(Math.PI / 6);
  // folding, over stretches of single bonds (a cis double bond bends a
  // chain rightly)
  let foldSum = 0;
  let foldCount = 0;
  for (const run of runs) {
    let from = 0;
    for (let i = 1; i <= run.length; i++) {
      const brk = i === run.length || orderAt(run[i - 1], run[i]) !== 1;
      if (!brk) continue;
      const bonds = i - 1 - from;
      if (bonds >= 5) {
        const p = run[from];
        const q = run[i - 1];
        const reach = Math.hypot(x[q] - x[p], y[q] - y[p]) / (bonds * L * zig);
        foldSum += Math.max(0, 1 - reach);
        foldCount++;
      }
      from = i;
    }
  }
  const chainFold = foldCount ? foldSum / foldCount : 0;
  const cx = x.reduce((sum, v) => sum + v, 0) / Math.max(n, 1);
  const cy = y.reduce((sum, v) => sum + v, 0) / Math.max(n, 1);
  // long chains, pointed away from the middle, against running parallel
  const axes = runs
    .filter((r) => r.length >= 7)
    .map((r) => {
      const p = r[0];
      const q = r[r.length - 1];
      const flip = Math.hypot(x[p] - cx, y[p] - cy) > Math.hypot(x[q] - cx, y[q] - cy);
      return flip ? Math.atan2(y[p] - y[q], x[p] - x[q]) : Math.atan2(y[q] - y[p], x[q] - x[p]);
    });
  let splaySum = 0;
  let splayCount = 0;
  for (let i = 0; i < axes.length; i++) {
    for (let j = i + 1; j < axes.length; j++) {
      const t = axes[i] - axes[j];
      splaySum += deg(Math.abs(Math.atan2(Math.sin(t), Math.cos(t))));
      splayCount++;
    }
  }
  const chainSplay = splayCount ? splaySum / splayCount : 0;

  // strands: the open parts of the structure, split where they branch and
  // where they meet a ring, and carried on at a free end into the atom that
  // continues them there - an OH rather than an =O, a carbon first
  const leaf = (a: number) => !inRing.has(a) && neighbours[a].length === 1;
  const spineDegree = (a: number) => neighbours[a].filter((b) => !leaf(b)).length;
  const through = (a: number) => !inRing.has(a) && !leaf(a) && spineDegree(a) === 2;
  const bendAt = (p: number, t: number, c: number) => {
    const u = Math.atan2(y[p] - y[t], x[p] - x[t]) - Math.atan2(y[c] - y[t], x[c] - x[t]);
    return Math.abs(deg(Math.abs(Math.atan2(Math.sin(u), Math.cos(u)))) - 120);
  };
  const carryOn = (t: number, p: number): number | null => {
    if (inRing.has(t) || spineDegree(t) > 1) return null;
    const rank = (c: number) =>
      (orderAt(t, c) === 1 ? 0 : 2) + (g.elements && g.elements[c] !== "C" ? 1 : 0);
    const free = neighbours[t]
      .filter(leaf)
      .sort((a, b) => rank(a) - rank(b) || bendAt(p, t, a) - bendAt(p, t, b) || a - b);
    return free[0] ?? null;
  };
  const walked = new Set<string>();
  const strands: number[][] = [];
  for (let e = 0; e < n; e++) {
    if (leaf(e) || through(e)) continue;
    for (const first of neighbours[e]) {
      if (leaf(first)) continue;
      const key = e < first ? `${e},${first}` : `${first},${e}`;
      if (walked.has(key) || ringBonds.has(key)) continue;
      const path = [e, first];
      walked.add(key);
      while (through(path[path.length - 1])) {
        const cur = path[path.length - 1];
        const next = neighbours[cur].find((b) => b !== path[path.length - 2] && !leaf(b));
        if (next == null || path.includes(next)) break;
        walked.add(cur < next ? `${cur},${next}` : `${next},${cur}`);
        path.push(next);
      }
      const head = carryOn(path[0], path[1]);
      if (head != null) path.unshift(head);
      const tail = carryOn(path[path.length - 1], path[path.length - 2]);
      if (tail != null) path.push(tail);
      // a cis double bond turns a chain rightly: measure either side of it
      let from = 0;
      for (let i = 1; i + 2 < path.length; i++) {
        const [p, a, b, q] = [path[i - 1], path[i], path[i + 1], path[i + 2]];
        if (orderAt(a, b) !== 2) continue;
        const side = (r: number) =>
          Math.sign((x[b] - x[a]) * (y[r] - y[a]) - (y[b] - y[a]) * (x[r] - x[a]));
        if (side(p) * side(q) > 0) {
          strands.push(path.slice(from, i + 1));
          from = i + 1;
        }
      }
      strands.push(path.slice(from));
    }
  }
  // A zigzag's axis runs through the midpoints of its bonds, and it should
  // run level - except a short chain hung on a ring, which may as well run
  // straight out from the ring: its axis within 30 degrees of the way out,
  // as a zigzag's is of its first bond.
  const outward = (r: number): number | null => {
    const ring = rings.filter((q) => q.includes(r)).sort((p, q) => p.length - q.length)[0];
    if (!ring) return null;
    const rx = ring.reduce((sum, a) => sum + x[a], 0) / ring.length;
    const ry = ring.reduce((sum, a) => sum + y[a], 0) / ring.length;
    return Math.atan2(y[r] - ry, x[r] - rx);
  };
  let tiltSum = 0;
  let tiltBonds = 0;
  for (const s of strands) {
    const k = s.length - 1;
    if (k < 3) continue;
    const dx = (x[s[k - 1]] + x[s[k]] - x[s[0]] - x[s[1]]) / 2;
    const dy = (y[s[k - 1]] + y[s[k]] - y[s[0]] - y[s[1]]) / 2;
    const t = Math.abs(deg(Math.atan2(dy, dx)));
    let off = t > 90 ? 180 - t : t;
    const [head, tail] = [s[0], s[k]];
    const hungFrom = inRing.has(head) && leaf(tail) ? head : inRing.has(tail) && leaf(head) ? tail : null;
    const out = k <= 4 && hungFrom != null ? outward(hungFrom) : null;
    if (out != null) {
      const along = hungFrom === head ? Math.atan2(dy, dx) : Math.atan2(-dy, -dx);
      const u = along - out;
      off = Math.min(off, Math.max(0, deg(Math.abs(Math.atan2(Math.sin(u), Math.cos(u)))) - 30));
    }
    tiltSum += k * off;
    tiltBonds += k;
  }
  const chainTilt = tiltBonds ? tiltSum / tiltBonds : 0;

  const width = Math.max(...x) - Math.min(...x);
  const height = Math.max(...y) - Math.min(...y);
  const aspect = n > 2 ? height / Math.max(width, L) : 0;
  // the long axis: the way the atoms spread furthest
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let a = 0; a < n; a++) {
    sxx += (x[a] - cx) ** 2;
    syy += (y[a] - cy) ** 2;
    sxy += (x[a] - cx) * (y[a] - cy);
  }
  const half = (sxx + syy) / 2;
  const spread = Math.sqrt(Math.max(0, half * half - (sxx * syy - sxy * sxy)));
  const long = half + spread;
  const broad = Math.max(0, half - spread);
  const axisTilt =
    long > 0 ? Math.abs(deg(0.5 * Math.atan2(2 * sxy, sxx - syy))) * (1 - Math.sqrt(broad / long)) : 0;
  let macroAspect = 0;
  for (const r of rings) {
    if (r.length < 12) continue;
    const rx = r.map((a) => x[a]);
    const ry = r.map((a) => y[a]);
    const w = Math.max(...rx) - Math.min(...rx);
    const h = Math.max(...ry) - Math.min(...ry);
    macroAspect = Math.max(macroAspect, h / Math.max(w, L));
  }

  // reading order
  let readingOrder = 0;
  const el = g.elements;
  if (el) {
    // The first carbon of a chain on the right: a carboxyl - an acid's or
    // an ester's - with the chain it heads running off to its left, as far
    // as that runs unbranched. One on a ring goes wherever the ring puts it;
    // an acetyl heads no chain. Where chains are headed both ways (the two
    // acids of glutathione), one has to run the other way, and only the
    // excess counts.
    let rightWay = 0;
    let wrongWay = 0;
    for (let a = 0; a < n; a++) {
      if (el[a] !== "C" || inRing.has(a)) continue;
      const oxo = neighbours[a].filter((b) => el[b] === "O" && orderAt(a, b) === 2);
      const oxy = neighbours[a].filter((b) => el[b] === "O" && orderAt(a, b) === 1);
      const onto = neighbours[a].filter((b) => el[b] !== "O");
      if (oxo.length !== 1 || oxy.length !== 1 || onto.length !== 1) continue;
      if (leaf(onto[0])) continue;
      // an acid on a ring: to the right of the middle, but lightly - a
      // ring's substituents go where the ring puts them
      if (inRing.has(onto[0])) {
        const isAcid = oxy.some((o) => (g.hydrogens?.[o] ?? 0) > 0 || neighbours[o].length === 1);
        if (isAcid && x[a] < cx - 0.25 * L) readingOrder += 0.5;
        continue;
      }
      let prev = a;
      let cur = onto[0];
      for (let i = 0; i < n && through(cur); i++) {
        const next = neighbours[cur].find((v) => v !== prev && !leaf(v));
        if (next == null || inRing.has(next)) break;
        prev = cur;
        cur = next;
      }
      if (x[cur] < x[a] - 0.25 * L) rightWay++;
      else if (x[cur] > x[a] + 0.25 * L) wrongWay++;
    }
    readingOrder += Math.max(0, wrongWay - rightWay);
    // the backbone of an amino acid or a peptide from N to C, left to
    // right, as sequences are written: at each carbon bearing an N and a
    // carbonyl carbon, the N to the left of it. Round a cyclic peptide half
    // must run back, so again only the excess counts.
    let forward = 0;
    let backward = 0;
    for (let a = 0; a < n; a++) {
      if (el[a] !== "C") continue;
      const nitrogen = neighbours[a].find((b) => el[b] === "N");
      const carbonyl = neighbours[a].find(
        (b) =>
          el[b] === "C" &&
          neighbours[b].some((c) => el[c] === "O" && orderAt(b, c) === 2) &&
          neighbours[b].some((c) => (el[c] === "O" || el[c] === "N") && orderAt(b, c) === 1),
      );
      if (nitrogen == null || carbonyl == null) continue;
      if (x[nitrogen] < x[carbonyl] - 0.25 * L) forward++;
      else if (x[nitrogen] > x[carbonyl] + 0.25 * L) backward++;
    }
    readingOrder += Math.max(0, backward - forward);
    // a sugar - a ring of five or six with one oxygen in it, and oxygens on
    // its carbons - drawn as its Haworth projection seen from above: the
    // ring oxygen at the back, which is the top
    for (const r of rings) {
      if (r.length !== 5 && r.length !== 6) continue;
      const ox = r.filter((a) => el[a] === "O");
      if (ox.length !== 1 || r.some((a) => el[a] !== "C" && el[a] !== "O")) continue;
      const hydroxylated = r.filter(
        (a) => el[a] === "C" && neighbours[a].some((b) => !r.includes(b) && el[b] === "O"),
      ).length;
      if (hydroxylated < 2) continue;
      const ry = r.reduce((sum, a) => sum + y[a], 0) / r.length;
      if (y[ox[0]] < ry + 0.25 * L) readingOrder++;
      // and its anomeric carbon - on the ring oxygen, with an oxygen or a
      // nitrogen of its own: a glycoside's link, a nucleoside's base - on
      // the right-hand side of the ring. Where two sugars are linked by
      // their anomeric carbons (sucrose) one of them cannot be; an aldose's
      // (the anomeric carbon on one carbon) keeps its place first.
      const rx = r.reduce((sum, a) => sum + x[a], 0) / r.length;
      for (const c of neighbours[ox[0]]) {
        if (!r.includes(c)) continue;
        const own = neighbours[c].some((b) => !r.includes(b) && (el[b] === "O" || el[b] === "N"));
        if (!own) continue;
        const carbons = neighbours[c].filter((b) => el[b] === "C").length;
        if (x[c] < rx + 0.25 * L) readingOrder += carbons <= 1 ? 1 : 0.5;
      }
    }
    // an acid's C=O up: the way it is always drawn
    for (let a = 0; a < n; a++) {
      if (el[a] !== "C") continue;
      const oxo = neighbours[a].filter((b) => el[b] === "O" && orderAt(a, b) === 2);
      const hydroxy = neighbours[a].filter(
        (b) =>
          el[b] === "O" &&
          orderAt(a, b) === 1 &&
          ((g.hydrogens?.[b] ?? 0) > 0 || neighbours[b].length === 1),
      );
      if (oxo.length !== 1 || hydroxy.length !== 1) continue;
      if (y[oxo[0]] < y[a] - 0.2 * L) readingOrder++;
      else if (y[oxo[0]] < y[a] + 0.2 * L) readingOrder += 0.5;
    }
  }
  const centre = (s: Set<number>) => {
    let sx = 0;
    let sy = 0;
    for (const a of s) {
      sx += x[a];
      sy += y[a];
    }
    return { x: sx / s.size, y: sy / s.size };
  };
  if (live.length) {
    const main = live.reduce((b, s) => (s.size > b.size ? s : b));
    const mc = centre(main);
    // a ring system with a chain out of it: the rings to the left, the
    // chain read after them
    for (const s of strands) {
      if (s.length - 1 < 4) continue;
      const [head, tail] = [s[0], s[s.length - 1]];
      const free = main.has(head) && leaf(tail) ? tail : main.has(tail) && leaf(head) ? head : null;
      if (free != null && x[free] < mc.x - 0.5 * L) readingOrder++;
    }
    // rings hung on a macrocycle - on it, or one atom off it, as a sugar on
    // its oxygen: to its right, and below it
    const macro = rings.find((r) => r.length >= 12 && r.every((a) => main.has(a)));
    if (macro) {
      const hung = (s: Set<number>) =>
        macro.some((m) =>
          neighbours[m].some(
            (b) => s.has(b) || (!inRing.has(b) && neighbours[b].some((c) => s.has(c))),
          ),
        );
      for (const s of live) {
        if (s === main || !hung(s)) continue;
        const c = centre(s);
        if (c.x < mc.x - 0.5 * L) readingOrder += 0.5;
        if (c.y > mc.y + 0.5 * L) readingOrder += 0.5;
      }
    }
  }

  // fused rings as IUPAC orients them: the largest system's rings of up to
  // eight, fused and not bridged, by their centres
  let ringOrder = 0;
  if (live.length) {
    const main = live.reduce((b, s) => (s.size > b.size ? s : b));
    const fused = rings.filter(
      (r) =>
        r.length <= 8 &&
        r.every((a) => main.has(a)) &&
        rings.every((q) => q === r || q.filter((a) => r.includes(a)).length <= 2),
    );
    if (fused.length >= 2) {
      const centres = fused.map((r) => ({
        x: r.reduce((sum, a) => sum + x[a], 0) / r.length,
        y: r.reduce((sum, a) => sum + y[a], 0) / r.length,
      }));
      // rows of ring centres level with each other, turned `t`: the longest
      const rowsIn = (t: number) => {
        const c = Math.cos(t);
        const sn = Math.sin(t);
        const ys = centres.map((p) => p.x * sn + p.y * c);
        const rows: number[][] = [];
        ys.forEach((y0) => {
          const row = ys.map((v, i) => (Math.abs(v - y0) < 0.15 * L ? i : -1)).filter((i) => i >= 0);
          if (!rows.some((r) => r.join() === row.join())) rows.push(row);
        });
        const longest = Math.max(...rows.map((r) => r.length));
        return rows.filter((r) => r.length === longest);
      };
      const rows = rowsIn(0);
      const most = Math.max(
        rows[0].length,
        rowsIn(Math.PI / 3)[0].length,
        rowsIn((2 * Math.PI) / 3)[0].length,
      );
      // of the longest rows here, the one the rest sit best against: above
      // and to the right of it, none below and to the left - and a row of
      // six-membered rings, which lie square, before one with others in it
      let best = Infinity;
      for (const row of rows) {
        let breach = most - row.length;
        const rx = row.reduce((sum, i) => sum + centres[i].x, 0) / row.length;
        const ry = row.reduce((sum, i) => sum + centres[i].y, 0) / row.length;
        centres.forEach((p, i) => {
          if (row.includes(i)) {
            if (fused[i].length !== 6) breach += 0.25;
            return;
          }
          const right = p.x > rx + 0.1 * L;
          const up = p.y > ry + 0.1 * L;
          const left = p.x < rx - 0.1 * L;
          const down = p.y < ry - 0.1 * L;
          if (!(right && up)) breach += 0.5;
          if (left && down) breach += 0.5;
          else if (left) breach += 0.25;
        });
        best = Math.min(best, breach);
      }
      ringOrder += best;
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

  const measures = {
    bondSpread,
    angleError,
    ringError,
    overlaps,
    crossings,
    clashes,
    macroAngleError,
    ringWedges,
    crowdedLabels,
    tilt,
    gridError,
    substituentError,
    chainFold,
    chainSplay,
    chainTilt,
    axisTilt,
    aspect,
    macroAspect,
    readingOrder,
    ringOrder,
  };
  const score = Object.values(scoreParts(measures)).reduce((sum, v) => sum + v, 0);
  return { ...measures, score };
}
