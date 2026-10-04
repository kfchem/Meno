import { describe, expect, it } from "vitest";
import { STYLE_3D } from "../../../../lib/chem/style3d";
import type { Conformers } from "../../../../lib/rdkit/client";
import type { Model } from "../store/types";
import { solidOf } from "../utils/molecule3d";
import { blocksOf, moleculeOf, placeRow, turnedOver, type Box, type Turned } from "./make3d";

/** Ethanol drawn: C1-C2-O3, a bond's length apart. */
const ethanol: Model = {
  atoms: [
    { id: 11, x: 0, y: 0, r: 0.9, el: "C" },
    { id: 12, x: 1.56, y: 0.9, r: 0.9, el: "C" },
    { id: 13, x: 3.12, y: 0, r: 0.9, el: "O" },
  ],
  bonds: [
    { id: 21, a: 11, b: 12, order: 1 },
    { id: 22, a: 12, b: 13, order: 1 },
  ],
};

/** What RDKit answers for it: the drawn atoms, then two of the hydrogens, two conformers. */
const answer: Conformers = {
  atoms: [{ el: "C", charge: 0 }, { el: "C", charge: 0 }, { el: "O", charge: 0 }, { el: "H", charge: 0 }, { el: "H", charge: 0 }],
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 1, a2: 2, order: 1 },
    { a1: 0, a2: 3, order: 1 },
    { a1: 2, a2: 4, order: 1 },
  ],
  frames: [
    [0, 0, 0, 1.3, 0.75, 0.1, 2.6, 0, -0.1, -0.9, 0.5, 0, 3.4, 0.5, 0],
    [0, 0, 0.1, 1.3, 0.75, 0, 2.6, 0, 0.2, -0.9, 0.5, 0, 3.4, 0.5, 0],
  ],
  energies: [-0.001, 0.002],
  field: "MMFF94",
  cip: { atoms: {}, bonds: {} },
  chosen: { atoms: {}, bonds: {} },
  smiles: "CCO",
};

describe("making a drawn structure in 3D", () => {
  it("asks RDKit about each structure the atoms are in, its atoms and bonds known by their ids", () => {
    const [block] = blocksOf(ethanol, [12]);
    expect(block.atoms).toEqual([11, 12, 13]);
    expect(block.bonds).toEqual([21, 22]);
    expect(block.molblock).toContain("V3000");
  });

  it("makes the lowest conformer its atoms and the rest its frames, tied to the drawing's atoms", () => {
    const m = moleculeOf(answer, blocksOf(ethanol, [11])[0]);
    expect(m.atoms.map((a) => a.el)).toEqual(["C", "C", "O", "H", "H"]);
    expect(m.atoms[1]).toMatchObject({ x: 1.3, y: 0.75, z: 0.1 });
    expect(m.frames).toEqual([answer.frames[1]]);
    expect(m.energies).toEqual(answer.energies);
    expect(m.drawnFrom).toEqual([11, 12, 13, null, null]);
    expect(m.stereo).toEqual({ atoms: {}, bonds: {} });
  });

  it("keeps each centre's label, and which were left open, so that stereoisomers are told apart", () => {
    const iso = { ...answer, cip: { atoms: { "1": "R" }, bonds: {} }, chosen: { atoms: { "1": "R" }, bonds: {} } };
    expect(moleculeOf(iso, blocksOf(ethanol, [11])[0]).stereo).toEqual({ atoms: { 1: "R" }, bonds: {}, chosen: { atoms: [1], bonds: [] } });
  });

  it("starts each atom on its drawing's atom - a hydrogen on the atom it is bonded to - and lies over the drawing", () => {
    const m = moleculeOf(answer, blocksOf(ethanol, [11])[0]);
    const t = turnedOver(m, ethanol, STYLE_3D);
    const places = solidOf({ ...m, id: 0, at: { x: 0, y: 0 } }, STYLE_3D).frames[0];
    expect(t.flat).toHaveLength(places.length);
    // the hydrogens start where their carbon and oxygen do
    expect(t.flat.slice(9, 12)).toEqual(t.flat.slice(0, 3));
    expect(t.flat.slice(12, 15)).toEqual(t.flat.slice(6, 9));
    // over the drawing: its centre near the drawn atoms' middle
    expect(Math.abs(t.start.x - 1.56)).toBeLessThan(1);
    expect(Math.abs(t.start.y - 0.3)).toBeLessThan(1);
  });
});

describe("placeRow", () => {
  const item = (w: number, height = 1): Turned => ({ turn: [0, 0, 0, 1], start: { x: 0, y: 0 }, reach: { x0: -w / 2, x1: w / 2, y0: -1, y1: 1 }, flat: [], height });
  const drawing: Box = { x0: 0, x1: 4, y0: 0, y1: 2 };

  it("rests beside the drawing, to its right, where that is in view", () => {
    const row = placeRow([item(2), item(2)], drawing, { x0: -20, x1: 20, y0: -20, y1: 20 });
    expect(row.inView).toBe(true);
    expect(row.at[0].x).toBeGreaterThan(4);
    expect(row.at[1].x).toBeGreaterThan(row.at[0].x + 2);
    expect(row.at[0].y).toBe(1);
  });

  it("goes to the left, then below, where the right is out of view", () => {
    const left = placeRow([item(2)], drawing, { x0: -10, x1: 5, y0: -10, y1: 10 });
    expect(left.inView).toBe(true);
    expect(left.at[0].x).toBeLessThan(0);
    const below = placeRow([item(2)], drawing, { x0: -0.5, x1: 4.5, y0: -10, y1: 3 });
    expect(below.inView).toBe(true);
    expect(below.at[0].y).toBeLessThan(0);
  });

  it("counts on a molecule standing up off the page being seen larger, further out", () => {
    const view = { x0: -6, x1: 14, y0: -10, y1: 10 };
    expect(placeRow([item(6, 1)], drawing, view).at[0].x).toBeGreaterThan(4);
    // (standing tall, it would be seen past the view's right edge: so it goes elsewhere)
    expect(placeRow([item(6, 12)], drawing, view).at[0].x).toBeLessThan(4);
  });

  it("says so where it is in view nowhere, and goes to the right", () => {
    const row = placeRow([item(30)], drawing, { x0: -1, x1: 5, y0: -1, y1: 3 });
    expect(row.inView).toBe(false);
    expect(row.at[0].x).toBeGreaterThan(4);
  });
});
