import { describe, expect, it } from "vitest";
import { editorModelOf, processFileContent } from "./io";
import sampleSdf from "../../../../samples/cholesterol.sdf?raw";
import sampleRxn from "../../../../samples/esterification.rxn?raw";

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
