import { describe, expect, it } from "vitest";
import { processFileContent } from "./io";
import sampleSdf from "../../../../assets/KEF20633.sdf?raw";
import sampleRxn from "../../../../assets/KEF96002.rxn?raw";

describe("processFileContent", () => {
  it("imports an SDF", async () => {
    const r = await processFileContent("KEF20633.sdf", sampleSdf);
    expect(r.model.atoms).toHaveLength(38);
    expect(r.arrow).toBeUndefined();
  });

  it("imports an RXN with its arrow", async () => {
    const r = await processFileContent("KEF96002.rxn", sampleRxn);
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
