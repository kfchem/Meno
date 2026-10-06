import { describe, expect, it } from "vitest";
import { extensionOf, KINDS, kindOf } from "./kinds";
import sampleSdf from "../../samples/cholesterol.sdf?raw";
import sampleRxn from "../../samples/diels-alder.rxn?raw";
import sampleXyz from "../../samples/cholesterol.xyz?raw";

const id = (name: string, text: string) => kindOf(name, text)?.id ?? null;

// Ethane as a V2000 molfile, its title a bare number, as PubChem's are
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

const ORCA = "\n\n                                 * O   R   C   A *\n";
const GAUSSIAN = " Entering Gaussian System, Link 0=g16\n";

describe("what a file is", () => {
  it("is a structure's file by what it holds", () => {
    expect(id("cholesterol.sdf", sampleSdf)).toBe("sdf");
    expect(id("diels-alder.rxn", sampleRxn)).toBe("rxn");
    expect(id("cholesterol.xyz", sampleXyz)).toBe("xyz");
    expect(id("frame.txt", sampleXyz)).toBe("xyz");
    expect(id("", "1\ncomment\n6 0.0 0.0 0.0")).toBe("xyz");
    expect(id("", "0\nempty frame")).toBe("xyz");
  });

  it("is a molfile, not an XYZ file, when its title is a bare number", () => {
    expect(id("6324.sdf", numericTitleMol)).toBe("sdf");
    expect(id("6324.mol", numericTitleMol)).toBe("mol");
    expect(id("", numericTitleMol)).toBe("mol");
    expect(id("download.txt", numericTitleMol + "\n$$$$\n")).toBe("mol");
  });

  it("is a calculation's output by its program's banner, whatever it is called", () => {
    expect(id("job.out", ORCA)).toBe("orca");
    expect(id("run.log", GAUSSIAN)).toBe("gaussian");
    expect(id("", "title\nSP        RB3LYP     STO-3G\nNumber of atoms                            I               20\n")).toBe("gaussian-fchk");
    expect(id("", "     |                           x T B                           |     \n")).toBe("xtb");
    expect(id("", "   * xtb version 6.6.1 (8d0f1dd)\n")).toBe("xtb");
    // (a Molden file, by its first section)
    expect(id("", "[Molden Format]\n[Atoms] AU\nO 1 8 0 0 0\n")).toBe("molden");
    expect(id("water.txt", "  [MOLDEN FORMAT]\n")).toBe("molden");
  });

  it("is Meno's own record by what it says it is", () => {
    expect(id("work.json", '{"format":"meno-workspace","version":1,"atoms":[]}')).toBe("meno-workspace");
    expect(id("", ' {"format": "meno-structure", "version": 1, "atoms": []}')).toBe("meno-record");
    // (a workspace file that says nothing it can be told by: by its name)
    expect(id("work.meno", "{}")).toBe("meno-workspace");
  });

  it("takes the strongest evidence first: a banner over a molfile's markers, a cube's layout over an XYZ file's", () => {
    // an output that echoes a molfile, or a word like one
    expect(id("job.out", ORCA + "  input read from x.mol (V2000)\nM  END\n")).toBe("orca");
    expect(id("ethane.mol", GAUSSIAN + numericTitleMol)).toBe("gaussian");
    // a cube whose comment is a number: its third line reads as an XYZ file's first atom
    const cube = ["2", "density", "    1    0.000000    0.000000    0.000000", "   -2    0.5 0.0 0.0", "   -2    0.0 0.5 0.0", "   -2    0.0 0.0 0.5", "    2    2.0 0.25 0.25 0.25", ""].join("\n");
    expect(id("", cube)).toBe("cube");
  });

  it("is decided by its name only where what it holds says nothing", () => {
    expect(id("x.xyz", "2\n\nC 0 0 0\nC 1.5 0 0")).toBe("xyz");
    expect(id("notes.mol", "hello")).toBe("mol");
    expect(id("broken.rxn", "nothing here")).toBe("rxn");
    // (an output's names are text's too: no banner, no output)
    expect(id("build.log", "compiled in 3 s\n")).toBeNull();
  });

  it("is nothing Meno reads: text, a SMILES, a kind nothing reads yet", () => {
    expect(id("notes.txt", "42\nthe answer\nis not a molecule")).toBeNull();
    expect(id("Saturday.txt", "Saturday: ran the column\n")).toBeNull();
    expect(id("", "CCO")).toBeNull();
    expect(id("1abc.pdb", "HEADER    PROTEIN\nATOM      1  N   ALA A   1\n")).toBeNull();
  });
});

describe("the kinds", () => {
  it("are each named, Meno's own and the readers' alike, every one once", () => {
    const ids = KINDS.map((k) => k.id);
    expect(ids).toEqual(expect.arrayContaining(["meno-workspace", "meno-record", "rxn", "mol", "sdf", "xyz", "orca", "gaussian", "gaussian-fchk", "xtb", "molden", "cube"]));
    expect(new Set(ids).size).toBe(ids.length);
    expect(KINDS.filter((k) => k.output).map((k) => k.id)).not.toContain("xyz");
  });

  it("give a file's extension, lower case, with its dot", () => {
    expect(extensionOf("Ethanol.MOL")).toBe(".mol");
    expect(extensionOf("a.b/c.sdf")).toBe(".sdf");
    expect(extensionOf("README")).toBe("");
  });
});
