/**
 * Six metals in contact as an octahedron - Stryker's reagent's Cu6 - drawn
 * as the solid it is (docs/LAYOUT-2D.md, section 7): each atom bridging an
 * edge just outside it, each metal's other ligands straight out from the
 * middle, and the whole seen from the side that hides least - a face
 * straight on where that does as well - a corner up (engine's standUp).
 */
import { add, segmentsCross, type Point } from "./geometry";
import type { EtaLayout } from "./hapto";
import { METAL_BOND, type MetalUnit, type Molecule } from "./perceive";

type Vec3 = [number, number, number];

/**
 * How long an edge is, in bond lengths: long enough that its two metals'
 * labels, and the label of an atom bridging it, stand clear of each other.
 */
const EDGE = 2.4;
/** How far an atom bridging an edge stands out from the edge's middle, away from the cluster's. */
const BRIDGE_OUT = 0.7;

const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** A point seen looking along `-toViewer`, `sx` and `sy` the page's right and up: where, and how near. */
function seen(p: Vec3, view: { toViewer: Vec3; sx: Vec3; sy: Vec3 }): { at: Point; depth: number } {
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return { at: { x: dot(p, view.sx), y: dot(p, view.sy) }, depth: dot(p, view.toViewer) };
}

/** Directions spread evenly over the sphere, each with the page's right and up. */
function views(count: number): { toViewer: Vec3; sx: Vec3; sy: Vec3 }[] {
  const out: { toViewer: Vec3; sx: Vec3; sy: Vec3 }[] = [];
  for (let k = 0; k < count; k++) {
    const z = 1 - (2 * (k + 0.5)) / count;
    const r = Math.sqrt(1 - z * z);
    const t = k * Math.PI * (3 - Math.sqrt(5));
    const v: Vec3 = [r * Math.cos(t), z, r * Math.sin(t)];
    const helper: Vec3 = Math.abs(v[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const k2 = helper[0] * v[0] + helper[1] * v[1] + helper[2] * v[2];
    const sy = norm([helper[0] - k2 * v[0], helper[1] - k2 * v[1], helper[2] - k2 * v[2]]);
    const sx: Vec3 = [sy[1] * v[2] - sy[2] * v[1], sy[2] * v[0] - sy[0] * v[2], sy[0] * v[1] - sy[1] * v[0]];
    out.push({ toViewer: v, sx, sy });
  }
  return out;
}

/** Each face of the octahedron seen straight on - down a threefold axis - a corner up. */
function faceViews(corners: Vec3[], mol: Molecule, metals: number[]): { toViewer: Vec3; sx: Vec3; sy: Vec3 }[] {
  const out: { toViewer: Vec3; sx: Vec3; sy: Vec3 }[] = [];
  for (let i = 0; i < 6; i++) {
    for (let j = i + 1; j < 6; j++) {
      for (let k = j + 1; k < 6; k++) {
        const t = [i, j, k];
        if (!t.every((p) => t.every((q) => p === q || mol.neighbours[metals[p]].includes(metals[q])))) continue;
        const c = norm([0, 1, 2].map((d) => (corners[i][d] + corners[j][d] + corners[k][d]) / 3) as Vec3);
        const up = corners[i];
        const kk = up[0] * c[0] + up[1] * c[1] + up[2] * c[2];
        const sy = norm([up[0] - kk * c[0], up[1] - kk * c[1], up[2] - kk * c[2]]);
        const sx: Vec3 = [sy[1] * c[2] - sy[2] * c[1], sy[2] * c[0] - sy[0] * c[2], sy[0] * c[1] - sy[1] * c[0]];
        out.push({ toViewer: c, sx, sy });
      }
    }
  }
  return out;
}

const toSegment = (h: Point, p: Point, q: Point) => {
  const vx = q.x - p.x;
  const vy = q.y - p.y;
  const l2 = vx * vx + vy * vy;
  const t = l2 ? Math.max(0, Math.min(1, ((h.x - p.x) * vx + (h.y - p.y) * vy) / l2)) : 0;
  return Math.hypot(h.x - (p.x + t * vx), h.y - (p.y + t * vy));
};

/**
 * An octahedral cluster (`unit.cluster`) laid out: its atoms' places, the
 * metal `unit.metal` straight up from the middle; where each metal's other
 * ligands go; and, as `lift`, how near each of its atoms is to the viewer.
 */
export function placeCluster(mol: Molecule, unit: MetalUnit): EtaLayout {
  const { metals, bridges } = unit.cluster!;
  const touches = (a: number, b: number) => mol.neighbours[a].includes(b);
  const top = unit.metal;
  const bottom = metals.find((m) => m !== top && !touches(m, top))!;
  // the four round the middle, in order round it
  const middle = metals.filter((m) => m !== top && m !== bottom);
  const ring = [middle[0]];
  while (ring.length < 4) {
    const last = ring[ring.length - 1];
    ring.push(middle.find((m) => !ring.includes(m) && touches(m, last))!);
  }
  // corners an edge apart
  const r = EDGE / Math.SQRT2;
  const solid = new Map<number, Vec3>([
    [top, [0, r, 0]],
    [bottom, [0, -r, 0]],
    [ring[0], [r, 0, 0]],
    [ring[1], [0, 0, r]],
    [ring[2], [-r, 0, 0]],
    [ring[3], [0, 0, -r]],
  ]);
  // each bridging atom just outside the middle of what it bridges
  for (const b of bridges) {
    const on = mol.neighbours[b].filter((m) => metals.includes(m)).map((m) => solid.get(m)!);
    const c: Vec3 = [0, 1, 2].map((k) => on.reduce((t, p) => t + p[k], 0) / on.length) as Vec3;
    const out = norm(c);
    solid.set(b, [c[0] + out[0] * BRIDGE_OUT, c[1] + out[1] * BRIDGE_OUT, c[2] + out[2] * BRIDGE_OUT]);
  }
  // and each metal's other ligands straight out from the middle - several
  // spread round that line
  const inUnit = new Set([...metals, ...bridges]);
  const ligands: { metal: number; atom: number; end: Vec3 }[] = [];
  for (const m of metals) {
    const others = mol.neighbours[m].filter((a) => !inUnit.has(a));
    const out = norm(solid.get(m)!);
    const across = norm(Math.abs(out[1]) > 0.9 ? [1, 0, 0] : [out[2], 0, -out[0]]);
    const third: Vec3 = [
      out[1] * across[2] - out[2] * across[1],
      out[2] * across[0] - out[0] * across[2],
      out[0] * across[1] - out[1] * across[0],
    ];
    others.forEach((a, i) => {
      const tilt = others.length > 1 ? (40 * Math.PI) / 180 : 0;
      const turn = (2 * Math.PI * i) / others.length;
      const d = [0, 1, 2].map(
        (k) => Math.cos(tilt) * out[k] + Math.sin(tilt) * (Math.cos(turn) * across[k] + Math.sin(turn) * third[k]),
      ) as Vec3;
      const p = solid.get(m)!;
      ligands.push({ metal: m, atom: a, end: [p[0] + d[0] * METAL_BOND, p[1] + d[1] * METAL_BOND, p[2] + d[2] * METAL_BOND] });
    });
  }
  const atoms = [...solid.keys()];
  const edges: [number, number][] = [];
  for (const a of atoms) for (const b of mol.neighbours[a]) if (a < b && solid.has(b)) edges.push([a, b]);

  // the view that hides least: no label on another or on an edge, the
  // ligands clear of the cluster and of each other, the fewest edges
  // crossing (fewer still where one is not plainly behind the other)
  const labelled = (a: number) => mol.el[a] !== "C";
  let best: { view: ReturnType<typeof views>[number]; cost: number } | null = null;
  // (a face seen straight on first: as well as any other, it is the one kept)
  const tried = [...faceViews(metals.map((m) => solid.get(m)!), mol, metals), ...views(400)];
  for (const view of tried) {
    const at = new Map(atoms.map((x) => [x, seen(solid.get(x)!, view)]));
    const ends = ligands.map((l) => ({ ...l, at: seen(l.end, view).at }));
    let cost = 0;
    for (let i = 0; i < atoms.length; i++) {
      const a = at.get(atoms[i])!;
      for (let j = i + 1; j < atoms.length; j++) {
        const b = at.get(atoms[j])!;
        // (labels a label's width apart; bonded, a short bond's)
        const room = touches(atoms[i], atoms[j]) ? 0.7 : labelled(atoms[i]) && labelled(atoms[j]) ? 1 : 0.6;
        const d = Math.hypot(a.at.x - b.at.x, a.at.y - b.at.y);
        if (d < room) cost += 10 * (1 + (room - d));
      }
      for (const [p, q] of edges) {
        if (p === atoms[i] || q === atoms[i]) continue;
        if (toSegment(a.at, at.get(p)!.at, at.get(q)!.at) < 0.4) cost += 5;
      }
    }
    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        const [a, b] = edges[i];
        const [c, d] = edges[j];
        if (a === c || a === d || b === c || b === d) continue;
        if (!segmentsCross(at.get(a)!.at, at.get(b)!.at, at.get(c)!.at, at.get(d)!.at)) continue;
        const apart = Math.abs((at.get(a)!.depth + at.get(b)!.depth) / 2 - (at.get(c)!.depth + at.get(d)!.depth) / 2) > 0.5;
        cost += apart ? 0.3 : 1;
      }
    }
    for (const [i, l] of ends.entries()) {
      const from = at.get(l.metal)!.at;
      // (a ligand seen end on, its bond out short)
      if (Math.hypot(l.at.x - from.x, l.at.y - from.y) < 0.6 * METAL_BOND) cost += 5;
      for (const x of atoms) {
        if (x === l.metal) continue;
        const p = at.get(x)!.at;
        if (Math.hypot(l.at.x - p.x, l.at.y - p.y) < 1.2) cost += 5;
        if (toSegment(p, from, l.at) < 0.4) cost += 5;
      }
      for (const o of ends.slice(i + 1)) if (Math.abs(l.at.x - o.at.x) < 1.8 && Math.abs(l.at.y - o.at.y) < 0.7) cost += 5;
      for (const [p, q] of edges) {
        if (p === l.metal || q === l.metal) continue;
        if (segmentsCross(from, l.at, at.get(p)!.at, at.get(q)!.at)) cost += 2;
      }
    }
    if (!best || cost < best.cost - 1e-9) best = { view, cost };
  }
  const view = best!.view;
  const pos = new Map<number, Point>();
  const lift = new Map<number, number>();
  for (const x of atoms) {
    const v = seen(solid.get(x)!, view);
    pos.set(x, v.at);
    lift.set(x, v.depth);
  }
  const hints = new Map<number, Map<number, Point>>();
  for (const l of ligands) {
    const from = pos.get(l.metal)!;
    const to = seen(l.end, view).at;
    const v = { x: to.x - from.x, y: to.y - from.y };
    const len = Math.hypot(v.x, v.y) || 1;
    // (seen end on, a bond still shows at most of its length)
    const shown = Math.max(0.8 * METAL_BOND, len);
    const m = hints.get(l.metal) ?? new Map<number, Point>();
    m.set(l.atom, add(from, { x: (v.x / len) * shown, y: (v.y / len) * shown }));
    hints.set(l.metal, m);
  }
  return { pos, hints, lift };
}
