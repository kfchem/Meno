import { describe, expect, it } from "vitest";
import { ACS_LABEL_SET, labelHulls, placeLabel, type TextItem } from "./layout2d";
import { ARIAL } from "./arial";
import { IBM_PLEX_SANS } from "./fonts/ibmPlexSans";
import { advanceIn, hasLabelFont, inkHullIn, labelFontMetrics } from "./labelFonts";

const cl: TextItem = {
  x: 0,
  y: 0,
  text: "Cl",
  fontPx: 10,
  runs: [{ text: "Cl" }],
  anchorRun: 0,
};

describe("label typefaces", () => {
  it("knows Arial, Helvetica by Arial's widths, and IBM Plex Sans, whatever the case", () => {
    expect(labelFontMetrics("Arial")).toBe(ARIAL);
    expect(labelFontMetrics("helvetica")).toBe(ARIAL);
    expect(labelFontMetrics("IBM Plex Sans")).toBe(IBM_PLEX_SANS);
    expect(hasLabelFont("ibm plex sans")).toBe(true);
    // one it does not know is set by Arial's
    expect(hasLabelFont("Comic Sans MS")).toBe(false);
    expect(labelFontMetrics("Comic Sans MS")).toBe(ARIAL);
    expect(labelFontMetrics(undefined)).toBe(ARIAL);
  });

  it("has an advance for every printable character and ink for all but the space", () => {
    for (const font of [ARIAL, IBM_PLEX_SANS]) {
      expect(font.advances).toHaveLength(95);
      for (let code = 0x21; code <= 0x7e; code++) {
        const ch = String.fromCharCode(code);
        expect(inkHullIn(font, ch).length, `${font.family} ${ch}`).toBeGreaterThanOrEqual(3);
      }
      expect(inkHullIn(font, " ")).toEqual([]);
    }
  });

  it("takes a character outside the table as a capital's box", () => {
    const h = inkHullIn(IBM_PLEX_SANS, "α");
    expect(Math.max(...h.map((p) => p.y))).toBeCloseTo(IBM_PLEX_SANS.capHeight / 1000, 9);
    expect(advanceIn(IBM_PLEX_SANS, "α")).toBe(advanceIn(IBM_PLEX_SANS, "H"));
  });

  it("places and clears a label by its own typeface's letters", () => {
    const size = 10;
    const inArial = placeLabel(cl, size, ACS_LABEL_SET);
    const plex = { ...ACS_LABEL_SET, fontFamily: "IBM Plex Sans" };
    const inPlex = placeLabel(cl, size, plex);
    // the C centred on the atom, by each font's own C
    expect(inArial[0].x).toBeCloseTo((-advanceIn(ARIAL, "C") * size) / 2, 12);
    expect(inPlex[0].x).toBeCloseTo((-advanceIn(IBM_PLEX_SANS, "C") * size) / 2, 12);
    expect(inPlex[0].x).not.toBeCloseTo(inArial[0].x, 6);
    // Plex's l has a tail: its ink reaches further right than Arial's l
    const right = (hulls: { x: number }[][]) => Math.max(...hulls[1].map((p) => p.x));
    expect(right(labelHulls(cl, size, plex))).not.toBeCloseTo(
      right(labelHulls(cl, size, ACS_LABEL_SET)),
      3,
    );
  });
});
