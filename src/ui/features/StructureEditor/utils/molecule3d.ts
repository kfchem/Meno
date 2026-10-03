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

export type Rect = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * The part of the page a molecule covers, as the camera sees it: each atom
 * seen from where the camera stands, taken back to the page.
 */
export function footprint(m: Molecule3D, s: Solid, turn: Turn3D | undefined, camera: THREE.Vector3): Rect {
  const q = turn ? new THREE.Quaternion(...turn) : new THREE.Quaternion();
  const p = new THREE.Vector3();
  const h = standingHeight(s);
  const r: Rect = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (let i = 0; i < s.radii.length; i++) {
    p.set(s.local[3 * i], s.local[3 * i + 1], s.local[3 * i + 2]).applyQuaternion(q);
    const x = m.at.x + p.x, y = m.at.y + p.y, z = h + p.z;
    const k = camera.z / Math.max(camera.z - z, 1e-3);
    const px = camera.x + (x - camera.x) * k;
    const py = camera.y + (y - camera.y) * k;
    const pr = s.radii[i] * k;
    r.minX = Math.min(r.minX, px - pr);
    r.maxX = Math.max(r.maxX, px + pr);
    r.minY = Math.min(r.minY, py - pr);
    r.maxY = Math.max(r.maxY, py + pr);
  }
  if (!isFinite(r.minX)) return { minX: m.at.x, minY: m.at.y, maxX: m.at.x, maxY: m.at.y };
  return r;
}

/** The frame round a molecule: its footprint with room about it, at least so many pixels. */
export function frameOf(fp: Rect, zoom: number): Rect {
  const pad = Math.max(0.35 * NOMINAL_BOND_LENGTH, 10 / zoom);
  return { minX: fp.minX - pad, minY: fp.minY - pad, maxX: fp.maxX + pad, maxY: fp.maxY + pad };
}

/** How wide the frame's edge is to the pointer, in pixels: on it, a drag moves the molecule. */
export const FRAME_EDGE_PX = 7;

/** What a point of the page is to a frame: within it, on its edge, or outside. */
export function partOfFrame(frame: Rect, x: number, y: number, zoom: number): "body" | "edge" | null {
  const band = FRAME_EDGE_PX / zoom;
  // (how far outside the frame the point is; negative within)
  const dx = Math.max(frame.minX - x, x - frame.maxX);
  const dy = Math.max(frame.minY - y, y - frame.maxY);
  const outside = dx > 0 || dy > 0 ? Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) : Math.max(dx, dy);
  if (Math.abs(outside) <= band) return "edge";
  return outside < 0 ? "body" : null;
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
