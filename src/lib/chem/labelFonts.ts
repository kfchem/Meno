import { inkHull, type GlyphCommand, type GlyphPoint } from "./glyphHull";

/**
 * The typefaces a label can be set in, by what it is placed and cleared by:
 * how far each character advances the pen, and the convex outline of its
 * ink.
 *
 * A typeface's letters come from one or more sources, looked at in turn: a
 * table written ahead of time for the letters that matter most (Arial's and
 * IBM Plex Sans's ASCII, in `fonts/`), then the font file itself, read when
 * the typeface is first used. A character none of them has - a Japanese
 * one in a Latin typeface - comes from the fallbacks (IBM Plex Sans JP), and
 * a typeface Meno cannot read at all is set in the default, IBM Plex Sans:
 * the canvas draws it the same way, so the two never disagree.
 */

/** Metrics written ahead of time, for the printable ASCII characters. */
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

/** Where a typeface's letters come from, in ems, y up. */
export interface GlyphSource {
  /** Whether it has the character. */
  has(ch: string): boolean;
  advance(ch: string): number;
  hull(ch: string): GlyphPoint[];
  /** The height of a capital letter. */
  readonly capHeight: number;
}

/** A typeface, letter by letter, from wherever each letter comes from. */
export interface LabelFont {
  readonly family: string;
  readonly capHeight: number;
  /** Whether any of its sources, the fallbacks among them, has the character. */
  has(ch: string): boolean;
  advance(ch: string): number;
  hull(ch: string): GlyphPoint[];
}

function isTableChar(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return code >= 0x20 && code <= 0x7e;
}

/** How far a character advances the pen, in ems, by a table. */
export function advanceIn(font: LabelFontMetrics, ch: string): number {
  const code = ch.codePointAt(0) ?? 0;
  const units = isTableChar(ch)
    ? font.advances[code - 0x20]
    : outsideAdvance(font);
  return units / font.unitsPerEm;
}

/**
 * The convex outline of a character's ink by a table, in ems from its
 * origin on the baseline, y up; empty for a space.
 */
export function inkHullIn(font: LabelFontMetrics, ch: string): GlyphPoint[] {
  if (ch === " ") return [];
  const flat = isTableChar(ch) ? (font.hulls[ch] ?? []) : outsideHull(font);
  const out: GlyphPoint[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    out.push({
      x: flat[i] / font.unitsPerEm,
      y: flat[i + 1] / font.unitsPerEm,
    });
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

/** A table as a source: it has the printable ASCII characters. */
export function tableGlyphs(font: LabelFontMetrics): GlyphSource {
  return {
    capHeight: font.capHeight / font.unitsPerEm,
    has: (ch) =>
      isTableChar(ch) && (ch === " " || font.hulls[ch] !== undefined),
    advance: (ch) => advanceIn(font, ch),
    hull: (ch) => inkHullIn(font, ch),
  };
}

/** A font file as a font reader gives it: the little of it a label needs. */
export type ReadFont = {
  unitsPerEm: number;
  tables: { os2?: { sCapHeight?: number } };
  charToGlyphIndex(ch: string): number;
  charToGlyph(ch: string): {
    advanceWidth?: number;
    getPath(
      x: number,
      y: number,
      fontSize: number,
    ): { commands: GlyphCommand[] };
  };
};

/** A font file as a source: every character it has, worked out when first asked for. */
export function readGlyphs(font: ReadFont): GlyphSource {
  const upem = font.unitsPerEm;
  const cache = new Map<string, { advance: number; hull: GlyphPoint[] }>();
  const glyph = (ch: string) => {
    let g = cache.get(ch);
    if (!g) {
      const found = font.charToGlyph(ch);
      g = {
        advance: (found.advanceWidth ?? 0) / upem,
        hull: ch.trim() === "" ? [] : inkHull(found.getPath(0, 0, 1).commands),
      };
      cache.set(ch, g);
    }
    return g;
  };
  return {
    capHeight: (font.tables.os2?.sCapHeight ?? upem * 0.7) / upem,
    has: (ch) => font.charToGlyphIndex(ch) > 0,
    advance: (ch) => glyph(ch).advance,
    hull: (ch) => glyph(ch).hull,
  };
}

/** The typeface a label falls back to when its own is not to be had. */
export const DEFAULT_LABEL_FAMILY = "IBM Plex Sans";

const families = new Map<string, GlyphSource[]>();
let fallbacks: GlyphSource[] = [];
const fonts = new Map<string, LabelFont>();

const key = (family: string) => family.trim().toLowerCase();

/**
 * Adds a source of `family`'s letters - and of the same family under other
 * names given (Helvetica is set by Arial's table) - after those it has.
 */
export function registerGlyphs(
  family: string,
  source: GlyphSource,
  ...aliases: string[]
): void {
  for (const name of [family, ...aliases]) {
    const k = key(name);
    families.set(k, [...(families.get(k) ?? []), source]);
  }
  fonts.clear();
}

/** Where a character no typeface of a label's has comes from, in turn. */
export function addFallbackGlyphs(source: GlyphSource): void {
  fallbacks = [...fallbacks, source];
  fonts.clear();
}

/** Whether Meno has anything of `family`'s own letters. */
export function hasLabelFont(family: string): boolean {
  return families.has(key(family));
}

/**
 * `family`, letter by letter: its own sources first, then the fallbacks,
 * then the default typeface's; a character none of them has is taken as a
 * capital's box.
 */
export function labelFont(family: string | undefined): LabelFont {
  const name = family ?? DEFAULT_LABEL_FAMILY;
  const k = key(name);
  const cached = fonts.get(k);
  if (cached) return cached;
  const own = families.get(k) ?? [];
  const byDefault = families.get(key(DEFAULT_LABEL_FAMILY)) ?? [];
  const chain = own.length
    ? [...own, ...fallbacks]
    : [...byDefault, ...fallbacks];
  const first = own[0] ?? byDefault[0] ?? chain[0];
  if (!first) throw new Error("no label typeface registered");
  const pick = (ch: string) => chain.find((s) => s.has(ch)) ?? first;
  const font: LabelFont = {
    family: own.length ? name : DEFAULT_LABEL_FAMILY,
    capHeight: first.capHeight,
    has: (ch) => chain.some((s) => s.has(ch)),
    advance: (ch) => pick(ch).advance(ch),
    hull: (ch) => pick(ch).hull(ch),
  };
  fonts.set(k, font);
  return font;
}
