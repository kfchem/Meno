import { describe, expect, it } from "vitest";
import { colorRef, emfComments, emfRecords, layoutEmf } from "./emf";
import { drawingLayout } from "../../ui/features/StructureEditor/fileActions";
import { ACS_1996 } from "./style";
import { NOMINAL_BOND_LENGTH } from "./acs";
import type { Model } from "../../ui/features/StructureEditor/store/types";

const L = NOMINAL_BOND_LENGTH;
// an ethanol: two lines, a wedge, and an OH label
const model: Model = {
  atoms: [
    { id: 1, x: 0, y: 0, r: 0.9, el: "C" },
    { id: 2, x: L * 0.866, y: L / 2, r: 0.9, el: "C" },
    { id: 3, x: L * 1.732, y: 0, r: 0.9, el: "O" },
  ],
  bonds: [
    { id: 4, a: 2, b: 1, order: 1, stereo: "up" },
    { id: 5, a: 2, b: 3, order: 1, stereo: "none" },
  ],
};
const aromatic = { aromaticEnabled: false, aromaticRings: {} };

describe("layoutEmf", () => {
  const { layout, opts } = drawingLayout(model, aromatic, ACS_1996);
  const carried = new TextEncoder().encode("MENO{}");
  const { emf, widthPt, heightPt } = layoutEmf(layout, opts, carried);
  const records = emfRecords(emf)!;
  const types = records.map((r) => r.type);

  it("is an EMF whose every record is a whole number of words, as the header counts them", () => {
    expect(records).not.toBeNull();
    const v = new DataView(emf.buffer);
    expect(v.getUint32(48, true)).toBe(emf.length);
    expect(v.getUint32(52, true)).toBe(records.length);
    expect(emf.length % 4).toBe(0);
    expect(types[0]).toBe(1);
    expect(types[types.length - 1]).toBe(14);
  });

  it("is the style's own size: a bond of 14.4 pt", () => {
    const bondsAcross = 1.732 + 2 * opts.paddingPx / layout.zoom / L;
    expect(widthPt).toBeGreaterThan(14.4 * 1.732);
    expect(widthPt).toBeLessThan(14.4 * bondsAcross + 20);
    expect(heightPt).toBeGreaterThan(0);
    // the frame, in hundredths of a millimetre, says the same
    const frame = new DataView(emf.buffer).getInt32(32, true);
    expect(frame).toBe(Math.round((widthPt / 72) * 2540));
  });

  it("carries what it is given in a comment, and draws lines, the wedge and the label", () => {
    expect(emfComments(emf).map((c) => new TextDecoder().decode(c))).toEqual(["MENO{}"]);
    expect(types).toContain(4); // polyline
    expect(types).toContain(3); // polygon: the wedge
    // the label, run by run (the O on its atom, the H after it)
    const s = records
      .filter((r) => r.type === 84)
      .map((text) => {
        const v = new DataView(text.body.buffer, text.body.byteOffset, text.body.byteLength);
        const chars = v.getUint32(36, true);
        const at = v.getUint32(40, true) - 8;
        return String.fromCharCode(...Array.from({ length: chars }, (_, i) => v.getUint16(at + 2 * i, true)));
      })
      .join("");
    expect(s).toBe("OH");
    // the font it is set in is the style's
    const font = records.find((r) => r.type === 82)!;
    const face = String.fromCharCode(...new Uint16Array(font.body.slice(32, 32 + 10).buffer));
    expect(face).toBe("Arial");
  });

  it("reads no records out of what is not an EMF", () => {
    expect(emfRecords(new Uint8Array(100))).toBeNull();
    expect(emfComments(new Uint8Array(4))).toEqual([]);
  });
});

describe("colorRef", () => {
  it("turns a CSS colour into Windows' blue-green-red", () => {
    expect(colorRef("black")).toBe(0);
    expect(colorRef("#336699")).toBe(0x996633);
    expect(colorRef("#f00")).toBe(0x0000ff);
    expect(colorRef("rgb(1, 2, 3)")).toBe(0x030201);
    expect(colorRef(undefined)).toBe(0);
  });
});
