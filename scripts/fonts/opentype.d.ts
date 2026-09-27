// The little of opentype.js the metrics tool uses; the package has no types.
declare module "opentype.js/dist/opentype.mjs" {
  export type PathCommand =
    | { type: "M" | "L"; x: number; y: number }
    | { type: "Q"; x1: number; y1: number; x: number; y: number }
    | { type: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
    | { type: "Z" };
  export type Glyph = {
    advanceWidth?: number;
    getPath(x: number, y: number, fontSize: number): { commands: PathCommand[] };
  };
  export type Font = {
    unitsPerEm: number;
    tables: { os2?: { sCapHeight?: number; sxHeight?: number } };
    charToGlyph(ch: string): Glyph;
  };
  export function parse(buffer: ArrayBuffer): Font;
}
