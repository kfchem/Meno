// The little of opentype.js Meno uses - reading a font's letters for the
// labels - since the package has no types of its own. Its ES build is
// imported by path: the package's main entry is a UMD bundle.
declare module "opentype.js/dist/opentype.mjs" {
  import type { GlyphCommand } from "../lib/chem/glyphHull";
  export type Glyph = {
    index: number;
    advanceWidth?: number;
    getPath(x: number, y: number, fontSize: number): { commands: GlyphCommand[] };
  };
  export type Font = {
    unitsPerEm: number;
    tables: { os2?: { sCapHeight?: number; sxHeight?: number } };
    charToGlyph(ch: string): Glyph;
    charToGlyphIndex(ch: string): number;
  };
  /** `lowMemory` reads each letter when it is asked for rather than all at once. */
  export function parse(buffer: ArrayBuffer, options?: { lowMemory?: boolean }): Font;
}
