import * as THREE from "three";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { atomRadius, type Style3D } from "../../../../lib/chem/style3d";
import type { Molecule3D, Turn3D } from "../store/types";

/** World units to the ångström: a bond of 1.5 Å as long as a drawn bond. */
export const WORLD_PER_ANGSTROM = NOMINAL_BOND_LENGTH / 1.5;

/** How a molecule in 3D is drawn: balls and sticks, or space-filling. */
export type Look = "balls" | "space";

/** A molecule's own look, or the style's. */
export function lookOf(m: Molecule3D, style: Style3D): Look {
  return m.look ?? style.atoms;
}

/** A molecule in 3D as it is drawn, frame by frame: about its centre, in world units. */
export type Solid = {
  /** Each frame's atoms about that frame's own centre: x, y and z in turn. */
  frames: Float32Array[];
  /** Each atom's radius as drawn, balls and sticks or space-filling. */
  radii: Record<Look, Float32Array>;
  /** How far it reaches from its centre in any frame, its atoms and all. */
  reach: Record<Look, number>;
};

// (by its atoms, which a move, a new look or a measurement leave as they were)
const solids = new WeakMap<object, WeakMap<Style3D, { frames: unknown; solid: Solid }>>();

/** Each atom's place in a frame, about the frame's centre, in world units. */
function placesOf(xyz: ArrayLike<number>, n: number): Float32Array {
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) {
    cx += xyz[3 * i];
    cy += xyz[3 * i + 1];
    cz += xyz[3 * i + 2];
  }
  if (n) {
    cx /= n;
    cy /= n;
    cz /= n;
  }
  const k = WORLD_PER_ANGSTROM;
  const local = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    local[3 * i] = (xyz[3 * i] - cx) * k;
    local[3 * i + 1] = (xyz[3 * i + 1] - cy) * k;
    local[3 * i + 2] = (xyz[3 * i + 2] - cz) * k;
  }
  return local;
}

export function solidOf(m: Molecule3D, style: Style3D): Solid {
  let byStyle = solids.get(m.atoms);
  if (!byStyle) solids.set(m.atoms, (byStyle = new WeakMap()));
  const known = byStyle.get(style);
  if (known && known.frames === m.frames) return known.solid;
  const n = m.atoms.length;
  const first = m.atoms.flatMap((a) => [a.x, a.y, a.z]);
  // (a frame that does not hold every atom is left out)
  const frames = [first, ...(m.frames ?? []).filter((f) => f.length === 3 * n)].map((f) => placesOf(f, n));
  const k = WORLD_PER_ANGSTROM;
  const radii = {
    balls: Float32Array.from(m.atoms, (a) => atomRadius(a.el, { ...style, atoms: "balls" }) * k),
    space: Float32Array.from(m.atoms, (a) => atomRadius(a.el, { ...style, atoms: "space" }) * k),
  };
  const reachOf = (r: Float32Array) => {
    let reach = 0;
    for (const f of frames) {
      for (let i = 0; i < n; i++) reach = Math.max(reach, Math.hypot(f[3 * i], f[3 * i + 1], f[3 * i + 2]) + r[i]);
    }
    return reach;
  };
  const solid = { frames, radii, reach: { balls: reachOf(radii.balls), space: reachOf(radii.space) } };
  byStyle.set(style, { frames: m.frames, solid });
  return solid;
}

/** The frame a molecule shows, kept to the frames it has. */
export function frameOf(s: Solid, frame: number | undefined): number {
  return Math.min(Math.max(0, Math.round(frame ?? 0)), s.frames.length - 1);
}

/**
 * How high above the page a molecule's centre stands: as far as it reaches,
 * so that however it is turned none of it passes behind the page.
 */
export function standingHeight(s: Solid, look: Look = "balls"): number {
  return s.reach[look];
}

/**
 * A molecule in 3D as it stands: where on the page, how high, how turned,
 * and where its atoms are and how large, about its centre.
 */
export type Pose = {
  at: { x: number; y: number };
  height: number;
  turn?: Turn3D;
  places: Float32Array;
  radii: Float32Array;
};

/** A molecule as it stands in a frame, in a look, turned as it is. */
export function poseOf(m: Molecule3D, s: Solid, look: Look, turn?: Turn3D, frame?: number): Pose {
  return { at: m.at, height: standingHeight(s, look), turn, places: s.frames[frameOf(s, frame)], radii: s.radii[look] };
}

/** An atom or a bond's end as the camera sees it, taken back to the page: where, how large, and how near. */
type Seen = { x: number; y: number; r: number; z: number };

/** Each atom as the camera sees it, taken back to the page. */
export function seenOnPage(pose: Pose, camera: THREE.Vector3): Seen[] {
  const q = pose.turn ? new THREE.Quaternion(...pose.turn) : new THREE.Quaternion();
  const p = new THREE.Vector3();
  const seen: Seen[] = [];
  for (let i = 0; i < pose.radii.length; i++) {
    p.set(pose.places[3 * i], pose.places[3 * i + 1], pose.places[3 * i + 2]).applyQuaternion(q);
    const x = pose.at.x + p.x, y = pose.at.y + p.y, z = pose.height + p.z;
    const k = camera.z / Math.max(camera.z - z, 1e-3);
    seen.push({ x: camera.x + (x - camera.x) * k, y: camera.y + (y - camera.y) * k, r: pose.radii[i] * k, z });
  }
  return seen;
}

/**
 * How far a molecule reaches on the page, as it is turned and shown now,
 * seen from `distance` straight above its centre: what a fit makes room for.
 */
export function seenBounds(pose: Pose, distance: number): { minX: number; maxX: number; minY: number; maxY: number } {
  const q = pose.turn ? new THREE.Quaternion(...pose.turn) : new THREE.Quaternion();
  const p = new THREE.Vector3();
  const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (let i = 0; i < pose.radii.length; i++) {
    p.set(pose.places[3 * i], pose.places[3 * i + 1], pose.places[3 * i + 2]).applyQuaternion(q);
    const k = distance / Math.max(distance - (pose.height + p.z), 1e-3);
    const r = pose.radii[i] * k;
    b.minX = Math.min(b.minX, pose.at.x + p.x * k - r);
    b.maxX = Math.max(b.maxX, pose.at.x + p.x * k + r);
    b.minY = Math.min(b.minY, pose.at.y + p.y * k - r);
    b.maxY = Math.max(b.maxY, pose.at.y + p.y * k + r);
  }
  return b;
}

/** The atom seen at a point of the page, the nearest of those there; null where there is none. */
export function atomAt(pose: Pose, camera: THREE.Vector3, x: number, y: number): number | null {
  let best: number | null = null;
  let z = -Infinity;
  seenOnPage(pose, camera).forEach((a, i) => {
    if (Math.hypot(x - a.x, y - a.y) <= a.r && a.z > z) {
      best = i;
      z = a.z;
    }
  });
  return best;
}

/** How many lines a bond is drawn with in 3D: a double bond two, a triple three, any other one. */
export function linesOf(order: number): number {
  return order === 2 ? 2 : order === 3 ? 3 : 1;
}

/** One line of a bond: from where to where, how thick. */
export type BondLine = { a: THREE.Vector3; b: THREE.Vector3; r: number };

/**
 * Each bond's lines, from atom to atom about the molecule's centre: a single
 * bond one, of radius `r`; a double bond two, and a triple three, thinner,
 * side by side - in the plane of a neighbouring atom, so that a double bond
 * lies in the plane its atoms make.
 */
export function bondLines(m: Molecule3D, places: Float32Array, r: number): BondLine[] {
  const near: number[][] = m.atoms.map(() => []);
  for (const b of m.bonds) {
    near[b.a1].push(b.a2);
    near[b.a2].push(b.a1);
  }
  const at = (i: number) => new THREE.Vector3(places[3 * i], places[3 * i + 1], places[3 * i + 2]);
  const lines: BondLine[] = [];
  for (const bond of m.bonds) {
    const a = at(bond.a1);
    const b = at(bond.a2);
    const n = linesOf(bond.order);
    if (n === 1) {
      lines.push({ a, b, r });
      continue;
    }
    const along = b.clone().sub(a).normalize();
    // across: towards a neighbour of either end, square to the bond
    let across: THREE.Vector3 | null = null;
    for (const [from, other] of [
      [bond.a1, bond.a2],
      [bond.a2, bond.a1],
    ]) {
      for (const c of near[from]) {
        if (c === other) continue;
        const v = at(c).sub(at(from));
        v.addScaledVector(along, -v.dot(along));
        if (v.lengthSq() > 1e-6) {
          across = v.normalize();
          break;
        }
      }
      if (across) break;
    }
    // (none: any way square to it)
    if (!across) {
      across = new THREE.Vector3(0, 0, 1).cross(along);
      if (across.lengthSq() < 1e-6) across = new THREE.Vector3(0, 1, 0).cross(along);
      across.normalize();
    }
    const thin = r * BOND_LINE;
    const gap = r * BOND_GAP;
    const offsets = n === 2 ? [-gap / 2, gap / 2] : [-gap, 0, gap];
    for (const o of offsets) lines.push({ a: a.clone().addScaledVector(across, o), b: b.clone().addScaledVector(across, o), r: thin });
  }
  return lines;
}

/** A double or triple bond's lines: how thick, and how far apart, as a part of a single bond's radius. */
const BOND_LINE = 0.62;
const BOND_GAP = 2.4;

const rings = new WeakMap<object, number[][]>();

/**
 * A molecule's small rings, of up to eight atoms: for each bond, the
 * shortest way round from one end to the other without it.
 */
export function ringsOf(m: Molecule3D): number[][] {
  const known = rings.get(m.bonds);
  if (known) return known;
  const near: number[][] = m.atoms.map(() => []);
  for (const b of m.bonds) {
    near[b.a1].push(b.a2);
    near[b.a2].push(b.a1);
  }
  const found = new Map<string, number[]>();
  for (const b of m.bonds) {
    const from = new Map<number, number>([[b.a1, -1]]);
    let edge = [b.a1];
    for (let depth = 0; depth < 7 && !from.has(b.a2); depth++) {
      const next: number[] = [];
      for (const a of edge) {
        for (const c of near[a]) {
          if (from.has(c) || (a === b.a1 && c === b.a2)) continue;
          from.set(c, a);
          next.push(c);
        }
      }
      edge = next;
    }
    if (!from.has(b.a2)) continue;
    const ring: number[] = [];
    for (let a = b.a2; a !== -1; a = from.get(a)!) ring.push(a);
    const key = [...ring].sort((x, y) => x - y).join(",");
    if (!found.has(key)) found.set(key, ring);
  }
  const all = [...found.values()];
  rings.set(m.bonds, all);
  return all;
}

/** How far within the outline a press still turns, in pixels, and how wide the rim beyond it is. */
export const BODY_PX = 4;
export const RIM_PX = 9;

function toSegment(px: number, py: number, a: Seen, b: Seen): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / Math.max(dx * dx + dy * dy, 1e-12)));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

function inPolygon(px: number, py: number, pts: Seen[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * What a point of the page is to a molecule in 3D, as it is seen: on it -
 * its atoms, its bonds, within its rings, or just outside its outline - where
 * a drag turns it; on the rim beyond, where a drag moves it; or neither.
 */
export function partAt(
  m: Molecule3D,
  pose: Pose,
  camera: THREE.Vector3,
  x: number,
  y: number,
  zoom: number,
  bondRadius: number,
): "body" | "rim" | null {
  const seen = seenOnPage(pose, camera);
  // (quickly: nothing near enough to the molecule at all)
  const reach = (BODY_PX + RIM_PX) / zoom;
  let d = Infinity;
  for (const a of seen) d = Math.min(d, Math.hypot(x - a.x, y - a.y) - a.r);
  if (d > reach + 2 * NOMINAL_BOND_LENGTH) return null;
  for (const b of m.bonds) {
    const a1 = seen[b.a1], a2 = seen[b.a2];
    const r = bondRadius * WORLD_PER_ANGSTROM * ((a1.r / pose.radii[b.a1] + a2.r / pose.radii[b.a2]) / 2);
    d = Math.min(d, toSegment(x, y, a1, a2) - r);
  }
  if (d > 0 && ringsOf(m).some((ring) => inPolygon(x, y, ring.map((i) => seen[i])))) d = 0;
  if (d <= BODY_PX / zoom) return "body";
  if (d <= reach) return "rim";
  return null;
}

/** Where molecules in 3D stand when placed in a row about a point, each clear of the next. */
export function rowAbout(at: { x: number; y: number }, reaches: number[]): { x: number; y: number }[] {
  const gap = NOMINAL_BOND_LENGTH;
  const width = reaches.reduce((w, r) => w + 2 * r, 0) + gap * Math.max(0, reaches.length - 1);
  let x = at.x - width / 2;
  return reaches.map((r) => {
    const c = { x: x + r, y: at.y };
    x += 2 * r + gap;
    return c;
  });
}

/** Where molecules in 3D stand placed in a row to the right of `left`, about the height `y`. */
export function rowAfter(left: number, y: number, reaches: number[]): { x: number; y: number }[] {
  const width = reaches.reduce((w, r) => w + 2 * r, 0) + NOMINAL_BOND_LENGTH * Math.max(0, reaches.length - 1);
  return rowAbout({ x: left + width / 2, y }, reaches);
}

/**
 * A molecule in 3D as it is seen, for another program: the frame it shows,
 * turned as it is, about its centre - placed where it stands on the page,
 * `placed`, so that several keep their places side by side - in ångströms.
 */
export function asSeen(
  m: Pick<Molecule3D, "atoms" | "frames" | "at">,
  turn?: Turn3D,
  frame?: number,
  placed = false,
): { el: string; x: number; y: number; z: number; charge?: number; isotope?: number }[] {
  const n = m.atoms.length;
  const frames = [m.atoms.flatMap((a) => [a.x, a.y, a.z]), ...(m.frames ?? []).filter((f) => f.length === 3 * n)];
  const xyz = frames[Math.min(Math.max(0, Math.round(frame ?? 0)), frames.length - 1)];
  const local = placesOf(xyz, n);
  const q = turn ? new THREE.Quaternion(...turn) : new THREE.Quaternion();
  const k = WORLD_PER_ANGSTROM;
  const v = new THREE.Vector3();
  return m.atoms.map((a, i) => {
    v.set(local[3 * i], local[3 * i + 1], local[3 * i + 2]).applyQuaternion(q).divideScalar(k);
    if (placed) {
      v.x += m.at.x / k;
      v.y += m.at.y / k;
    }
    return { el: a.el, x: v.x, y: v.y, z: v.z, ...(a.charge ? { charge: a.charge } : {}), ...(a.isotope ? { isotope: a.isotope } : {}) };
  });
}
