/**
 * How a molecule in 3D is drawn: its atoms and bonds, their finish, the
 * light it is seen in, and how it turns. Held as data, as the 2D drawing
 * style is (./style), so that it can be set the same way; the defaults are
 * the 3D viewer's look.
 */
import { getColor, getVdwRadius } from "../../utils/atomUtils";

export type Style3D = {
  /** Balls and sticks, or space-filling: each atom at its van der Waals radius. */
  atoms: "balls" | "space";
  /** A ball's radius, as a fraction of its atom's van der Waals radius. */
  ballScale: number;
  /** A bond's radius, in ångströms. */
  bondRadius: number;
  bondColor: string;
  /** The surface: from matt (1) to glossy (0), and how metallic. */
  roughness: number;
  metalness: number;
  /** The light from all round, and the light from above right, in front. */
  ambientLight: number;
  keyLight: number;
  /** How far a drag across half the canvas turns a molecule, in radians. */
  turnPerHalfWidth: number;
  /** How much of its speed a turn left to itself loses each sixtieth of a second. */
  turnDamping: number;
  /** How smooth a ball and a bond are: the segments round them. */
  ballSegments: number;
  bondSegments: number;
};

/** The 3D viewer's look. */
export const STYLE_3D: Style3D = {
  atoms: "balls",
  ballScale: 0.2,
  bondRadius: 0.1,
  bondColor: "#000000",
  roughness: 1,
  metalness: 0,
  ambientLight: 0.9,
  keyLight: 1,
  turnPerHalfWidth: 3,
  turnDamping: 0.1,
  ballSegments: 32,
  bondSegments: 8,
};

/** Where the key light comes from, as seen: above right, in front. */
export const KEY_LIGHT_FROM: readonly [number, number, number] = [5, 5, 5];

const vdw = new Map<string, number>();
const colour = new Map<string, string>();

/** An atom's radius as drawn, in ångströms. */
export function atomRadius(el: string, style: Style3D): number {
  if (!vdw.has(el)) vdw.set(el, getVdwRadius(el));
  return vdw.get(el)! * (style.atoms === "space" ? 1 : style.ballScale);
}

/** An atom's colour, by its element (an unknown one grey). */
export function atomColour(el: string): string {
  if (!colour.has(el)) colour.set(el, getColor(el));
  return colour.get(el)!;
}
