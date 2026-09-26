import { describe, expect, it } from "vitest";
import {
  detectFormat,
  parseRXNGroups,
  readMoleculesFromText,
  buildEditorModelFromRXN,
  moleculesToEditorModel,
} from "./importers";
import sampleSdf from "../assets/KEF20633.sdf?raw";
import sampleRxn from "../assets/KEF20633.rxn?raw";
import sampleRxn2 from "../assets/KEF96002.rxn?raw";
import sampleXyz from "../assets/KEF20633_b_296.xyz?raw";

// Ethane (CH3-CH3) as a V2000 molfile. The title line is a bare number, as in
// PubChem SDF downloads where it holds the compound id.
const numericTitleMol = [
  "6324",
  "  -OEChem-09162612002D",
  "",
  "  2  1  0     0  0  0  0  0  0999 V2000",
  "    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
  "    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
  "  1  2  1  0  0  0  0",
  "M  END",
].join("\n");

describe("detectFormat", () => {
  it("detects the bundled samples", () => {
    expect(detectFormat("KEF20633.sdf", sampleSdf)).toBe("sdf");
    expect(detectFormat("KEF20633.rxn", sampleRxn)).toBe("rxn");
    expect(detectFormat("KEF20633_b_296.xyz", sampleXyz)).toBe("xyz");
  });

  it("does not mistake a MOL/SDF with a numeric title for XYZ", () => {
    expect(detectFormat("6324.sdf", numericTitleMol)).toBe("sdf");
    expect(detectFormat("6324.mol", numericTitleMol)).toBe("mol");
    expect(detectFormat("", numericTitleMol)).toBe("mol");
    expect(detectFormat("download.txt", numericTitleMol + "\n$$$$\n")).toBe(
      "mol"
    );
  });

  it("recognises XYZ by content when the extension is unknown", () => {
    expect(detectFormat("frame.txt", sampleXyz)).toBe("xyz");
    expect(detectFormat("", "1\ncomment\n6 0.0 0.0 0.0")).toBe("xyz");
    expect(detectFormat("", "0\nempty frame")).toBe("xyz");
  });

  it("does not treat arbitrary text starting with a number as XYZ", () => {
    expect(detectFormat("notes.txt", "42\nthe answer\nis not a molecule")).toBe(
      null
    );
  });

  it("trusts the .xyz extension", () => {
    expect(detectFormat("x.xyz", "2\n\nC 0 0 0\nC 1.5 0 0")).toBe("xyz");
  });
});

describe("readMoleculesFromText", () => {
  it("parses a numeric-title molfile as a molfile", () => {
    const fmt = detectFormat("6324.sdf", numericTitleMol);
    const mols = readMoleculesFromText(numericTitleMol, fmt);
    expect(mols).toHaveLength(1);
    expect(mols[0].atoms.map((a) => a.element)).toEqual(["C", "C"]);
    expect(mols[0].bonds).toEqual([
      { a1: 0, a2: 1, order: 1, stereoCode: 0 },
    ]);
  });

  it("parses the bundled SDF sample", () => {
    const mols = readMoleculesFromText(sampleSdf, "sdf");
    expect(mols).toHaveLength(1);
    expect(mols[0].atoms).toHaveLength(38);
    expect(mols[0].bonds).toHaveLength(42);
  });
});

describe("parseRXNGroups", () => {
  it("splits the bundled RXN samples by their counts line", () => {
    const g1 = parseRXNGroups(sampleRxn);
    expect([g1.reactants.length, g1.products.length, g1.agents.length]).toEqual(
      [1, 4, 0]
    );
    const g2 = parseRXNGroups(sampleRxn2);
    expect([g2.reactants.length, g2.products.length, g2.agents.length]).toEqual(
      [1, 2, 0]
    );
  });

  it("reads counts from line 5 even if the reaction name contains numbers", () => {
    const mol = numericTitleMol.split("\n").slice(1).join("\n");
    const rxn = [
      "$RXN",
      "step 1 of 2",
      "  -INDIGO- 0704251239",
      "",
      "  2  1",
      "$MOL",
      "A",
      mol,
      "$MOL",
      "B",
      mol,
      "$MOL",
      "C",
      mol,
    ].join("\n");
    const g = parseRXNGroups(rxn);
    expect([g.reactants.length, g.products.length]).toEqual([2, 1]);
  });

  it("lays out reactants left of the arrow and products right of it", () => {
    const { model, arrow } = buildEditorModelFromRXN(sampleRxn2);
    expect(arrow).not.toBeNull();
    expect(model.atoms.length).toBeGreaterThan(0);
    const ids = new Set(model.atoms.map((a) => a.id));
    for (const b of model.bonds) {
      expect(ids.has(b.a)).toBe(true);
      expect(ids.has(b.b)).toBe(true);
    }
  });
});

// Pyridine with its ring bonds marked aromatic (MDL bond type 4), as some
// programs write it, rather than as alternating single and double bonds.
const aromaticPyridine = [
  "pyridine",
  "  aromatic bonds",
  "",
  "  6  6  0     0  0  0  0  0  0999 V2000",
  "    1.2990    0.7500    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0",
  "    1.2990   -0.7500    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
  "    0.0000   -1.5000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
  "   -1.2990   -0.7500    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
  "   -1.2990    0.7500    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
  "    0.0000    1.5000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
  "  1  2  4  0  0  0  0",
  "  2  3  4  0  0  0  0",
  "  3  4  4  0  0  0  0",
  "  4  5  4  0  0  0  0",
  "  5  6  4  0  0  0  0",
  "  6  1  4  0  0  0  0",
  "M  END",
].join("\n");

describe("aromatic bonds on import", () => {
  it("come in as a Kekulé ring, not as triple bonds", () => {
    const { model } = moleculesToEditorModel(
      readMoleculesFromText(aromaticPyridine, "mol"),
    );
    const orders = model.bonds.map((b) => b.order);
    expect(orders).not.toContain(3);
    expect(orders.filter((o) => o === 2)).toHaveLength(3);
    // every ring atom, the N included, carries one of them
    for (const a of model.atoms) {
      const doubles = model.bonds.filter(
        (b) => b.order === 2 && (b.a === a.id || b.b === a.id),
      );
      expect(doubles).toHaveLength(1);
    }
  });
});

describe("coordination bonds on import", () => {
  it("come in as dative single bonds, from the first atom to the second", () => {
    // ammonia borane, H3N->BH3, with the MOL bond type for a coordination bond
    const mol = [
      "",
      "  test",
      "",
      "  2  1  0     0  0  0  0  0  0999 V2000",
      "    0.0000    0.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0",
      "    1.5000    0.0000    0.0000 B   0  0  0  0  0  0  0  0  0  0  0  0",
      "  1  2  9  0  0  0  0",
      "M  END",
    ].join("\n");
    const { model } = moleculesToEditorModel(readMoleculesFromText(mol, "mol"));
    expect(model.bonds).toHaveLength(1);
    const [b] = model.bonds;
    expect(b.order).toBe(1);
    expect(b.dative).toBe(true);
    const n = model.atoms.find((a) => a.el === "N")!;
    expect(b.a).toBe(n.id);
  });
});
