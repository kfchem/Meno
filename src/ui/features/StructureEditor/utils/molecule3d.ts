import * as THREE from "three";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { atomRadius, type Style3D } from "../../../../lib/chem/style3d";
import type { Molecule3D, Turn3D } from "../store/types";

/** World units to the ångström: a bond of 1.5 Å as long as a drawn bond. */
export const WORLD_PER_ANGSTROM = NOMINAL_BOND_LENGTH / 1.5;

/** A molecule in 3D as it is drawn: about its centre, in world units. */
export type Solid = {
  /** Each atom's place about the centre: x, y and z in turn. */
  local: Float32Array;
  /** Each atom's radius as drawn. */
  radii: Float32Array;
  /** How far it reaches from its centre, its atoms and all. */
  reach: number;
};

const solids = new WeakMap<Molecule3D, WeakMap<Style3D, Solid>>();

export function solidOf(m: Molecule3D, style: Style3D): Solid {
  let byStyle = solids.get(m);
  if (!byStyle) solids.set(m, (byStyle = new WeakMap()));
  const known = byStyle.get(style);
  if (known) return known;
  const n = m.atoms.length;
  let cx = 0, cy = 0, cz = 0;
  for (const a of m.atoms) {
    cx += a.x;
    cy += a.y;
    cz += a.z;
  }
  if (n) {
    cx /= n;
    cy /= n;
    cz /= n;
  }
  const k = WORLD_PER_ANGSTROM;
  const local = new Float32Array(n * 3);
  const radii = new Float32Array(n);
  let reach = 0;
  m.atoms.forEach((a, i) => {
    local[3 * i] = (a.x - cx) * k;
    local[3 * i + 1] = (a.y - cy) * k;
    local[3 * i + 2] = (a.z - cz) * k;
    radii[i] = atomRadius(a.el, style) * k;
    reach = Math.max(reach, Math.hypot(local[3 * i], local[3 * i + 1], local[3 * i + 2]) + radii[i]);
  });
  const solid = { local, radii, reach };
  byStyle.set(style, solid);
  return solid;
}

/**
 * How high above the page a molecule's centre stands: as far as it reaches,
 * so that however it is turned none of it passes behind the page.
 */
export function standingHeight(s: Solid): number {
  return s.reach;
}

/** An atom or a bond's end as the camera sees it, taken back to the page: where, and how large. */
type Seen = { x: number; y: number; r: number };

/** Each atom as the camera sees it, taken back to the page. */
export function seenOnPage(m: Molecule3D, s: Solid, turn: Turn3D | undefined, camera: THREE.Vector3): Seen[] {
  const q = turn ? new THREE.Quaternion(...turn) : new THREE.Quaternion();
  const p = new THREE.Vector3();
  const h = standingHeight(s);
  const seen: Seen[] = [];
  for (let i = 0; i < s.radii.length; i++) {
    p.set(s.local[3 * i], s.local[3 * i + 1], s.local[3 * i + 2]).applyQuaternion(q);
    const x = m.at.x + p.x, y = m.at.y + p.y, z = h + p.z;
    const k = camera.z / Math.max(camera.z - z, 1e-3);
    seen.push({ x: camera.x + (x - camera.x) * k, y: camera.y + (y - camera.y) * k, r: s.radii[i] * k });
  }
  return seen;
}

const rings = new WeakMap<Molecule3D, number[][]>();

/**
 * A molecule's small rings, of up to eight atoms: for each bond, the
 * shortest way round from one end to the other without it.
 */
export function ringsOf(m: Molecule3D): number[][] {
  const known = rings.get(m);
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
  rings.set(m, all);
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
  s: Solid,
  turn: Turn3D | undefined,
  camera: THREE.Vector3,
  x: number,
  y: number,
  zoom: number,
  bondRadius: number,
): "body" | "rim" | null {
  const seen = seenOnPage(m, s, turn, camera);
  // (quickly: nothing near enough to the molecule at all)
  const reach = (BODY_PX + RIM_PX) / zoom;
  let d = Infinity;
  for (const a of seen) d = Math.min(d, Math.hypot(x - a.x, y - a.y) - a.r);
  if (d > reach + 2 * NOMINAL_BOND_LENGTH) return null;
  for (const b of m.bonds) {
    const a1 = seen[b.a1], a2 = seen[b.a2];
    const r = bondRadius * WORLD_PER_ANGSTROM * ((a1.r / s.radii[b.a1] + a2.r / s.radii[b.a2]) / 2);
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
