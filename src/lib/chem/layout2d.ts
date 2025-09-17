export type Atom = {
  id: number;
  x: number;
  y: number;
  el: string;
  charge?: number;
  isotope?: number;
};
export type Bond = {
  a1: number;
  a2: number;
  order: 1 | 2 | 3;
  stereo?: "up" | "down" | "wavy" | "none";
  // Double-bond offset layout modes
  doubleMode?: "auto" | "center" | "left" | "right";
  // Wedge orientation principle vs. reverse principle
  stereoOrient?: "principle" | "reverse";
};
export type Vec2 = { x: number; y: number };

export type LayoutOptions = {
  lineWidthPx: number;
  doubleOffsetPx: number;
  doubleShortenPx: number;
  tripleOffsetPx: number;
  wedgeWidthPx: number;
  wedgeLengthPx: number;
  hashCount: number;
  hashStartPx: number;
  hashEndPx: number;
  wavyAmpPx: number;
  wavyFreq: number;
  fontPx: number;
  paddingPx: number;
  showCarbonLabels: boolean;
  units?: "px" | "world";
  minLinePx?: number;
  // boolean: all rings ON, undefined/false: OFF
  // { enabled: Set<string> }: enable only rings with ringKey (ascending concat of 6 atom ids)
  aromaticCircle?: boolean | { enabled: Set<string> };
};

export type LineSeg = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  widthPx: number;
};
export type Poly = { points: Vec2[] };
export type TextItem = { x: number; y: number; text: string; fontPx: number };
export type Circle = { c: Vec2; r: number; key?: string };

export type Layout = {
  lines: LineSeg[];
  polys: Poly[];
  texts: TextItem[];
  circles: Circle[];
  fills: Circle[];
  bounds: { min: Vec2; max: Vec2 };
};

export function pxToWorld(px: number, zoom: number): number {
  return px / Math.max(zoom, 1e-6);
}

export function computeBounds(atoms: Atom[]): { min: Vec2; max: Vec2 } {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const a of atoms) {
    if (a.x < minX) minX = a.x;
    if (a.y < minY) minY = a.y;
    if (a.x > maxX) maxX = a.x;
    if (a.y > maxY) maxY = a.y;
  }
  if (!isFinite(minX)) return { min: { x: -1, y: -1 }, max: { x: 1, y: 1 } };
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

function toWorld(
  n: number,
  zoom: number,
  units: "px" | "world" | undefined
): number {
  return units === "world" ? n : pxToWorld(n, zoom);
}

function vsub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}
function vadd(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}
function vscale(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, y: a.y * s };
}
function vlen(a: Vec2): number {
  return Math.hypot(a.x, a.y);
}
function vnorm(a: Vec2): Vec2 {
  const L = vlen(a);
  return L > 1e-9 ? { x: a.x / L, y: a.y / L } : { x: 1, y: 0 };
}
function vperp(a: Vec2): Vec2 {
  return { x: -a.y, y: a.x };
}

// function trimEnds is no longer used (kept here commented for reference)
// function trimEnds(p1: Vec2, p2: Vec2, trimWorld: number): { a: Vec2; b: Vec2 } {
//   const dir = vnorm(vsub(p2, p1))
//   const a = vadd(p1, vscale(dir, trimWorld))
//   const b = vadd(p2, vscale(dir, -trimWorld))
//   return { a, b }
// }

function buildTripleLines(
  p1: Vec2,
  p2: Vec2,
  offsetWorld: number
): [LineSeg, LineSeg, LineSeg] {
  const dir = vsub(p2, p1);
  const n = vnorm(vperp(dir));
  const o = vscale(n, offsetWorld);
  return [
    {
      x1: p1.x + o.x,
      y1: p1.y + o.y,
      x2: p2.x + o.x,
      y2: p2.y + o.y,
      widthPx: 0,
    },
    { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, widthPx: 0 },
    {
      x1: p1.x - o.x,
      y1: p1.y - o.y,
      x2: p2.x - o.x,
      y2: p2.y - o.y,
      widthPx: 0,
    },
  ];
}

function buildWedgeTriangle(p1: Vec2, p2: Vec2, baseHalfWorld: number): Poly {
  const dir = vnorm(vsub(p2, p1));
  const n = vscale(vperp(dir), baseHalfWorld);
  const a = vadd(p1, n);
  const b = vsub(p1, n);
  const t = p2;
  return { points: [a, b, t] };
}

function buildHashedWedgeSegments(
  p1: Vec2,
  p2: Vec2,
  baseHalfWorld: number,
  steps: number
): LineSeg[] {
  // Same triangular outline as solid wedge. For each slice draw full-width lines (outline aligned)
  const dir = vnorm(vsub(p2, p1));
  const n = vperp(dir);
  const baseL = vadd(p1, vscale(n, baseHalfWorld));
  const baseR = vadd(p1, vscale(n, -baseHalfWorld));
  const apex = p2;
  const out: LineSeg[] = [];
  for (let i = 0; i < steps; i++) {
    // Place separator lines at equal distances from base to apex
    const u = (i + 0.5) / steps;
    // Points at the same ratio along left (baseL→apex) and right (baseR→apex) edges
    const Lp = vadd(baseL, vscale(vsub(apex, baseL), u));
    const Rp = vadd(baseR, vscale(vsub(apex, baseR), u));
    out.push({ x1: Lp.x, y1: Lp.y, x2: Rp.x, y2: Rp.y, widthPx: 0 });
  }
  return out;
}

function buildWavySegments(
  p1: Vec2,
  p2: Vec2,
  ampPx: number,
  freq: number,
  zoom: number,
  units: "px" | "world" | undefined
): LineSeg[] {
  const dir = vnorm(vsub(p2, p1));
  const n = vperp(dir);
  const L = vlen(vsub(p2, p1));
  const steps = Math.max(8, Math.floor(L / Math.max(pxToWorld(6, zoom), 1e-6)));
  const amp = toWorld(ampPx, zoom, units);
  const out: LineSeg[] = [];
  let prev: Vec2 | null = null;
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const base = vadd(p1, vscale(dir, L * t));
    const off = Math.sin(2 * Math.PI * freq * t);
    const pt = vadd(base, vscale(n, amp * off));
    if (prev) {
      out.push({ x1: prev.x, y1: prev.y, x2: pt.x, y2: pt.y, widthPx: 0 });
    }
    prev = pt;
  }
  return out;
}

export function buildTextLabels(
  atoms: Atom[],
  opts: LayoutOptions
): TextItem[] {
  const out: TextItem[] = [];
  for (const a of atoms) {
    const show = opts.showCarbonLabels || a.el !== "C";
    if (!show) continue;
    out.push({ x: a.x, y: a.y, text: a.el, fontPx: opts.fontPx });
  }
  return out;
}

function degreeMap(bonds: Bond[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const b of bonds) {
    m.set(b.a1, (m.get(b.a1) || 0) + 1);
    m.set(b.a2, (m.get(b.a2) || 0) + 1);
  }
  return m;
}

export function buildBondPrimitives(
  atoms: Atom[],
  bond: Bond,
  opts: LayoutOptions,
  zoom: number,
  deg?: Map<number, number>,
  inRing?: boolean,
  autoSgn?: number
): { lines: LineSeg[]; polys: Poly[] } {
  const a = atoms[bond.a1];
  const c = atoms[bond.a2];
  const p1o = { x: a.x, y: a.y };
  const p2o = { x: c.x, y: c.y };
  const lines: LineSeg[] = [];
  const polys: Poly[] = [];
  const units = opts.units ?? "px";
  let lwPx = units === "world" ? opts.lineWidthPx * zoom : opts.lineWidthPx;
  const minPx = Math.max(0.5, opts.minLinePx ?? 1);
  if (!(lwPx >= minPx)) lwPx = minPx;
  // Shorten bonds at atom ends that have labels to avoid overlap with text.
  // Labels are drawn centered on atom position with font size opts.fontPx.
  // Use a fraction of font size (and a small margin) as trimming length.
  const hasLabel = (el: string) => opts.showCarbonLabels || el !== "C";
  const fontWorld = toWorld(opts.fontPx, zoom, units);
  const trimBase = Math.max(0, fontWorld * 0.5);
  // Additional clearance ≈ half the line thickness (in world units)
  const trimMargin = pxToWorld(lwPx * 0.5, zoom);
  const trimA0 = hasLabel(a.el) ? trimBase + trimMargin : 0;
  const trimB0 = hasLabel(c.el) ? trimBase + trimMargin : 0;
  const dir0 = vsub(p2o, p1o);
  const L0 = vlen(dir0);
  const dir = L0 > 1e-9 ? vscale(dir0, 1 / L0) : { x: 1, y: 0 };
  const trimA = Math.min(trimA0, Math.max(0, L0 * 0.45));
  const trimB = Math.min(trimB0, Math.max(0, L0 * 0.45));
  const p1 = vadd(p1o, vscale(dir, trimA));
  const p2 = vadd(p2o, vscale(dir, -trimB));
  if (bond.stereo === "up" || bond.stereo === "down") {
    // Wedge direction: principle = thin tip toward higher degree side (base on lower side)
    const degA = deg?.get(bond.a1) || 0;
    const degB = deg?.get(bond.a2) || 0;
    const principleThinAtP1 = degA >= degB; // tie: tip at p1
    const reverse = bond.stereoOrient === "reverse";
    // baseAtP1: is the thick base on p1 side? In principle, base is lower-degree side = !principleThinAtP1
    // Reverse principle flips this logic
    const baseAtP1 = reverse ? principleThinAtP1 : !principleThinAtP1;
    const baseHalf = toWorld(opts.wedgeWidthPx * 0.5, zoom, units);
    const bp1 = baseAtP1 ? p1 : p2;
    const bp2 = baseAtP1 ? p2 : p1;
    if (bond.stereo === "up") {
      const tri = buildWedgeTriangle(bp1, bp2, baseHalf);
      polys.push(tri);
      return { lines, polys };
    } else {
      const segs = buildHashedWedgeSegments(
        bp1,
        bp2,
        baseHalf,
        Math.max(5, Math.floor(opts.hashCount * 0.9))
      );
      for (let i = 0; i < segs.length; i++) segs[i].widthPx = lwPx;
      lines.push(...segs);
      return { lines, polys };
    }
  }
  if (bond.stereo === "wavy") {
    lines.push(
      ...buildWavySegments(p1, p2, opts.wavyAmpPx, opts.wavyFreq, zoom, units)
    );
    for (const l of lines) l.widthPx = lwPx;
    return { lines, polys };
  }
  if (bond.order === 1) {
    // No trimming: ensure bonds meet cleanly at atoms
    lines.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, widthPx: lwPx });
    return { lines, polys };
  }
  if (bond.order === 2) {
    const off = toWorld(opts.doubleOffsetPx, zoom, units);
    const dir = vnorm(vsub(p2, p1));
    const n = vperp(dir);
    const shorten = Math.max(
      0,
      toWorld(opts.doubleShortenPx || 0, zoom, units)
    );
    const d1 = (deg?.get(bond.a1) || 1) - 1;
    const d2 = (deg?.get(bond.a2) || 1) - 1;
    const ringShort = inRing === true;
    const shortenA = ringShort || d1 > d2 || (d1 === d2 && d1 > 0);
    const shortenB = ringShort || d2 > d1 || (d1 === d2 && d2 > 0);
    const ps1 = shortenA ? vadd(p1, vscale(dir, shorten)) : p1;
    const ps2 = shortenB ? vadd(p2, vscale(dir, -shorten)) : p2;

    const mode = bond.doubleMode || "auto";
    if (mode === "center") {
      // Symmetric placement: two lines at ±off/2 from the axis
      const o1 = vscale(n, off * 0.5);
      const o2 = vscale(n, -off * 0.5);
      const lA: LineSeg = {
        x1: p1.x + o1.x,
        y1: p1.y + o1.y,
        x2: p2.x + o1.x,
        y2: p2.y + o1.y,
        widthPx: lwPx,
      };
      const lB: LineSeg = {
        x1: p1.x + o2.x,
        y1: p1.y + o2.y,
        x2: p2.x + o2.x,
        y2: p2.y + o2.y,
        widthPx: lwPx,
      };
      lines.push(lA, lB);
      return { lines, polys };
    } else if (mode === "auto") {
      // Auto: if balanced or no substituents -> center; if biased -> short line on denser side
      // autoSgn: +1 means +n side, -1 means -n side; undefined means centered
      if (autoSgn == null || !isFinite(autoSgn)) {
        // Center (two lines symmetric)
        const o1 = vscale(n, off * 0.5);
        const o2 = vscale(n, -off * 0.5);
        lines.push(
          {
            x1: p1.x + o1.x,
            y1: p1.y + o1.y,
            x2: p2.x + o1.x,
            y2: p2.y + o1.y,
            widthPx: lwPx,
          },
          {
            x1: p1.x + o2.x,
            y1: p1.y + o2.y,
            x2: p2.x + o2.x,
            y2: p2.y + o2.y,
            widthPx: lwPx,
          }
        );
        return { lines, polys };
      }
      const sgn = autoSgn >= 0 ? +1 : -1;
      const l1: LineSeg = {
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
        widthPx: lwPx,
      };
      const o = vscale(n, off * sgn);
      const ps1b = vadd(ps1, o);
      const ps2b = vadd(ps2, o);
      const l2: LineSeg = {
        x1: ps1b.x,
        y1: ps1b.y,
        x2: ps2b.x,
        y2: ps2b.y,
        widthPx: lwPx,
      };
      lines.push(l1, l2);
      return { lines, polys };
    } else {
      // Skew placement (left/right): full-length axis line + short line on one side
      const l1: LineSeg = {
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
        widthPx: lwPx,
      };
      // Side selection: left=+1, right=-1
      const sgn = mode === "left" ? +1 : -1;
      const o = vscale(n, off * sgn);
      const ps1b = vadd(ps1, o);
      const ps2b = vadd(ps2, o);
      const l2: LineSeg = {
        x1: ps1b.x,
        y1: ps1b.y,
        x2: ps2b.x,
        y2: ps2b.y,
        widthPx: lwPx,
      };
      lines.push(l1, l2);
      return { lines, polys };
    }
  }
  if (bond.order === 3) {
    // Triple bond outer offset matches the double-bond offset
    const off = toWorld(opts.doubleOffsetPx, zoom, units);
    const [o1, o2, o3] = buildTripleLines(p1, p2, off);
    lines.push(
      { x1: o1.x1, y1: o1.y1, x2: o1.x2, y2: o1.y2, widthPx: lwPx },
      { x1: o2.x1, y1: o2.y1, x2: o2.x2, y2: o2.y2, widthPx: lwPx },
      { x1: o3.x1, y1: o3.y1, x2: o3.x2, y2: o3.y2, widthPx: lwPx }
    );
    return { lines, polys };
  }
  lines.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, widthPx: lwPx });
  return { lines, polys };
}

export function buildAllPrimitives(
  atoms: Atom[],
  bonds: Bond[],
  opts: LayoutOptions,
  zoom: number
): { lines: LineSeg[]; polys: Poly[]; circles: Circle[]; fills: Circle[] } {
  const lines: LineSeg[] = [];
  const polys: Poly[] = [];
  const circles: Circle[] = [];
  const fills: Circle[] = [];
  const deg = degreeMap(bonds);
  // adjacency by index
  const adj = new Map<number, number[]>();
  for (const b of bonds) {
    adj.set(b.a1, [...(adj.get(b.a1) || []), b.a2]);
    adj.set(b.a2, [...(adj.get(b.a2) || []), b.a1]);
  }
  // detect 6-cycle ring edges
  const ringEdges = new Set<string>();
  // For each 6-cycle ring, store its center and the set of edges belonging only to that ring
  const ringCenters: Array<{ c: Vec2; edges: Set<string> }> = [];
  {
    const seen = new Set<string>();
    function dfs6(
      startIdx: number,
      currIdx: number,
      path: number[],
      visited: Set<number>
    ) {
      if (path.length === 6) {
        if ((adj.get(currIdx) || []).includes(startIdx)) {
          const cycle = [...path];
          const key = [...cycle].sort((a, b) => a - b).join("-");
          if (!seen.has(key)) {
            seen.add(key);
            const pts: Vec2[] = [];
            const edgesLocal = new Set<string>();
            for (let i = 0; i < 6; i++) {
              const u = cycle[i];
              const v = cycle[(i + 1) % 6];
              const idu = atoms[u].id,
                idv = atoms[v].id;
              const ekey = idu < idv ? `${idu}-${idv}` : `${idv}-${idu}`;
              ringEdges.add(ekey); // Global set (for inRing checks)
              edgesLocal.add(ekey); // Per-ring set
              pts.push({ x: atoms[u].x, y: atoms[u].y });
            }
            // Ring center (simple average)
            const c = pts.reduce(
              (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
              { x: 0, y: 0 }
            );
            const cx = c.x / 6,
              cy = c.y / 6;
            ringCenters.push({ c: { x: cx, y: cy }, edges: edgesLocal });
          }
        }
        return;
      }
      for (const nxt of adj.get(currIdx) || []) {
        if (nxt === startIdx && path.length >= 3) continue;
        if (visited.has(nxt)) continue;
        visited.add(nxt);
        dfs6(startIdx, nxt, [...path, nxt], visited);
        visited.delete(nxt);
      }
    }
    for (let i = 0; i < atoms.length; i++) dfs6(i, i, [i], new Set([i]));
  }
  // optional aromatic circle detection (6-cycle with >=3 double bonds)
  const aromaticEdges = new Set<string>();
  const enableAll = opts.aromaticCircle === true;
  const enabledSet: Set<string> | null =
    typeof opts.aromaticCircle === "object" &&
    opts.aromaticCircle &&
    (opts.aromaticCircle as any).enabled
      ? (opts.aromaticCircle as any).enabled
      : null;
  if (enableAll || enabledSet) {
    const seen = new Set<string>();
    function dfs(
      startIdx: number,
      currIdx: number,
      path: number[],
      visited: Set<number>
    ) {
      if (path.length === 6) {
        if ((adj.get(currIdx) || []).includes(startIdx)) {
          const cycle = [...path];
          // ringKey: concatenation of atom.id in ascending order
          const ids = cycle.map((i) => atoms[i].id).sort((a, b) => a - b);
          const ringKey = ids.join("-");
          if (!seen.has(ringKey)) {
            seen.add(ringKey);
            let doubles = 0;
            const pts: Vec2[] = [];
            for (let i = 0; i < 6; i++) {
              const u = cycle[i];
              const v = cycle[(i + 1) % 6];
              const be = bonds.find(
                (bb) =>
                  (bb.a1 === u && bb.a2 === v) || (bb.a1 === v && bb.a2 === u)
              );
              if (be && be.order === 2) doubles++;
              pts.push({ x: atoms[u].x, y: atoms[u].y });
              // Edge-key calculation is deferred to demotion time; skip here
            }
            const isAromatic = doubles >= 3;
            const isEnabled =
              enableAll || (!!enabledSet && enabledSet.has(ringKey));
            if (isAromatic && isEnabled) {
              const c = pts.reduce(
                (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
                { x: 0, y: 0 }
              );
              c.x /= 6;
              c.y /= 6;
              let r = 0;
              for (const p of pts) r += Math.hypot(p.x - c.x, p.y - c.y);
              r /= 6;
              circles.push({ c, r: r * 0.5, key: ringKey });
              // Demote these 6 edges (belonging to this ring)
              for (let i = 0; i < 6; i++) {
                const u = cycle[i];
                const v = cycle[(i + 1) % 6];
                const idu = atoms[u].id,
                  idv = atoms[v].id;
                const ekey = idu < idv ? `${idu}-${idv}` : `${idv}-${idu}`;
                aromaticEdges.add(ekey);
              }
            }
          }
        }
        return;
      }
      for (const nxt of adj.get(currIdx) || []) {
        if (nxt === startIdx && path.length >= 3) continue;
        if (visited.has(nxt)) continue;
        visited.add(nxt);
        dfs(startIdx, nxt, [...path, nxt], visited);
        visited.delete(nxt);
      }
    }
    for (let i = 0; i < atoms.length; i++) dfs(i, i, [i], new Set([i]));
  }
  // join fill caps for degree==2 to avoid wedge gaps at ~120°
  const widthPx =
    opts.units === "world" ? opts.lineWidthPx * zoom : opts.lineWidthPx;
  const rWorld =
    opts.units === "world"
      ? opts.lineWidthPx * 0.5
      : pxToWorld(widthPx * 0.5, zoom); // restore previous size
  for (let i = 0; i < atoms.length; i++) {
    const d = deg.get(i) || 0;
    const showLabel = opts.showCarbonLabels || atoms[i].el !== "C";
    if (d >= 2 && !showLabel) {
      fills.push({ c: { x: atoms[i].x, y: atoms[i].y }, r: rWorld });
    }
  }
  // build lines/polys
  for (const b of bonds) {
    const u = atoms[b.a1].id,
      v = atoms[b.a2].id;
    const key = u < v ? `${u}-${v}` : `${v}-${u}`;
    const inRing = ringEdges.has(key);
    const beff: Bond = aromaticEdges.has(key) ? { ...b, order: 1 } : b;
    // autoSgn: count substituents on both ends (excluding the opposite endpoint) and decide by +n vs -n totals
    let autoSgn: number | undefined = undefined;
    if (
      beff.order === 2 &&
      (beff.doubleMode === undefined || beff.doubleMode === "auto")
    ) {
      const p1 = { x: atoms[b.a1].x, y: atoms[b.a1].y };
      const p2 = { x: atoms[b.a2].x, y: atoms[b.a2].y };
      const axis = vsub(p2, p1);
      const L0 = vlen(axis);
      const dir = L0 > 1e-9 ? vscale(axis, 1 / L0) : { x: 1, y: 0 };
      const n = vperp(dir); // Treat +n as "left"
      const neigh1 = (adj.get(b.a1) || []).filter((x) => x !== b.a2);
      const neigh2 = (adj.get(b.a2) || []).filter((x) => x !== b.a1);
      const EPS = Math.max(1e-4, L0 * 0.06); // Ignore near-axis to suppress flipping
      let plus = 0,
        minus = 0;
      for (const o of neigh1) {
        const v = { x: atoms[o].x - p1.x, y: atoms[o].y - p1.y };
        const s = v.x * n.x + v.y * n.y;
        if (s > EPS) plus++;
        else if (s < -EPS) minus++;
      }
      for (const o of neigh2) {
        const v = { x: atoms[o].x - p2.x, y: atoms[o].y - p2.y };
        const s = v.x * n.x + v.y * n.y;
        if (s > EPS) plus++;
        else if (s < -EPS) minus++;
      }
      // Center only when the counts are exactly equal (or both zero); otherwise keep skew
      if (plus === minus) autoSgn = undefined; // -> center
      else autoSgn = plus > minus ? +1 : -1;
    }
    const r = buildBondPrimitives(
      atoms,
      beff,
      opts,
      zoom,
      deg,
      inRing,
      autoSgn
    );
    lines.push(...r.lines);
    polys.push(...r.polys);
  }
  return { lines, polys, circles, fills };
}

export function layoutMolecule(
  atoms: Atom[],
  bonds: Bond[],
  opts: LayoutOptions,
  zoom: number
): Layout {
  const bounds = computeBounds(atoms);
  const prim = buildAllPrimitives(atoms, bonds, opts, zoom);
  const texts = buildTextLabels(atoms, opts);
  return {
    lines: prim.lines,
    polys: prim.polys,
    texts,
    circles: prim.circles,
    fills: prim.fills,
    bounds,
  };
}

function toSvgPath(poly: Poly): string {
  if (!poly.points.length) return "";
  const p0 = poly.points[0];
  const segs = [`M ${p0.x} ${-p0.y}`];
  for (let i = 1; i < poly.points.length; i++) {
    const p = poly.points[i];
    segs.push(`L ${p.x} ${-p.y}`);
  }
  segs.push("Z");
  return segs.join(" ");
}

function expandBounds(
  bounds: { min: Vec2; max: Vec2 },
  pad: number
): { min: Vec2; max: Vec2 } {
  return {
    min: { x: bounds.min.x - pad, y: bounds.min.y - pad },
    max: { x: bounds.max.x + pad, y: bounds.max.y + pad },
  };
}

function escapeXml(text: string): string {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function createSVG(layout: Layout, opts: LayoutOptions): string {
  const b = expandBounds(layout.bounds, pxToWorld(opts.paddingPx, 1));
  const width = b.max.x - b.min.x;
  const height = b.max.y - b.min.y;
  const vb = `${b.min.x} ${-b.max.y} ${width} ${height}`;
  const stroke = "black";
  const fontFamily = "Arial, Helvetica, sans-serif";
  let s = "";
  s += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" fill="none">`;
  // filled join caps
  for (const c of (layout as any).fills || []) {
    const rAttr = `${c.r}`;
    s += `<circle cx="${c.c.x}" cy="${-c.c
      .y}" r="${rAttr}" fill="${stroke}" stroke="none" />`;
  }
  for (const p of layout.polys) {
    const d = toSvgPath(p);
    s += `<path d="${d}" fill="${stroke}" stroke="none" />`;
  }
  for (const c of (layout as any).circles || []) {
    const rAttr = `${c.r}`;
    const lw =
      opts.units === "px" ? `${opts.lineWidthPx}px` : `${opts.lineWidthPx}`;
    s += `<circle cx="${c.c.x}" cy="${-c.c
      .y}" r="${rAttr}" fill="none" stroke="${stroke}" stroke-width="${lw}" vector-effect="non-scaling-stroke" />`;
  }
  for (const l of layout.lines) {
    const w = l.widthPx > 0 ? l.widthPx : 1;
    const wAttr = opts.units === "px" ? `${w}px` : `${w}`;
    s += `<line x1="${l.x1}" y1="${-l.y1}" x2="${
      l.x2
    }" y2="${-l.y2}" stroke="${stroke}" stroke-width="${wAttr}" vector-effect="non-scaling-stroke" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="2" />`;
  }
  for (const t of layout.texts) {
    const f = opts.units === "px" ? `${t.fontPx}px` : `${t.fontPx}`;
    s += `<text x="${
      t.x
    }" y="${-t.y}" font-family="${fontFamily}" font-size="${f}" text-anchor="middle" dominant-baseline="central">${escapeXml(
      t.text
    )}</text>`;
  }
  s += `</svg>`;
  return s;
}
