import { describe, expect, it } from "vitest";
import { picturedStructure } from "./abbreviationPlace";
import { abbreviationStructure } from "./abbreviations";
import { ligandPicture, namedLigand } from "./ligands";
import { contractGraph, contractionTrials, contractions, type ContractGraph } from "./contract";
import { kekuleOrders } from "./kekulize";
import { readSmiles } from "./smiles";

const fromSmiles = (smiles: string): ContractGraph => {
  const r = readSmiles(smiles);
  const orders = kekuleOrders(r.atoms, r.bonds);
  return contractGraph(r.atoms, r.bonds.map((b, i) => ({ ...b, order: orders[i] })));
};
const fromLabel = (label: string): ContractGraph => {
  const s = abbreviationStructure(label)!;
  return contractGraph(s.atoms, s.bonds);
};
/** The labels written, sorted. */
const written = (g: ContractGraph, keep?: Set<number>) => contractions(g, keep).map((c) => c.label).sort();

const TAXOL =
  "CC1=C2[C@H](C(=O)[C@@]3([C@H](C[C@@H]4[C@]([C@H]3[C@@H]([C@@](C2(C)C)(C[C@@H]1OC(=O)[C@@H]([C@H](C5=CC=CC=C5)NC(=O)C6=CC=CC=C6)O)O)OC(=O)C7=CC=CC=C7)(CO4)OC(=O)C)O)C)OC(=O)C";

describe("contractions", () => {
  it("writes a protecting group by name wherever it hangs, with the atom it hangs by", () => {
    expect(written(fromSmiles("CCO[Si](C)(C)C(C)(C)C"))).toEqual(["OTBS"]);
    expect(written(fromSmiles("CC(C)(C)OC(=O)NCC(=O)O"))).toEqual(["NHBoc"]);
    expect(written(fromSmiles("c1ccccc1B1OC(C)(C)C(C)(C)O1"))).toEqual(["Bpin"]);
    expect(written(fromSmiles("C#C[Si](C)(C)C"))).toEqual(["TMS"]);
    // on a carbon by a carbon, something else: a tert-butyl ester, a methoxymethyl
    expect(written(fromSmiles("c1ccccc1CCC(=O)OC(C)(C)C"))).toEqual([]);
    expect(written(fromSmiles("c1ccccc1CCCOC"))).toEqual([]);
  });

  it("draws the group's own reagent, the rest of it one atom or none", () => {
    for (const smiles of [
      "O[Si](C)(C)C(C)(C)C", // TBSOH
      "Cc1ccc(cc1)S(=O)(=O)Cl", // TsCl
      "CC(C)(C)OC(=O)OC(=O)OC(C)(C)C", // Boc2O
      "CC1(C)OB(OC1(C)C)B1OC(C)(C)C(C)(C)O1", // B2pin2
    ]) {
      expect(written(fromSmiles(smiles)), smiles).toEqual([]);
    }
  });

  it("writes other named groups on a heteroatom by name only where they are a small part of the molecule", () => {
    // aspirin's acetyl is a quarter of it; taxol's are not a tenth
    expect(written(fromSmiles("CC(=O)Oc1ccccc1C(=O)O"))).toEqual([]);
    expect(written(fromSmiles("CC(=O)Nc1ccc(O)cc1"))).toEqual([]);
    expect(written(fromSmiles(TAXOL))).toEqual(["NHBz", "OAc", "OAc", "OBz"]);
    // methyl and ethyl, drawn always
    expect(written(fromSmiles("CCN(CC)CC"))).toEqual([]);
    expect(written(fromSmiles("C1CCC(CC1)N=C=NC1CCCCC1"))).toEqual([]);
  });

  it("writes a complex's phosphines as chemists write them, a pi system bound to its metal not a group", () => {
    expect(written(fromLabel("Pd(PPh3)4"))).toEqual(["PPh3", "PPh3", "PPh3", "PPh3"]);
    expect(written(fromLabel("Grubbs I"))).toEqual(["PCy3", "PCy3"]);
    expect(written(fromLabel("(R)-BINAP"))).toEqual(["PPh2", "PPh2"]);
    expect(written(fromLabel("dppf"))).toEqual([]);
  });

  it("leaves drawn what it is told to keep, and a kept atom out of its group's label", () => {
    const g = fromSmiles("CCO[Si](C)(C)C(C)(C)C");
    expect(written(g, new Set([3]))).toEqual([]);
    expect(written(g, new Set([2]))).toEqual(["TBS"]);
  });
});

describe("contractionTrials", () => {
  it("tries more groups by name, the largest first, only while each try hides less", () => {
    // a phenyl and two benzyls on carbon: nothing by the rules
    const g = fromSmiles("C(c1ccccc1)(Cc1ccccc1)Cc1ccccc1");
    const trials = contractionTrials(g);
    expect(trials.next().value).toEqual([]);
    const more = trials.next(3);
    expect((more.value as { label: string }[]).map((c) => c.label)).toEqual(["Bn", "Bn"]);
    // hiding no less: no more tries
    expect(trials.next(3).done).toBe(true);
  });

  it("tries nothing more where nothing is hidden", () => {
    const trials = contractionTrials(fromSmiles("CCO[Si](C)(C)C(C)(C)C"));
    trials.next();
    expect(trials.next(0).done).toBe(true);
  });
});

describe("a label of an atom and its groups", () => {
  it("reads PPh2 and PCy2 as phosphorus with the groups that fill its valence", () => {
    const heavy = (label: string) => abbreviationStructure(label)?.atoms.filter((a) => a.el !== "H" && a.el !== "*").length;
    expect(heavy("PPh2")).toBe(13);
    expect(heavy("PCy2")).toBe(13);
    expect(heavy("NBn2")).toBe(15);
    // three on P is the ligand, bound by its lone pair
    expect(abbreviationStructure("PPh3")?.attach).toEqual([0]);
  });
});

describe("the dictionary's pictures", () => {
  const labelsIn = (label: string) =>
    picturedStructure(abbreviationStructure(label)!, 1)
      .atoms.map((a) => a.el)
      .filter((el) => !/^[A-Z][a-z]?$/.test(el) && el !== "*")
      .sort();

  it("write a complex's groups by name, as Clean-up does", () => {
    expect(labelsIn("Pd(PPh3)4")).toEqual(["PPh3", "PPh3", "PPh3", "PPh3"]);
    expect(labelsIn("Grubbs I")).toEqual(["PCy3", "PCy3"]);
  });

  it("draw a group's own reagent, and a ligand - its own picture - out", () => {
    expect(labelsIn("TsCl")).toEqual([]);
    expect(labelsIn("PPh3")).toEqual([]);
    expect(labelsIn("(R)-BINAP")).toEqual([]);
    const binap = namedLigand("(R)-BINAP")!;
    expect(
      picturedStructure(ligandPicture(binap.ligand), 1)
        .atoms.map((a) => a.el)
        .filter((el) => el === "Ph" || el === "PPh2"),
    ).toEqual([]);
  });
});
