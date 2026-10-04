import { createContext } from "react";

/**
 * Makes a molecule in 3D again from its drawing, where the drawing has
 * changed since it was made: given by the canvas (StructureCanvas), which
 * asks RDKit, to the molecules' layer.
 */
export const Remake3D = createContext<((id: number) => void) | null>(null);
