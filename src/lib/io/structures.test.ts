import { describe, expect, it } from "vitest";
import { checkedStructures, readStructures } from "./structures";
import sampleSdf from "../../samples/cholesterol.sdf?raw";
import sampleRxn from "../../samples/esterification.rxn?raw";

const WATER = "3\nwater\nO 0 0 0\nH 0.76 0.59 0\nH -0.76 0.59 0\n";

describe("a structure's file, as Meno's own reader gives it", () => {
  it("is what the file holds: a drawing, a reaction's arrow, or molecules in 3D", () => {
    expect(readStructures("sdf", "cholesterol.sdf", sampleSdf).model.atoms.length).toBeGreaterThan(20);
    expect(readStructures("rxn", "e.rxn", sampleRxn).arrow).toBeDefined();
    expect(readStructures("xyz", "w.xyz", WATER).molecules3d?.[0]).toMatchObject({ name: "w.xyz", atoms: [{ el: "O" }, { el: "H" }, { el: "H" }] });
    expect(() => readStructures("mol", "x.mol", "nothing")).toThrow(/No molecules found in x.mol/);
  });

  it("is checked as the page takes it, as any reader's answer is", () => {
    const read = readStructures("xyz", "w.xyz", WATER);
    expect(checkedStructures(read, "w.xyz")).toBe(read);
    const mol = readStructures("sdf", "c.sdf", sampleSdf);
    expect(checkedStructures(mol, "c.sdf")).toBe(mol);
    const broken = (s: unknown, why: RegExp) => expect(() => checkedStructures(s, "x.mol")).toThrow(why);
    broken(null, /no drawing came back/);
    broken({ ...mol, model: { ...mol.model, atoms: [{ ...mol.model.atoms[0], x: NaN }, ...mol.model.atoms.slice(1)] } }, /atom of its drawing is not placed/);
    broken({ ...mol, model: { ...mol.model, bonds: [{ ...mol.model.bonds[0], b: -9 }] } }, /bond of its drawing joins no atoms/);
    const m = read.molecules3d![0];
    broken({ ...read, molecules3d: [{ ...m, bonds: [{ a1: 0, a2: 7, order: 1 }] }] }, /bond of a molecule in 3D joins no atoms/);
    broken({ ...read, molecules3d: [{ ...m, frames: [[0, 0, 0]] }] }, /frame of a molecule in 3D is not whole/);
    broken({ ...read, pluses: [{ x: 1 }] }, /"\+" sign is not placed/);
  });
});
