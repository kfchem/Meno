import { acsWorldOptions } from "../../../lib/chem/acs";
import type {
  Atom as LAtom,
  Bond as LBond,
  LayoutOptions,
} from "../../../lib/chem/layout2d";
import type { Bond } from "./store/types";

/**
 * A model bond as the layout takes it, between the atoms at layout indices
 * `a1` and `a2`. Every layer converts through here, so none of them draws a
 * bond without a field the drawing depends on - which side a double bond's
 * second line takes, which way a wedge points, how the bond is displayed.
 */
export function layoutBond(b: Bond, a1: number, a2: number): LBond {
  return {
    a1,
    a2,
    order: b.order,
    stereo: b.stereo ?? "none",
    doubleMode: b.doubleMode ?? "auto",
    stereoOrient: b.stereoOrient ?? "principle",
    ...(b.display ? { display: b.display } : {}),
    ...(b.dative ? { dative: true } : {}),
  };
}

/**
 * The model's bonds as the layout takes them, by the layout index of each
 * atom id; a bond to an atom that is not there is left out.
 */
export function layoutBonds(
  bonds: readonly Bond[],
  indexOf: ReadonlyMap<number, number>,
): LBond[] {
  const out: LBond[] = [];
  for (const b of bonds) {
    const a1 = indexOf.get(b.a);
    const a2 = indexOf.get(b.b);
    if (a1 == null || a2 == null) continue;
    out.push(layoutBond(b, a1, a2));
  }
  return out;
}

/**
 * A line thinner than this on screen disappears into the background, so the
 * layout is told to keep bonds at least this wide however far out the camera
 * is.
 */
export const MIN_LINE_PX = 1.25;

/**
 * The options every part of the 2D editor draws with. Each component used to
 * build its own, which drifted: only the bonds kept a minimum on-screen width,
 * so at low zoom they and the wedges disagreed about how wide a bond was, and
 * the SVG export drew to yet another set. Pass overrides for what genuinely
 * differs (the aromatic circles a view shows, a caller's own settings).
 */
export function editorLayoutOptions(
  atoms: LAtom[],
  bonds: LBond[],
  over?: Partial<LayoutOptions>,
): LayoutOptions {
  return acsWorldOptions(atoms, bonds, {
    units: "world",
    minLinePx: MIN_LINE_PX,
    ...over,
  });
}
