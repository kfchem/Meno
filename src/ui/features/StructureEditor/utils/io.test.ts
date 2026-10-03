import { describe, expect, it } from "vitest";
import { editorModelOf, processFileContent } from "./io";
import sampleSdf from "../../../../samples/cholesterol.sdf?raw";
import sampleRxn from "../../../../samples/esterification.rxn?raw";
import sampleXyz from "../../../../samples/cholesterol.xyz?raw";

describe("processFileContent", () => {
  it("imports an SDF", async () => {
    const r = await processFileContent("cholesterol.sdf", sampleSdf);
    expect(r.model.atoms).toHaveLength(28);
    expect(r.arrow).toBeUndefined();
  });

  it("imports an RXN with its arrow", async () => {
    const r = await processFileContent("esterification.rxn", sampleRxn);
    expect(r.model.atoms.length).toBeGreaterThan(0);
    expect(r.arrow).toBeDefined();
  });

  it("names unsupported formats instead of showing a blank canvas", async () => {
    const pdb = [
      "HEADER    PEPTIDE",
      "ATOM      1  N   ALA A   1      11.104   6.134  -6.504  1.00  0.00           N",
      "END",
    ].join("\n");
    await expect(processFileContent("1abc.pdb", pdb)).rejects.toThrow(
      "PDB files are not supported yet (1abc.pdb).",
    );
    await expect(
      processFileContent("reaction.ket", '{"root":{"nodes":[]}}'),
    ).rejects.toThrow("KET files are not supported yet");
  });

  it("reports files that contain no molecules", async () => {
    await expect(processFileContent("notes.mol", "hello")).rejects.toThrow(
      "No molecules found in notes.mol.",
    );
    await expect(processFileContent("", "hello")).rejects.toThrow(
      "No molecules found in the file.",
    );
  });
});

describe("editorModelOf", () => {
  it("keeps what a bond is besides its order", () => {
    const model = editorModelOf({
      atoms: [
        { id: 1, x: 0, y: 0, el: "O" },
        { id: 2, x: 1, y: 0, el: "O" },
      ],
      bonds: [
        { id: 3, a: 1, b: 2, order: 1, hydrogen: true },
        { id: 4, a: 1, b: 2, order: 1, coordination: true },
        { id: 5, a: 1, b: 2, order: 2, query: "double-or-aromatic", stereo: "either" },
      ],
    });
    expect(model.bonds.map((b) => [b.hydrogen, b.coordination, b.query, b.stereo])).toEqual([
      [true, undefined, undefined, "none"],
      [undefined, true, undefined, "none"],
      [undefined, undefined, "double-or-aromatic", "either"],
    ]);
  });
});

/** A molfile of water, its header saying 2D or 3D, its atoms at the depths given. */
const water = (dim: "2D" | "3D", z: [number, number, number]) =>
  [
    "water",
    // (initials, the program in 8, the date and time in 10, then the dimensions: columns 21-22)
    `  Meno              ${dim}`,
    "",
    "  3  2  0  0  0  0  0  0  0  0999 V2000",
    `    0.0000    0.0000${z[0].toFixed(4).padStart(10)} O   0  0`,
    `    0.7570    0.5860${z[1].toFixed(4).padStart(10)} H   0  0`,
    `   -0.7570    0.5860${z[2].toFixed(4).padStart(10)} H   0  0`,
    "  1  2  1  0",
    "  1  3  1  0",
    "M  END",
    "",
  ].join("\n");

describe("files of 3D structures", () => {
  it("open an XYZ file as one molecule in 3D, its other frames kept", async () => {
    const r = await processFileContent("cholesterol.xyz", sampleXyz);
    expect(r.model.atoms).toHaveLength(0);
    expect(r.molecules3d).toHaveLength(1);
    expect(r.molecules3d![0].atoms).toHaveLength(74);
    expect(r.molecules3d![0].frames).toBeUndefined();
    const twoFrames = "2\nfirst\nH 0 0 0\nH 0.74 0 0\n2\nsecond\nH 0 0 0\nH 0.80 0 0\n";
    const t = await processFileContent("h2.xyz", twoFrames);
    expect(t.molecules3d![0].frames).toEqual([[0, 0, 0, 0.8, 0, 0]]);
  });

  it("open a molfile that says it is 3D in 3D, even when it is flat", async () => {
    const r = await processFileContent("water.mol", water("3D", [0, 0, 0]));
    expect(r.molecules3d).toHaveLength(1);
    expect(r.model.atoms).toHaveLength(0);
  });

  it("open a molfile whose atoms spread in depth in 3D, whatever its header says", async () => {
    const r = await processFileContent("water.mol", water("2D", [0, 0.3, -0.3]));
    expect(r.molecules3d).toHaveLength(1);
  });

  it("open an SD file's 3D records in 3D and its flat ones as drawings", async () => {
    const r = await processFileContent("both.sdf", water("2D", [0, 0, 0]) + "$$$$\n" + water("3D", [0, 0.3, -0.3]) + "$$$$\n");
    expect(r.model.atoms).toHaveLength(3);
    expect(r.molecules3d).toHaveLength(1);
  });

  it("leave a flat 2D molfile a drawing", async () => {
    const r = await processFileContent("water.mol", water("2D", [0, 0, 0]));
    expect(r.molecules3d).toBeUndefined();
    expect(r.model.atoms).toHaveLength(3);
  });
});
