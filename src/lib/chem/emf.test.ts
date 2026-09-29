import { describe, expect, it } from "vitest";
import { colorRef, emfComments, emfPlusRecords, emfRecords, layoutEmf } from "./emf";
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

  it("draws it all again in EMF+, smooth, for Office: the same shapes in the same places", () => {
    const plus = emfPlusRecords(emf);
    const count = (t: number) => plus.filter((r) => r.type === t).length;
    const gdi = (t: number) => types.filter((x) => x === t).length;
    // EMF+'s header right after the file's, saying there are two drawings; its end last
    const second = new DataView(records[1].body.buffer, records[1].body.byteOffset);
    expect(records[1].type).toBe(70);
    expect(second.getUint32(4, true)).toBe(0x2b464d45); // "EMF+"
    expect(plus[0].type).toBe(0x4001);
    expect(plus[0].flags & 1).toBe(1);
    expect(plus[plus.length - 1].type).toBe(0x4002);
    expect(types[types.length - 2]).toBe(70);
    // smooth lines and letters
    expect(plus.find((r) => r.type === 0x401e)!.flags & 1).toBe(1);
    expect(plus.find((r) => r.type === 0x401f)!.flags).toBe(4);
    // a record for each of GDI's
    expect(count(0x400d)).toBe(gdi(4));
    expect(count(0x400c)).toBe(gdi(3));
    expect(count(0x400e) + count(0x400f)).toBe(gdi(42));
    // where GDI draws a line, in pixels
    const line = records.find((r) => r.type === 4)!;
    const lv = new DataView(line.body.buffer, line.body.byteOffset, line.body.byteLength);
    const drawn = plus.find((r) => r.type === 0x400d)!.data;
    expect(drawn.getUint32(0, true)).toBe(2);
    expect(drawn.getFloat32(4, true)).toBeCloseTo(lv.getInt32(20, true) / 20, 4);
    expect(drawn.getFloat32(8, true)).toBeCloseTo(lv.getInt32(24, true) / 20, 4);
    expect(drawn.getFloat32(12, true)).toBeCloseTo(lv.getInt32(28, true) / 20, 4);
    // the label, letter by letter, in the style's typeface
    const text = plus
      .filter((r) => r.type === 0x4036)
      .map((r) => {
        const n = r.data.getUint32(12, true);
        return String.fromCharCode(...Array.from({ length: n }, (_, i) => r.data.getUint16(16 + 2 * i, true)));
      })
      .join("");
    expect(text).toBe("OH");
    const font = plus.find((r) => r.type === 0x4008 && ((r.flags >> 8) & 0x7f) === 6)!.data;
    const face = Array.from({ length: font.getUint32(20, true) }, (_, i) => font.getUint16(24 + 2 * i, true));
    expect(String.fromCharCode(...face)).toBe("Arial");
  });

  it("draws each line with a pen of its own width, however many widths there are", () => {
    // more widths than EMF+ has slots for pens
    const lines = Array.from({ length: 70 }, (_, i) => ({ x1: 0, y1: i, x2: 10, y2: i, widthPx: 1 + i / 10 }));
    const many = { ...layout, lines, polys: [], texts: [], circles: [], fills: [] };
    const plus = emfPlusRecords(layoutEmf(many, opts).emf);
    const pens = new Map<number, number>();
    const widths: number[] = [];
    for (const r of plus) {
      if (r.type === 0x4008 && ((r.flags >> 8) & 0x7f) === 2) pens.set(r.flags & 0xff, r.data.getFloat32(16, true));
      if (r.type === 0x400d) widths.push(pens.get(r.flags & 0xff)!);
    }
    expect(Math.max(...pens.keys())).toBeLessThan(64);
    expect(widths).toHaveLength(70);
    widths.forEach((width, i) => expect(width).toBeCloseTo(Math.round(lines[i].widthPx * 20) / 20, 4));
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
