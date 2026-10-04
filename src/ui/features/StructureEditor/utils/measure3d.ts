/**
 * Measurements on a molecule in 3D: what they come to, and the marks that
 * show them - pure, over atoms' places in the molecule's own frame.
 */
import * as THREE from "three";
import type { MeasureMark } from "../../../../lib/chem/layout2d";
import type { Style3D } from "../../../../lib/chem/style3d";
import { COLORS } from "../../../theme/colors";
import type { Carried3D, Molecule3D } from "../store/types";
import { frameOf, heightOf, lookOf, solidOf, WORLD_PER_ANGSTROM } from "./molecule3d";
import { seenAt, type Eye } from "./page";

/**
 * How a measurement is drawn, on the canvas and in a picture alike: its
 * lines' radius, a distance's dashes and gaps (in ångströms), and how
 * strongly its fan is filled.
 */
export const MEASURE_RADIUS = 0.03;
export const MEASURE_DASH = 0.16;
export const MEASURE_GAP = 0.11;
export const MEASURE_FAN_OPACITY = 0.16;

const at = (places: ArrayLike<number>, i: number) =>
  new THREE.Vector3(places[3 * i], places[3 * i + 1], places[3 * i + 2]);

/** What a measurement is: a distance, the angle at the middle atom, or the torsion angle about the middle two. */
export type MeasureKind = "distance" | "angle" | "torsion";

export function kindOf(atoms: number[]): MeasureKind {
  return atoms.length === 2 ? "distance" : atoms.length === 3 ? "angle" : "torsion";
}

/**
 * What a measurement comes to: a distance in ångströms, an angle in degrees,
 * a torsion angle in degrees from -180 to 180 - the sign IUPAC's, positive
 * when, looking along the middle bond, the far atom is turned clockwise from
 * the near one. `places` in world units.
 */
export function measureValue(places: ArrayLike<number>, atoms: number[]): number {
  const p = atoms.map((i) => at(places, i));
  if (p.length === 2) return p[0].distanceTo(p[1]) / WORLD_PER_ANGSTROM;
  if (p.length === 3) return THREE.MathUtils.radToDeg(p[0].clone().sub(p[1]).angleTo(p[2].clone().sub(p[1])));
  const b1 = p[1].clone().sub(p[0]);
  const b2 = p[2].clone().sub(p[1]);
  const b3 = p[3].clone().sub(p[2]);
  const n1 = b1.clone().cross(b2);
  const n2 = b2.clone().cross(b3);
  return THREE.MathUtils.radToDeg(Math.atan2(b2.clone().normalize().dot(n1.clone().cross(n2)), n1.dot(n2)));
}

/** A measurement as it is written: "1.54 Å", "109.5°", "−60.2°". */
export function measureText(kind: MeasureKind, value: number): string {
  const n = kind === "distance" ? value.toFixed(2) : value.toFixed(1);
  // (a true minus sign, and no "-0.0")
  const signed = /^-0\.0+$/.test(n) ? n.slice(1) : n.replace(/^-/, "−");
  return kind === "distance" ? `${signed} Å` : `${signed}°`;
}

/**
 * The marks that show a measurement, in the molecule's own frame: lines, as
 * points two by two; a fan, as triangles, drawn faintly; and where its
 * value is written.
 * - A distance: a line from atom to atom, dashed, the value at its middle.
 * - An angle: an arc between the two bonds at the middle atom, the fan
 *   within it, the value beyond the arc's middle.
 * - A torsion angle: the same about the middle bond, at its middle, from
 *   the first atom's side to the last's.
 */
export type MeasureMarks = { lines: THREE.Vector3[]; dashed: boolean; fan: THREE.Vector3[]; label: THREE.Vector3 };

/** How many steps an arc is drawn in. */
const ARC_STEPS = 24;

export function measureMarks(places: ArrayLike<number>, atoms: number[]): MeasureMarks {
  const p = atoms.map((i) => at(places, i));
  if (p.length === 2) {
    return { lines: [p[0], p[1]], dashed: true, fan: [], label: p[0].clone().add(p[1]).multiplyScalar(0.5) };
  }
  // the arc's middle, its two ends' ways out of it, and how far out it is drawn
  let centre: THREE.Vector3;
  let from: THREE.Vector3;
  let to: THREE.Vector3;
  if (p.length === 3) {
    centre = p[1];
    from = p[0].clone().sub(p[1]);
    to = p[2].clone().sub(p[1]);
  } else {
    centre = p[1].clone().add(p[2]).multiplyScalar(0.5);
    const axis = p[2].clone().sub(p[1]).normalize();
    const square = (v: THREE.Vector3) => v.addScaledVector(axis, -v.dot(axis));
    from = square(p[0].clone().sub(p[1]));
    to = square(p[3].clone().sub(p[2]));
  }
  const radius = Math.min(from.length(), to.length(), 1.2 * WORLD_PER_ANGSTROM) * 0.45;
  from.normalize();
  to.normalize();
  const angle = from.angleTo(to);
  // (straight, or nothing between: no arc to draw, the value at the middle)
  const normal = from.clone().cross(to);
  if (normal.lengthSq() < 1e-10 || angle < 1e-4) {
    return { lines: [], dashed: false, fan: [], label: centre.clone() };
  }
  normal.normalize();
  const arc: THREE.Vector3[] = [];
  for (let k = 0; k <= ARC_STEPS; k++) {
    const q = new THREE.Quaternion().setFromAxisAngle(normal, (angle * k) / ARC_STEPS);
    arc.push(centre.clone().addScaledVector(from.clone().applyQuaternion(q), radius));
  }
  const lines: THREE.Vector3[] = [];
  const fan: THREE.Vector3[] = [];
  for (let k = 0; k < ARC_STEPS; k++) {
    lines.push(arc[k], arc[k + 1]);
    fan.push(centre, arc[k], arc[k + 1]);
  }
  const middle = from.clone().applyQuaternion(new THREE.Quaternion().setFromAxisAngle(normal, angle / 2));
  return { lines, dashed: false, fan, label: centre.clone().addScaledVector(middle, radius * 1.6) };
}

/** A line from `a` to `b` (world units) cut into a distance's dashes, each as its two ends. */
export function dashesOf(a: THREE.Vector3, b: THREE.Vector3): [THREE.Vector3, THREE.Vector3][] {
  const period = (MEASURE_DASH + MEASURE_GAP) * WORLD_PER_ANGSTROM;
  const dashes = Math.max(1, Math.round(a.distanceTo(b) / period));
  const along = b.clone().sub(a).divideScalar(dashes);
  const inset = MEASURE_GAP / (MEASURE_DASH + MEASURE_GAP) / 2;
  const out: [THREE.Vector3, THREE.Vector3][] = [];
  for (let d = 0; d < dashes; d++) {
    out.push([a.clone().addScaledVector(along, d + inset), a.clone().addScaledVector(along, d + 1 - inset)]);
  }
  return out;
}

/**
 * A molecule in 3D's measurements as a picture shows them (`MeasureMark`):
 * in the frame it shows, turned as it is, seen as the canvas sees it -
 * straight from above, or from an `eye` in perspective - their values
 * `size` high (world units).
 */
export function measurePictureMarks(m: Carried3D, style: Style3D, size: number, eye?: Eye): MeasureMark[] {
  const measures = m.measures ?? [];
  if (!measures.length) return [];
  const molecule = { ...m, id: 0 } as Molecule3D;
  const solid = solidOf(molecule, style);
  const places = solid.frames[frameOf(solid, m.frame)];
  const height = heightOf(m, solid, lookOf(molecule, style));
  const q = m.turn ? new THREE.Quaternion(...m.turn) : new THREE.Quaternion();
  const seen = (v: THREE.Vector3) => {
    const p = v.clone().applyQuaternion(q);
    const at = seenAt(m.at.x + p.x, m.at.y + p.y, height + p.z, eye);
    return { x: at.x, y: at.y };
  };
  const n = m.atoms.length;
  return measures
    .filter((x) => x.atoms.length >= 2 && x.atoms.every((i) => i >= 0 && i < n))
    .map((x) => {
      const marks = measureMarks(places, x.atoms);
      const lines: [THREE.Vector3, THREE.Vector3][] = [];
      for (let k = 0; k + 1 < marks.lines.length; k += 2) {
        if (marks.dashed) lines.push(...dashesOf(marks.lines[k], marks.lines[k + 1]));
        else lines.push([marks.lines[k], marks.lines[k + 1]]);
      }
      const fan: MeasureMark["fan"] = [];
      for (let k = 0; k + 2 < marks.fan.length; k += 3) fan.push([seen(marks.fan[k]), seen(marks.fan[k + 1]), seen(marks.fan[k + 2])]);
      return {
        lines: lines.map(([a, b]) => [seen(a), seen(b)] as [{ x: number; y: number }, { x: number; y: number }]),
        width: 2 * MEASURE_RADIUS * WORLD_PER_ANGSTROM,
        fan,
        fanOpacity: MEASURE_FAN_OPACITY,
        label: seen(marks.label),
        text: measureText(kindOf(x.atoms), measureValue(places, x.atoms)),
        size,
        color: COLORS.highlight,
      };
    });
}
