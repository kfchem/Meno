import type { Atom as LAtom, Bond as LBond, LayoutOptions } from "./layout2d";
import { ACS_1996, layoutOptionsFor } from "./style";

// Fixed nominal bond length in world units used by StructureEditor
// This replaces on-the-fly averaging for interactive operations.
export const NOMINAL_BOND_LENGTH = 1.8; // world units

// Fixed nominal bond length in pixels used for styling (labels, widths, gaps)
export const NOMINAL_BOND_PX = 24;

export function averageBondLengthWorld(atoms: LAtom[], bonds: LBond[]): number {
  let sum = 0,
    cnt = 0;
  for (const b of bonds) {
    const p1 = atoms[b.a1];
    const p2 = atoms[b.a2];
    if (!p1 || !p2) continue;
    const dx = p2.x - p1.x,
      dy = p2.y - p1.y;
    const d = Math.hypot(dx, dy);
    if (d > 1e-6) {
      sum += d;
      cnt++;
    }
  }
  return cnt > 0 ? sum / cnt : 1.8;
}

/**
 * Layout options for the ACS 1996 style, at the editor's nominal bond length
 * (or `NOMINAL_BOND_PX` when `units` is "px").
 */
export function acsWorldOptions(
  _atoms: LAtom[],
  _bonds: LBond[],
  overrides?: Partial<LayoutOptions>
): LayoutOptions {
  const units = overrides?.units ?? "world";
  const L = units === "px" ? NOMINAL_BOND_PX : NOMINAL_BOND_LENGTH;
  return layoutOptionsFor(ACS_1996, L, { units, ...(overrides ?? {}) });
}

