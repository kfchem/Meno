// Shared visual/picking constants for StructureEditor 2D
// Keep atom pick hit radius exactly in sync with the blue hover highlight size.

// Outer radius of the hover highlight disk/ring relative to NOMINAL_BOND_LENGTH
/**
 * Device-pixel ratio used by the 2D canvas. Fixed at 2 so bonds and labels are
 * supersampled the same way on 1x, 1.5x and HiDPI displays, instead of the
 * display's own ratio.
 */
export const CANVAS_DPR = 2;

export const ATOM_HOVER_RING_RADIUS_RATIO = 0.26; // world-units ratio

/** How long a press held still on an atom takes to lift it to be moved. */
export const HOLD_MS = 450;

/**
 * How long a pause in a drag takes to let a bond or an atom go where the
 * pointer is, off the grid - or to lay down the bond a chain is on. Longer
 * than a long press: a drag slows down as it arrives, and should not let go
 * of the grid on its way there.
 */
export const FREE_MS = 700;

// Atom picking hit radius (instanced circle used for raycasting)
// Must match the hover ring radius for exact visual parity.
export const ATOM_PICK_RADIUS_RATIO = ATOM_HOVER_RING_RADIUS_RATIO;
