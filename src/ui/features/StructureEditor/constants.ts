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

// Atom picking hit radius (instanced circle used for raycasting)
// Must match the hover ring radius for exact visual parity.
export const ATOM_PICK_RADIUS_RATIO = ATOM_HOVER_RING_RADIUS_RATIO;
