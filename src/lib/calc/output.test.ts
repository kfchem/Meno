import { describe, expect, it } from "vitest";
import { calcLine, calcOf, multiplicityName, readCalc, xyzOf, type ReaderOutput } from "./output";
import { whoReads, checked } from "./read";
import { OUTPUT_KINDS, READER_PLUGINS } from "./catalog";

// water, as a reader hands back an optimisation of it: written by hand,
// in Meno's own form - no program's output is in the repository
const water: ReaderOutput = {
  program: "ORCA",
  version: "6.0.1",
  method: "B3LYP",
  basis: "def2-SVP",
  charge: 0,
  multiplicity: 1,
  atoms: ["O", "H", "H"],
  frames: [
    [0, 0, 0.1, 0, 0.8, -0.5, 0, -0.8, -0.5],
    [0, 0, 0.12, 0, 0.76, -0.47, 0, -0.76, -0.47],
  ],
  energies: [-76.31, -76.32],
  optimised: true,
  vibrations: [
    { frequency: 1650.2, displacements: [0, 0, 0.07, 0, -0.43, -0.56, 0, 0.43, -0.56] },
    { frequency: -120.5, displacements: null },
  ],
  charges: { mulliken: [-0.4, 0.2, 0.2], lowdin: [-0.3, 0.15, 0.15], broken: [1, 2] },
};

describe("what a reader hands back", () => {
  it("is written as an XYZ file's frames, for Meno to read as it reads any", () => {
    const xyz = xyzOf(water).split("\n");
    expect(xyz.slice(0, 5)).toEqual(["3", "frame 1", "O 0 0 0.1", "H 0 0.8 -0.5", "H 0 -0.8 -0.5"]);
    expect(xyz).toHaveLength(10);
  });

  it("is kept on the molecule as what the calculation was, its vibrations and its atoms' charges", () => {
    const c = calcOf(water, "cclib 1.9rc1");
    expect(c).toMatchObject({ reader: "cclib 1.9rc1", program: "ORCA", version: "6.0.1", method: "B3LYP", basis: "def2-SVP", charge: 0, multiplicity: 1, optimised: true });
    expect(c.vibrations).toEqual([
      { frequency: 1650.2, displacements: water.vibrations![0].displacements },
      { frequency: -120.5 },
    ]);
    // (a scheme that does not give every atom one is left out)
    expect(Object.keys(c.charges!)).toEqual(["mulliken", "lowdin"]);
  });

  it("leaves out what the output does not say", () => {
    const c = calcOf({ atoms: ["H", "H"], frames: [[0, 0, 0, 0, 0, 0.74]], program: "xTB", method: "  ", charge: null }, "cclib 1.9rc1");
    expect(c).toEqual({ reader: "cclib 1.9rc1", program: "xTB" });
  });

  it("reads back from a file as it was kept, and not where it does not read", () => {
    const kept = calcOf(water, "cclib 1.9rc1");
    expect(readCalc(JSON.parse(JSON.stringify(kept)), 3)).toEqual(kept);
    expect(readCalc({ program: "ORCA" }, 3)).toBeUndefined();
    expect(readCalc("ORCA", 3)).toBeUndefined();
    // (charges for another molecule's atoms are not this one's)
    expect(readCalc(kept, 4)?.charges).toBeUndefined();
  });

  it("is said in a line: program, method and basis, charge and multiplicity", () => {
    expect(calcLine(calcOf(water, "cclib"))).toBe("ORCA 6.0.1 · B3LYP/def2-SVP · charge 0, singlet");
    expect(calcLine({ reader: "cclib", program: "xTB", method: "GFN2-xTB", charge: -1, multiplicity: 2 })).toBe("xTB · GFN2-xTB · charge -1, doublet");
    expect(calcLine({ reader: "cclib", charge: 2 })).toBe("charge +2");
    expect(multiplicityName(7)).toBe("multiplicity 7");
  });
});

describe("reading an output", () => {
  const orca = OUTPUT_KINDS.find((k) => k.id === "orca")!;

  it("is the chosen reader's, or the first added's", () => {
    expect(whoReads(orca, "job.out", new Set(["cclib"]), {})).toBe(READER_PLUGINS[0]);
  });

  it("says which reader to add, where none that reads it is", () => {
    const why = whoReads(orca, "job.out", new Set(), {});
    expect(why).toBeInstanceOf(Error);
    expect((why as Error).message).toBe("To read job.out (ORCA output), add cclib in Settings, Calculation readers.");
  });

  it("says so where the output holds no geometry, as an xTB single point's does not", () => {
    const xtb = OUTPUT_KINDS.find((k) => k.id === "xtb")!;
    expect(() => checked({ atoms: ["O", "H", "H"], frames: [] }, xtb, "sp.out")).toThrow(/holds no geometry/);
    expect(checked(water, orca, "job.out")).toBe(water);
  });
});
