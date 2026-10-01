import { describe, expect, it } from "vitest";
import {
  ABBREVIATIONS,
  abbreviationOf,
  abbreviationStructure,
  labelRuns,
  labelUnits,
  namesRingFirst,
  reversedLabel,
} from "./abbreviations";
import { substitutedAryl } from "./substitutedAryl";
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
    expect(abbreviationOf("p-Ts")?.label).toBe("Ts");
    expect(abbreviationOf("C6H5")?.label).toBe("Ph");
    expect(abbreviationOf("XYZ")).toBeUndefined();
  });

  it("put together by rule: a group behind O, S or NH, and an ester", () => {
    expect(abbreviationOf("OTBS")?.smiles).toBe("*O[Si](C)(C)C(C)(C)C");
    expect(abbreviationOf("NHBoc")?.name).toBe("tert-butoxycarbonylamino");
    // named as such groups are
    expect(["OMe", "OEt", "Ot-Bu", "OiPr", "OPh", "OBn", "OTMS", "OMs", "CO2Me", "SMe"].map((l) => abbreviationOf(l)?.name)).toEqual([
      "methoxy",
      "ethoxy",
      "tert-butoxy",
      "isopropoxy",
      "phenoxy",
      "benzyloxy",
      "trimethylsilyloxy",
      "methanesulfonyloxy",
      "methoxycarbonyl",
      "methylsulfanyl",
    ]);
    expect(abbreviationOf("SPh")?.smiles).toBe("*Sc1ccccc1");
    expect(abbreviationOf("CO2t-Bu")?.smiles).toBe("*C(=O)OC(C)(C)C");
    // a contracted label behind O: trifluoromethoxy, cyanate
    expect(abbreviationOf("OCF3")?.smiles).toBe("*OC(F)(F)F");
    // as written, however rarely: an S-Boc
    expect(abbreviationOf("SBoc")?.smiles).toBe("*SC(=O)OC(C)(C)C");
    // but Cp only on a metal (IUPAC's Table II), and no ester of a contracted label
    for (const no of ["OCp", "SCp", "NHCp", "CO2Cp", "CO2CF3", "OO", "NHNHNH2"]) expect(abbreviationOf(no), no).toBeUndefined();
    // none is listed
    expect(ABBREVIATIONS.some((a) => a.label === "OTBS")).toBe(false);
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

describe("substituted aryl groups", () => {
  it("read positions, a multiplying prefix and the substituent before the group", () => {
    expect(substitutedAryl("2,6-diMeBz")).toEqual({ smiles: "*C(=O)c1c(C)cccc1(C)", name: "2,6-dimethylbenzoyl" });
    expect(substitutedAryl("4-MeOPh")).toEqual({ smiles: "*c1ccc(OC)cc1", name: "4-methoxyphenyl" });
    expect(substitutedAryl("p-ClBn")).toEqual({ smiles: "*Cc1ccc(Cl)cc1", name: "4-chlorobenzyl" });
    expect(substitutedAryl("4-MeO-3-NO2Ph")?.name).toBe("4-methoxy-3-nitrophenyl");
    expect(substitutedAryl("3,5-(CF3)2Ph")?.name).toBe("3,5-ditrifluoromethylphenyl");
  });

  it("read the ring as a formula, its substituents with their counts before it", () => {
    expect(substitutedAryl("4-MeOC6H4")?.smiles).toBe(substitutedAryl("4-MeOPh")?.smiles);
    expect(substitutedAryl("2,6-Me2C6H3")?.smiles).toBe("*c1c(C)cccc1(C)");
    expect(substitutedAryl("3,5-(CF3)2C6H3")?.smiles).toBe("*c1cc(C(F)(F)F)cc(C(F)(F)F)c1");
    expect(substitutedAryl("2,4,6-iPr3C6H2")?.name).toBe("2,4,6-triisopropylphenyl");
  });

  it("are none where the positions, counts or hydrogens do not add up", () => {
    for (const no of ["7-MePh", "2,2-diMePh", "2,6-MePh", "2-diMePh", "4-MeOC6H5", "2,6-Me2C6H4", "4-XyzPh", "MeOC6H4", "Ph", "4-Me"]) {
      expect(substitutedAryl(no), no).toBeNull();
    }
  });

  it("are abbreviations, drawn and written out as any other", () => {
    const s = abbreviationStructure("2,6-diMeBz")!;
    expect(s.atoms.map((a) => a.el).join("")).toBe("COCCCCCCCC");
    expect(s.attach).toBe(0);
    expect(s.bonds.filter((b) => b.order === 2)).toHaveLength(4);
    expect(namesRingFirst("2,6-diMeBz")).toBe(true);
    expect(namesRingFirst("OTBS")).toBe(false);
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

  it("sets s-, t-, o-, m- and p- in italics, as IUPAC's Table II prefers, and iPr upright", () => {
    expect(labelRuns("t-Bu")).toEqual([{ text: "t", italic: true }, { text: "-Bu" }]);
    expect(labelRuns("s-Bu")).toEqual([{ text: "s", italic: true }, { text: "-Bu" }]);
    expect(labelRuns("iPr")).toEqual([{ text: "iPr" }]);
    expect(labelRuns("p-Ts")).toEqual([{ text: "p", italic: true }, { text: "-Ts" }]);
    expect(labelRuns("p-ClBn")).toEqual([{ text: "p", italic: true }, { text: "-ClBn" }]);
    expect(labelRuns("CO2t-Bu")).toEqual([{ text: "CO" }, { text: "2", sub: true }, { text: "t", italic: true }, { text: "-Bu" }]);
    // a ring's positions are no counts
    expect(labelRuns("2,6-Me2C6H3")).toEqual([
      { text: "2,6-Me" },
      { text: "2", sub: true },
      { text: "C" },
      { text: "6", sub: true },
      { text: "H" },
      { text: "3", sub: true },
    ]);
  });
});
