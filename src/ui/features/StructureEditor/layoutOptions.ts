import { acsWorldOptions } from "../../../lib/chem/acs";
import type {
  Atom as LAtom,
  Bond as LBond,
  LayoutOptions,
} from "../../../lib/chem/layout2d";

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
