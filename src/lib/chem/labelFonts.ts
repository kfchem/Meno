/**
 * The typefaces a label can be set in, by the metrics it is placed and
 * cleared by: how far each character advances the pen, and the convex
 * outline of its ink. A label in a typeface Meno has no metrics for is
 * placed by Arial's - close for most sans-serifs, but a bond may then stop a
 * little short of the letters, or run a little into them.
 *
 * Metrics are generated from a font file by scripts/fonts/labelMetrics.ts.
 */

export type LabelFontMetrics = {
  family: string;
  unitsPerEm: number;
  /** The height of a capital letter, in font units. */
  capHeight: number;
  /** Advance widths of the characters from U+0020 (space) to U+007E (~). */
  advances: readonly number[];
  /**
   * The ink of each character as a convex polygon, anticlockwise: x, y, x,
   * y, ... A space has none.
   */
  hulls: Readonly<Record<string, readonly number[]>>;
  /** What a character outside the table is taken to be; a capital's box when unset. */
  fallbackAdvance?: number;
  fallbackHull?: readonly number[];
};

const fonts = new Map<string, LabelFontMetrics>();
let fallback: LabelFontMetrics | undefined;

/**
 * Makes a typeface's metrics known, under its family name and any other
 * names given (Helvetica is set by Arial's). The first registered is the
 * fallback.
 */
export function registerLabelFont(metrics: LabelFontMetrics, ...aliases: string[]): void {
  for (const name of [metrics.family, ...aliases]) fonts.set(name.toLowerCase(), metrics);
  fallback ??= metrics;
}

/** The metrics a label in `family` is set by. */
export function labelFontMetrics(family: string | undefined): LabelFontMetrics {
  const found = family ? fonts.get(family.toLowerCase()) : undefined;
  if (found) return found;
  if (!fallback) throw new Error("no label font registered");
  return fallback;
}

/** Whether Meno has the metrics of `family`, rather than standing Arial's in. */
export function hasLabelFont(family: string): boolean {
  return fonts.has(family.toLowerCase());
}

/** How far a character advances the pen, in ems. */
export function advanceIn(font: LabelFontMetrics, ch: string): number {
  const code = ch.codePointAt(0) ?? 0;
  const units =
    code >= 0x20 && code <= 0x7e ? font.advances[code - 0x20] : outsideAdvance(font);
  return units / font.unitsPerEm;
}

/**
 * The convex outline of a character's ink, in ems from its origin on the
 * baseline, y up; empty for a space.
 */
export function inkHullIn(font: LabelFontMetrics, ch: string): { x: number; y: number }[] {
  if (ch === " ") return [];
  const code = ch.codePointAt(0) ?? 0;
  const flat = code >= 0x20 && code <= 0x7e ? (font.hulls[ch] ?? []) : outsideHull(font);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    out.push({ x: flat[i] / font.unitsPerEm, y: flat[i + 1] / font.unitsPerEm });
  }
  return out;
}

/** A character outside the table: as the font says, or as wide as an H. */
function outsideAdvance(font: LabelFontMetrics): number {
  return font.fallbackAdvance ?? font.advances["H".charCodeAt(0) - 0x20];
}

/** A character outside the table: as the font says, or a capital's box. */
function outsideHull(font: LabelFontMetrics): readonly number[] {
  if (font.fallbackHull) return font.fallbackHull;
  const w = outsideAdvance(font);
  const side = w * 0.07;
  return [side, 0, w - side, 0, w - side, font.capHeight, side, font.capHeight];
}
