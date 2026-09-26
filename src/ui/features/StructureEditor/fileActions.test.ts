import { describe, expect, it } from "vitest";
import { drawingSvg, EXPORT_PX_PER_WORLD, structureFileText } from "./fileActions";
import { NOMINAL_BOND_LENGTH } from "../../../lib/chem/acs";
import type { Model } from "./store/types";

const L = NOMINAL_BOND_LENGTH;
const model: Model = {
  atoms: [
    { id: 1, x: 0, y: 0, r: 0.9, el: "C" },
    { id: 2, x: L, y: 0, r: 0.9, el: "O" },
  ],
  bonds: [{ id: 3, a: 1, b: 2, order: 1, stereo: "none" }],
};

describe("structureFileText", () => {
  it("writes an SD file for .sdf and a MOL file otherwise, titled with the file's name", () => {
    const sdf = structureFileText(model, "/tmp/ethanol.sdf");
    expect(sdf.startsWith("ethanol\n")).toBe(true);
    expect(sdf.endsWith("$$$$\n")).toBe(true);
    const mol = structureFileText(model, "C:\\work\\methanol.MOL");
    expect(mol.startsWith("methanol\n")).toBe(true);
    expect(mol.endsWith("M  END\n")).toBe(true);
  });
});

describe("drawingSvg", () => {
  const svg = drawingSvg(model, { aromaticEnabled: false, aromaticRings: {} });

  it("comes out at ACS 1996's own size: 14.4 pt to the bond at 96 px to the inch", () => {
    expect(EXPORT_PX_PER_WORLD * L).toBeCloseTo((14.4 * 96) / 72, 9);
    const width = Number(/width="([\d.e]+)"/.exec(svg)![1]);
    const box = /viewBox="([-\d.e ]+)"/.exec(svg)![1].split(" ").map(Number);
    expect(width).toBeCloseTo(box[2] * EXPORT_PX_PER_WORLD, 6);
  });

  it("keeps a line its true width, however thin that is in pixels", () => {
    const w = Number(/stroke-width="([\d.e]+)"/.exec(svg)![1]);
    // 0.6 pt of a 14.4 pt bond, in the drawing's own units
    expect(w).toBeCloseTo((0.6 / 14.4) * L, 9);
  });

  it("writes the label in Arial", () => {
    expect(svg).toContain('font-family="Arial');
    // run by run: the symbol, then its hydrogen
    expect(svg).toContain(">O</text>");
    expect(svg).toContain(">H</text>");
  });
});
