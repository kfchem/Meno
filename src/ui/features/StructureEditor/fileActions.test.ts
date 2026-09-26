import { describe, expect, it } from "vitest";
import { drawingSvg, exportPxPerWorld, structureFileText } from "./fileActions";
import { NOMINAL_BOND_LENGTH } from "../../../lib/chem/acs";
import { ACS_1996, RSC } from "../../../lib/chem/style";
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
  const aromatic = { aromaticEnabled: false, aromaticRings: {} };
  const svg = drawingSvg(model, aromatic, ACS_1996);

  it("comes out at the style's own size: 14.4 pt to the bond at 96 px to the inch in ACS 1996", () => {
    const scale = exportPxPerWorld(ACS_1996);
    expect(scale * L).toBeCloseTo((14.4 * 96) / 72, 9);
    const width = Number(/width="([\d.e]+)"/.exec(svg)![1]);
    const box = /viewBox="([-\d.e ]+)"/.exec(svg)![1].split(" ").map(Number);
    expect(width).toBeCloseTo(box[2] * scale, 6);
    // RSC's bonds are 12.2 pt
    expect(exportPxPerWorld(RSC) * L).toBeCloseTo((12.2 * 96) / 72, 9);
  });

  it("draws in the style it is given", () => {
    const rsc = drawingSvg(model, aromatic, { ...RSC, bondColor: "#336699" });
    expect(rsc).toContain('font-family="Helvetica');
    expect(rsc).toContain('stroke="#336699"');
    const w = Number(/stroke-width="([\d.e]+)"/.exec(rsc)![1]);
    expect(w).toBeCloseTo((0.45 / 12.2) * L, 9);
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
