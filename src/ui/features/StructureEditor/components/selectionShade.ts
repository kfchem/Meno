import { ALPHA, COLORS } from "../../../theme/colors";

/** How strongly what is selected is shaded, against the hover highlight's. */
export const SHADE = 0.45;

/**
 * The highlight laid over the white page at `alpha`, as one opaque colour:
 * where an atom's shading meets its bonds' it is no darker than elsewhere.
 */
export function overWhite(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(255 + (c - 255) * alpha);
  const [r, g, b] = [mix((n >> 16) & 255), mix((n >> 8) & 255), mix(n & 255)];
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** What is selected is shaded in this: the highlight, lightly, opaque. */
export const SELECTION_SHADE = overWhite(COLORS.highlight, ALPHA.highlight * SHADE);
