import { describe, expect, it } from "vitest";
import { LIGANDS } from "../../../../lib/chem/ligands";
import { writeMolfile } from "../../../../lib/chem/molWriter";
import { readSmiles } from "../../../../lib/chem/smiles";
import { layout2D } from "../../../../lib/layout/engine";
import { torsionSense } from "../../../../lib/layout/stereo";
import { emptyStructureDocument, expandAbbreviation, relayout } from "../document";
import type { Model } from "../store/types";
import { layoutJob, relayoutFrom } from "./engineLayout";

const alone = (el: string): Model => ({ atoms: [{ id: 1, x: 0, y: 0, r: 0.9, el }], bonds: [] });
const expanded = (label: string) => expandAbbreviation({ ...emptyStructureDocument(), model: alone(label), nextId: 100 }, 1);
const wedges = (m: Model) => m.bonds.filter((b) => b.stereo === "up" || b.stereo === "down");

/** The axis a drawing shows, its sense taken against the P-bearing carbon at each end (as `Ligand.axis` has it). */
function axisOf(m: Model): number | null {
  const job = layoutJob(m);
  const [axis] = job.input.axes ?? [];
  if (!axis) return null;
  const el = (i: number) => job.input.atoms[i].el;
  const bearsP = (i: number) => job.input.bonds.some((b) => (b.a === i && el(b.b) === "P") || (b.b === i && el(b.a) === "P"));
  return axis.sense * (bearsP(axis.refs[0]) ? 1 : -1) * (bearsP(axis.refs[1]) ? 1 : -1);
}

describe("an axis of chirality", () => {
  it("turns as IUPAC signs a torsion: + where the near bond turns clockwise onto the far one", () => {
    // looking down +x from q to r, p straight up, s to the viewer's right (-y): clockwise
    expect(torsionSense([0, 0, 1], [0, 0, 0], [1, 0, 0], [1, -1, 0])).toBe(1);
    expect(torsionSense([0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 1, 0])).toBe(-1);
  });

  it("is given for BINAP and the SEGPHOSes as a bond between two rings, its refs the carbons bearing P", () => {
    for (const label of ["BINAP", "SEGPHOS", "DTBM-SEGPHOS"]) {
      const l = LIGANDS.find((x) => x.label === label)!;
      const { atoms, bonds } = readSmiles(l.smiles);
      const bonded = (p: number, q: number) => bonds.some((b) => (b.a1 === p && b.a2 === q) || (b.a1 === q && b.a2 === p));
      const [i, j] = l.axis!.atoms;
      const [a, b] = l.axis!.refs;
      expect(bonded(i, j) && bonded(i, a) && bonded(j, b), label).toBe(true);
      for (const r of [a, b]) expect(atoms.some((x, k) => x.el === "P" && bonded(k, r)), label).toBe(true);
    }
  });

  it("is drawn, written out, by one wedge at the axis as the descriptor says: (R) as M, (S) as P", () => {
    expect(axisOf(expanded("(R)-BINAP").model)).toBe(-1);
    expect(axisOf(expanded("(S)-BINAP").model)).toBe(1);
    expect(axisOf(expanded("(R)-SEGPHOS").model)).toBe(-1);
    expect(axisOf(expanded("(S)-DTBM-SEGPHOS").model)).toBe(1);
    for (const label of ["(R)-BINAP", "(S)-SEGPHOS", "(R)-Krische's catalyst"]) expect(wedges(expanded(label).model), label).toHaveLength(1);
    // in a complex's formula, with the centres of another ligand
    expect(axisOf(expanded("RuCl2[(S)-BINAP][(S,S)-DPEN]").model)).toBe(1);
    // none said, none drawn
    expect(wedges(expanded("BINAP").model)).toHaveLength(0);
    expect(axisOf(expanded("(±)-BINAP").model)).toBeNull();
    // (eleven structures laid out by the whole engine, a complex among them: slower on CI's runners)
  }, 60_000);

  it("is kept by Clean-up, and written to a MOL file as a wedge from the axis", () => {
    for (const label of ["(R)-BINAP", "(S)-BINAP"]) {
      const out = expanded(label);
      const job = layoutJob(out.model);
      const after = relayout(out, relayoutFrom(out.model, out.model, job, layout2D(job.input))).model;
      expect(axisOf(after), label).toBe(axisOf(out.model));
      expect(wedges(after), label).toHaveLength(1);
    }
    // (a wedge, 1, or hashes, 6, in the bond block's stereo field)
    const text = writeMolfile(expanded("(R)-BINAP").model);
    expect(text.split("\n").some((line) => /^\s*\d+\s+\d+\s+1\s+[16]\s/.test(line))).toBe(true);
  }, 30_000);
});
