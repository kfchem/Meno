import { readFileSync } from "node:fs";
import { parse } from "opentype.js/dist/opentype.mjs";
import { describe, expect, it } from "vitest";
import {
  ACS_LABEL_SET,
  labelHulls,
  placeLabel,
  type TextItem,
} from "./layout2d";
import { ARIAL } from "./arial";
import { IBM_PLEX_SANS } from "./fonts/ibmPlexSans";
import {
  addFallbackGlyphs,
  advanceIn,
  hasLabelFont,
  inkHullIn,
  labelFont,
  readGlyphs,
  registerGlyphs,
  tableGlyphs,
} from "./labelFonts";

const cl: TextItem = {
  x: 0,
  y: 0,
  text: "Cl",
  fontPx: 10,
  runs: [{ text: "Cl" }],
  anchorRun: 0,
};

function read(path: string) {
  const b = readFileSync(new URL(path, import.meta.url));
  return parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}

describe("label typefaces", () => {
  it("knows Arial, Helvetica by Arial's widths, and IBM Plex Sans, whatever the case", () => {
    expect(labelFont("Arial").advance("N")).toBe(advanceIn(ARIAL, "N"));
    expect(labelFont("helvetica").advance("N")).toBe(advanceIn(ARIAL, "N"));
    expect(labelFont("IBM Plex Sans").advance("N")).toBe(
      advanceIn(IBM_PLEX_SANS, "N"),
    );
    expect(hasLabelFont("ibm plex sans")).toBe(true);
  });

  it("sets a typeface it has nothing of in IBM Plex Sans, as the canvas then draws it", () => {
    expect(hasLabelFont("Comic Sans MS")).toBe(false);
    const f = labelFont("Comic Sans MS");
    expect(f.family).toBe("IBM Plex Sans");
    expect(f.advance("N")).toBe(advanceIn(IBM_PLEX_SANS, "N"));
    expect(labelFont(undefined).family).toBe("IBM Plex Sans");
  });

  it("has an advance for every printable character and ink for all but the space", () => {
    for (const font of [ARIAL, IBM_PLEX_SANS]) {
      expect(font.advances).toHaveLength(95);
      for (let code = 0x21; code <= 0x7e; code++) {
        const ch = String.fromCharCode(code);
        expect(
          inkHullIn(font, ch).length,
          `${font.family} ${ch}`,
        ).toBeGreaterThanOrEqual(3);
      }
      expect(inkHullIn(font, " ")).toEqual([]);
    }
  });

  it("places and clears a label by its own typeface's letters", () => {
    const size = 10;
    const inArial = placeLabel(cl, size, ACS_LABEL_SET);
    const plex = { ...ACS_LABEL_SET, fontFamily: "IBM Plex Sans" };
    const inPlex = placeLabel(cl, size, plex);
    // the C centred on the atom, by each font's own C
    expect(inArial[0].x).toBeCloseTo((-advanceIn(ARIAL, "C") * size) / 2, 12);
    expect(inPlex[0].x).toBeCloseTo(
      (-advanceIn(IBM_PLEX_SANS, "C") * size) / 2,
      12,
    );
    expect(inPlex[0].x).not.toBeCloseTo(inArial[0].x, 6);
    // Plex's l has a tail: its ink reaches further right than Arial's l
    const right = (hulls: { x: number }[][]) =>
      Math.max(...hulls[1].map((p) => p.x));
    expect(right(labelHulls(cl, size, plex))).not.toBeCloseTo(
      right(labelHulls(cl, size, ACS_LABEL_SET)),
      3,
    );
  });
});

describe("a font read from its file", () => {
  const plexFile = readGlyphs(
    read("../../assets/fonts/IBMPlexSans-Regular.ttf"),
  );

  it("comes to what its table says, within the hull's tolerance", () => {
    const table = tableGlyphs(IBM_PLEX_SANS);
    for (const ch of "CNOSPFHClBrI2") {
      expect(plexFile.advance(ch)).toBeCloseTo(table.advance(ch), 3);
      const top = (h: { y: number }[]) => Math.max(...h.map((p) => p.y));
      const left = (h: { x: number }[]) => Math.min(...h.map((p) => p.x));
      expect(top(plexFile.hull(ch))).toBeCloseTo(top(table.hull(ch)), 2);
      expect(left(plexFile.hull(ch))).toBeCloseTo(left(table.hull(ch)), 2);
    }
    expect(plexFile.capHeight).toBeCloseTo(0.698, 3);
    expect(plexFile.has("α")).toBe(true);
    expect(plexFile.has("化")).toBe(false);
  });

  it("gives a typeface what its table has not, and Japanese from the fallback", () => {
    registerGlyphs("Test Sans", tableGlyphs(IBM_PLEX_SANS));
    const before = labelFont("Test Sans");
    // not in the table, and nothing else yet: a capital's box
    const box = before.hull("α");
    expect(box).toHaveLength(4);
    registerGlyphs("Test Sans", plexFile);
    const withFile = labelFont("Test Sans");
    expect(withFile.hull("α").length).toBeGreaterThan(4);
    // ASCII still by the table
    expect(withFile.advance("N")).toBe(advanceIn(IBM_PLEX_SANS, "N"));

    const jp = readGlyphs(read("../../assets/fonts/IBMPlexSansJP-Regular.ttf"));
    addFallbackGlyphs(jp);
    const f = labelFont("Test Sans");
    expect(f.advance("化")).toBeCloseTo(1, 6);
    const ink = f.hull("化");
    expect(Math.max(...ink.map((p) => p.y))).toBeGreaterThan(0.75);
    expect(Math.min(...ink.map((p) => p.y))).toBeLessThan(0);
  });
});
