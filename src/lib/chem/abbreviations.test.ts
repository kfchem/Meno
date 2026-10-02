import { describe, expect, it } from "vitest";
import {
  ABBREVIATIONS,
  abbreviationOf,
  abbreviationStructure,
  labelRuns,
  labelUnits,
  reversedLabel,
} from "./abbreviations";
import { readSmiles } from "./smiles";

describe("SMILES, read", () => {
  it("reads branches, ring closures and aromatic bonds", () => {
    const benzoic = readSmiles("OC(=O)c1ccccc1");
    expect(benzoic.atoms.map((a) => a.el)).toEqual(["O", "C", "O", "C", "C", "C", "C", "C", "C"]);
    expect(benzoic.bonds.filter((b) => b.order === 2)).toHaveLength(1);
    // the ring's six bonds aromatic, its closure among them
    expect(benzoic.bonds.filter((b) => b.order === 4)).toHaveLength(6);
  });

  it("reads bracket atoms: element, hydrogens, charge, isotope", () => {
    const nitro = readSmiles("*[N+](=O)[O-]");
    expect(nitro.atoms).toEqual([{ el: "*" }, { el: "N", hs: 0, charge: 1 }, { el: "O" }, { el: "O", hs: 0, charge: -1 }]);
    expect(readSmiles("[13CH3]").atoms[0]).toEqual({ el: "C", isotope: 13, hs: 3 });
    expect(readSmiles("[Si](C)C").atoms[0]).toEqual({ el: "Si", hs: 0 });
  });

  it("says what it cannot read", () => {
    expect(() => readSmiles("C(C")).not.toThrow();
    expect(() => readSmiles("C1CC")).toThrow(/Unclosed ring/);
    expect(() => readSmiles("C?")).toThrow(/Cannot read/);
  });
});

describe("the abbreviations", () => {
  it("have IUPAC's Table II among them, marked as free to use", () => {
    const free = ABBREVIATIONS.filter((a) => a.free).map((a) => a.label);
    expect(free.sort()).toEqual(["Ac", "Bu", "Cp", "Et", "Me", "Ms", "Ph", "Pr", "Ts", "iBu", "iPr", "s-Bu", "t-Bu"].sort());
  });

  it("each read as a structure attached by one bond, every label once", () => {
    const seen = new Set<string>();
    for (const a of ABBREVIATIONS) {
      const read = readSmiles(a.smiles);
      expect(read.atoms[0].el, a.label).toBe("*");
      expect(read.bonds.filter((b) => b.a1 === 0 || b.a2 === 0), a.label).toHaveLength(1);
      expect(seen.has(a.label), a.label).toBe(false);
      seen.add(a.label);
    }
  });

  it("are found by any of their names", () => {
    expect(abbreviationOf("TBDMS")?.label).toBe("TBS");
    expect(abbreviationOf("OTBDMS")?.label).toBe("OTBS");
    expect(abbreviationOf("COOH")?.label).toBe("CO2H");
    expect(abbreviationOf("tBu")?.label).toBe("t-Bu");
    expect(abbreviationOf("XYZ")).toBeUndefined();
  });

  it("give the structure behind a label, attached by its first atom", () => {
    const otbs = abbreviationStructure("OTBS")!;
    expect(otbs.atoms.map((a) => a.el)).toEqual(["O", "Si", "C", "C", "C", "C", "C", "C"]);
    expect(otbs.attach).toBe(0);
    expect(otbs.bonds).toHaveLength(7);
    // a phenyl's ring in Kekulé form
    const ph = abbreviationStructure("Ph")!;
    expect(ph.bonds.map((b) => b.order).sort()).toEqual([1, 1, 1, 2, 2, 2]);
    const ester = abbreviationStructure("CO2Me")!;
    expect(ester.atoms.map((a) => a.el)).toEqual(["C", "O", "O", "C"]);
    expect(ester.bonds.find((b) => b.order === 2)).toBeTruthy();
  });
});

describe("a label, written", () => {
  it("reads into units, each with its count", () => {
    expect(labelUnits("CO2Me")).toEqual(["C", "O2", "Me"]);
    expect(labelUnits("NHBoc")).toEqual(["N", "H", "Boc"]);
    expect(labelUnits("CH(CH3)2")).toEqual(["C", "H", "(CH3)2"]);
    expect(labelUnits("OTBDPS")).toEqual(["O", "TBDPS"]);
    expect(labelUnits("SiMe3")).toEqual(["Si", "Me3"]);
  });

  it("reads outward from its bond when that comes in from the right (IUPAC GR-2.3)", () => {
    expect(reversedLabel("OTBS")).toBe("TBSO");
    expect(reversedLabel("CO2Me")).toBe("MeO2C");
    expect(reversedLabel("NHBoc")).toBe("BocHN");
    expect(reversedLabel("CF3")).toBe("F3C");
    expect(reversedLabel("CH(CH3)2")).toBe("(H3C)2HC");
    expect(reversedLabel("Bpin")).toBe("pinB");
    expect(reversedLabel("NO2")).toBe("O2N");
  });

  it("sets counts as subscripts and an ending charge as a superscript", () => {
    expect(labelRuns("CO2Me")).toEqual([{ text: "CO" }, { text: "2", sub: true }, { text: "Me" }]);
    expect(labelRuns("NMe3+")).toEqual([{ text: "NMe" }, { text: "3", sub: true }, { text: "+", sup: true }]);
    expect(labelRuns("MeO2C")).toEqual([{ text: "MeO" }, { text: "2", sub: true }, { text: "C" }]);
    expect(labelRuns("CH(CH3)2")).toEqual([
      { text: "CH(CH" },
      { text: "3", sub: true },
      { text: ")" },
      { text: "2", sub: true },
    ]);
  });
});
