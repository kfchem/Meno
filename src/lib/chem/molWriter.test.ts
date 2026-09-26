import { describe, expect, it } from "vitest";
import { writeMolfile, writeSdf, MOL_BOND_LENGTH, type WriterModel } from "./molWriter";
import { NOMINAL_BOND_LENGTH } from "./acs";
import {
  moleculesToEditorModel,
  readMoleculesFromText,
} from "../../utils/importers";

const L = NOMINAL_BOND_LENGTH;

// a stereocentre carrying a wedge, a hashed wedge and a wavy bond, a double
// bond, an O, and a wedge drawn the other way round (narrow at the end atom)
const model: WriterModel = {
  atoms: [
    { id: 10, x: 0, y: 0, el: "C" },
    { id: 11, x: L, y: 0, el: "C" },
    { id: 12, x: -L / 2, y: L * 0.866, el: "C" },
    { id: 13, x: -L / 2, y: -L * 0.866, el: "O" },
    { id: 14, x: 2 * L, y: 0, el: "C" },
    { id: 15, x: 2.5 * L, y: L * 0.866, el: "C" },
    { id: 16, x: 3 * L, y: 0, el: "C" },
  ],
  bonds: [
    { a: 10, b: 11, order: 1, stereo: "up" },
    { a: 10, b: 12, order: 1, stereo: "down" },
    { a: 10, b: 13, order: 1, stereo: "wavy" },
    { a: 11, b: 14, order: 2 },
    { a: 14, b: 15, order: 1, stereo: "up", stereoOrient: "reverse" },
    { a: 14, b: 16, order: 1 },
  ],
};

const reread = (text: string) =>
  moleculesToEditorModel(readMoleculesFromText(text, "mol")).model;

describe("writeMolfile", () => {
  it("writes a V2000 file with a line per atom and bond", () => {
    const mol = writeMolfile(model, { title: "test" });
    const lines = mol.split("\n");
    expect(lines[0]).toBe("test");
    expect(lines[3]).toMatch(/^  7  6  0  0  0  0  0  0  0  0999 V2000$/);
    expect(lines[4]).toMatch(/^ {4}0\.0000 {4}0\.0000 {4}0\.0000 C {3}0 {2}0/);
    expect(mol).toContain("M  END");
  });

  it("scales the nominal bond to 1.5 Å", () => {
    const lines = writeMolfile(model).split("\n");
    const x = Number(lines[5].slice(0, 10));
    expect(x).toBeCloseTo(MOL_BOND_LENGTH, 4);
  });

  it("puts each wedge's narrow end first, as the drawing has it", () => {
    const lines = writeMolfile(model).split("\n");
    const bond = (k: number) => lines[4 + 7 + k];
    // the stereocentre (atom 1) first, flag 1 for a wedge, 6 hashed, 4 wavy
    expect(bond(0)).toBe("  1  2  1  1  0  0  0");
    expect(bond(1)).toBe("  1  3  1  6  0  0  0");
    expect(bond(2)).toBe("  1  4  1  4  0  0  0");
    expect(bond(3)).toBe("  2  5  2  0  0  0  0");
    // drawn the other way round: its narrow end is atom 6, the end atom
    expect(bond(4)).toBe("  6  5  1  1  0  0  0");
  });

  it("reads back as the same drawing", () => {
    const back = reread(writeMolfile(model));
    expect(back.atoms.map((a) => a.el)).toEqual(model.atoms.map((a) => a.el));
    const byIndex = (m: { atoms: { id: number }[] }, id: number) =>
      m.atoms.findIndex((a) => a.id === id);
    const summary = (m: { atoms: { id: number }[]; bonds: any[] }) =>
      m.bonds.map((b) => ({
        pair: [byIndex(m, b.a), byIndex(m, b.b)].sort(),
        order: b.order,
        stereo: b.stereo ?? "none",
      }));
    expect(summary(back)).toEqual(summary(model));
    // and where the wedge was drawn the other way round, it still is
    const flipped = back.bonds.find((b) => b.stereo === "up" && b.order === 1 && byIndex(back, b.a) !== 0)!;
    const narrowFirst = byIndex(back, flipped.a);
    expect(narrowFirst).toBe(5);
    expect(flipped.stereoOrient).toBe("reverse");
    // the shape is kept too: the same bond lengths once scaled back
    const d = (m: any, i: number, j: number) =>
      Math.hypot(m.atoms[i].x - m.atoms[j].x, m.atoms[i].y - m.atoms[j].y);
    expect(d(back, 0, 1) / d(back, 1, 4)).toBeCloseTo(d(model, 0, 1) / d(model, 1, 4), 6);
  });

  it("switches to V3000 for a dative bond, which V2000 cannot carry", () => {
    const dative: WriterModel = {
      atoms: [
        { id: 1, x: 0, y: 0, el: "N" },
        { id: 2, x: L, y: 0, el: "B" },
      ],
      bonds: [{ a: 1, b: 2, order: 1, dative: true }],
    };
    const mol = writeMolfile(dative);
    expect(mol).toContain("V3000");
    expect(mol).toContain("M  V30 1 9 1 2");
    const back = reread(mol);
    expect(back.bonds[0].dative).toBe(true);
  });

  it("writes V3000 on request, with wedges as CFG", () => {
    const mol = writeMolfile(model, { version: "V3000" });
    expect(mol).toContain("M  V30 COUNTS 7 6 0 0 0");
    expect(mol).toContain("M  V30 1 1 1 2 CFG=1");
    expect(mol).toContain("M  V30 2 1 1 3 CFG=3");
    expect(mol).toContain("M  V30 3 1 1 4 CFG=2");
    const back = reread(mol);
    expect(back.bonds.map((b) => b.stereo)).toEqual(["up", "down", "wavy", "none", "up", "none"]);
  });

  it("closes an SD file record", () => {
    expect(writeSdf(model).endsWith("M  END\n$$$$\n")).toBe(true);
  });
});
