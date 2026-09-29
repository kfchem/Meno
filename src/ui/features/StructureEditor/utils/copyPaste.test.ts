import { describe, expect, it } from "vitest";
import type { Model } from "../store/types";
import { centredAt, clipItems, looksLikeMolfile, looksLikeSmiles, partToCopy, readRecord } from "./copyPaste";

const atom = (id: number, x: number, y: number, el = "C") => ({ id, x, y, r: 0.9, el });

// a propanol - its O charged, and a wedge - and apart from it a methane
const model: Model = {
  atoms: [atom(1, 0, 0), atom(2, 1, 0), { ...atom(3, 2, 0, "O"), charge: 1 }, atom(4, 10, 0)],
  bonds: [
    { id: 11, a: 1, b: 2, order: 1, stereo: "up" },
    { id: 12, a: 2, b: 3, order: 1 },
  ],
};
const none = { atoms: new Set<number>(), bonds: new Set<number>() };

describe("partToCopy", () => {
  it("takes the selected atoms and the bonds among them", () => {
    const part = partToCopy(model, { atoms: new Set([2, 3]), bonds: new Set() }, null)!;
    expect(part.atoms.map((a) => a.id)).toEqual([2, 3]);
    expect(part.bonds.map((b) => b.id)).toEqual([12]);
  });

  it("with nothing selected, takes the structure under the pointer, or nothing", () => {
    expect(partToCopy(model, none, 3)!.atoms.map((a) => a.id)).toEqual([1, 2, 3]);
    expect(partToCopy(model, none, null)).toBeNull();
  });
});

describe("the clipboard's items", () => {
  it("are Meno's own record, read back as it was, and a MOL file - never plain text", () => {
    const items = clipItems(model);
    expect(items.map((i) => i.flavor)).toEqual(["meno", "mol"]);
    expect(readRecord(items[0].text)).toEqual(model);
    expect(looksLikeMolfile(items[1].text)).toBe(true);
    expect(items[1].text).toMatch(/M {2}CHG {2}1 {3}3 {3}1/);
  });

  it("read no record that is not one", () => {
    expect(readRecord("CCO")).toBeNull();
    expect(readRecord(JSON.stringify({ format: "meno-structure", version: 99, atoms: [], bonds: [] }))).toBeNull();
    // a bond to an atom it does not have
    const bad = JSON.stringify({ format: "meno-structure", version: 1, atoms: [atom(1, 0, 0)], bonds: [{ id: 2, a: 1, b: 9, order: 1 }] });
    expect(readRecord(bad)).toBeNull();
  });
});

describe("plain text", () => {
  it("is told apart: a MOL file, a SMILES, or neither", () => {
    expect(looksLikeMolfile(clipItems(model)[1].text)).toBe(true);
    expect(looksLikeSmiles("CC(C)Cc1ccc(cc1)[C@@H](C)C(=O)O")).toBe(true);
    expect(looksLikeSmiles(" CCO\n")).toBe(true);
    expect(looksLikeSmiles("two words")).toBe(false);
    expect(looksLikeSmiles("")).toBe(false);
    expect(looksLikeMolfile("CCO")).toBe(false);
  });
});

describe("centredAt", () => {
  it("puts the middle of the box round a structure at a point", () => {
    const moved = centredAt(model, { x: 100, y: 50 });
    const xs = moved.atoms.map((a) => a.x);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(100);
    expect(moved.atoms[0].y).toBeCloseTo(50);
  });
});
