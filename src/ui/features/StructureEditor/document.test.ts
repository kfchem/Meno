import { describe, expect, it } from "vitest";
import * as ops from "./document";
import { emptyStructureDocument, type StructureDocument } from "./document";

const doc = () => emptyStructureDocument();

/** Two bonded carbons, as a starting point. */
function ethane(): StructureDocument {
  return ops.addBondedPair(doc(), { x: 0, y: 0 }, { x: 1.5, y: 0 });
}

describe("structure document operations", () => {
  it("hands out ids from one counter and keeps atoms and bonds apart", () => {
    const d = ethane();
    expect(d.model.atoms.map((a) => a.id)).toEqual([1, 2]);
    expect(d.model.bonds).toHaveLength(1);
    expect(d.model.bonds[0]).toMatchObject({ id: 3, a: 1, b: 2, order: 1 });
    expect(d.nextId).toBe(4);
  });

  it("adds an atom with its bond in one operation", () => {
    const d = ops.addAtomBonded(ethane(), 2, 3, 0, "O");
    expect(d.model.atoms).toHaveLength(3);
    expect(d.model.atoms[2]).toMatchObject({ el: "O", x: 3, y: 0 });
    expect(d.model.bonds[1]).toMatchObject({ a: 2, b: d.model.atoms[2].id });
  });

  it("refuses to bond an atom to itself or to repeat a bond", () => {
    const d = ethane();
    expect(ops.connectAtoms(d, 1, 1)).toBe(d);
    expect(ops.connectAtoms(d, 1, 2)).toBe(d);
    expect(ops.connectAtoms(d, 2, 1)).toBe(d);
    // a genuinely new bond does change the document
    const three = ops.addAtom(d, 3, 0, "N");
    expect(ops.connectAtoms(three, 2, three.nextId - 1)).not.toBe(three);
  });

  it("returns the same document when nothing changes, so no undo step is made", () => {
    const d = ethane();
    expect(ops.moveAtom(d, 1, 0, 0)).toBe(d);
    expect(ops.moveAtom(d, 999, 5, 5)).toBe(d);
    expect(ops.setAtomLabel(d, 1, "C")).toBe(d);
    expect(ops.updateBond(d, d.model.bonds[0].id, { order: 1 })).toBe(d);
    expect(ops.updateBond(d, 999, { order: 2 })).toBe(d);
    expect(ops.removeArrow(d, 1)).toBe(d);
    expect(ops.setAromaticEnabled(d, false)).toBe(d);
    expect(ops.setRingEnabled(d, "ring", false)).toBe(d);
    expect(ops.appendModel(d, { atoms: [], bonds: [] })).toBe(d);
  });

  it("moves and relabels atoms without touching the rest", () => {
    const d = ethane();
    const moved = ops.moveAtom(d, 2, 4, 1);
    expect(moved.model.atoms[1]).toMatchObject({ x: 4, y: 1 });
    expect(moved.model.atoms[0]).toBe(d.model.atoms[0]);
    expect(moved.model.bonds).toBe(d.model.bonds);

    const named = ops.setAtomLabel(moved, 2, "O");
    expect(named.model.atoms[1].el).toBe("O");
    expect(named.model.atoms[1].x).toBe(4);
  });

  it("changes bond properties", () => {
    const d = ethane();
    const id = d.model.bonds[0].id;
    const double = ops.updateBond(d, id, { order: 2 });
    expect(double.model.bonds[0].order).toBe(2);
    const wedge = ops.updateBond(double, id, { stereo: "up" });
    expect(wedge.model.bonds[0]).toMatchObject({ order: 2, stereo: "up" });
  });

  it("merges a dragged atom into its target, rewiring bonds", () => {
    // chain: 1-2, plus 3 bonded to 1; dropping 3 onto 2 should bond 2-1 only once
    let d = ethane();
    d = ops.addAtomBonded(d, 1, -1.5, 0, "C");
    const draggedId = d.model.atoms[2].id;
    const merged = ops.replaceDraggedAtomWith(d, draggedId, 2);

    expect(merged.model.atoms.map((a) => a.id)).toEqual([1, 2]);
    // the rewired bond would duplicate 1-2, so it is dropped
    expect(merged.model.bonds).toHaveLength(1);
    expect(merged.model.bonds[0]).toMatchObject({ a: 1, b: 2 });
  });

  it("keeps a rewired bond when it is not a duplicate", () => {
    // 1-2 and 3-4; dropping 3 onto 2 should leave 1-2 and 2-4
    let d = ethane();
    d = ops.addAtom(d, 5, 0, "C");
    const third = d.nextId - 1;
    d = ops.addAtomBonded(d, third, 6.5, 0, "C");
    const fourth = d.model.atoms[3].id;
    const merged = ops.replaceDraggedAtomWith(d, third, 2);

    expect(merged.model.atoms.map((a) => a.id)).toEqual([1, 2, fourth]);
    expect(merged.model.bonds).toHaveLength(2);
    expect(merged.model.bonds[1]).toMatchObject({ a: 2, b: fourth });
  });

  it("replaces the whole model on import and renumbers from it", () => {
    const d = ops.addArrow(ethane(), 0, 0, 0, 2);
    const replaced = ops.replaceModel(d, {
      atoms: [{ id: 7, x: 0, y: 0, r: 0.9, el: "N" }],
      bonds: [],
    });
    expect(replaced.model.atoms).toHaveLength(1);
    expect(replaced.nextId).toBe(8);
    // an import starts a clean sheet
    expect(replaced.arrows).toEqual([]);
    expect(replaced.aromaticRings).toEqual({});
  });

  it("renumbers an appended structure so ids stay unique", () => {
    const d = ethane();
    const appended = ops.appendModel(d, {
      atoms: [
        { id: 1, x: 5, y: 0, r: 0.9, el: "O" },
        { id: 2, x: 6, y: 0, r: 0.9, el: "O" },
      ],
      bonds: [{ id: 3, a: 1, b: 2, order: 2 }],
    });
    const ids = appended.model.atoms.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    const added = appended.model.bonds[1];
    expect(added.a).toBe(ids[2]);
    expect(added.b).toBe(ids[3]);
    expect(added.order).toBe(2);
  });

  it("keeps arrows in their own numbering", () => {
    let d = ops.addArrow(ethane(), 1, 2, 0, 3);
    expect(d.arrows[0]).toMatchObject({ id: 1, x: 1, y: 2, length: 3 });
    d = ops.updateArrow(d, 1, { x: 9 });
    expect(d.arrows[0].x).toBe(9);
    d = ops.removeArrow(d, 1);
    expect(d.arrows).toEqual([]);
  });

  it("toggles aromatic circles", () => {
    let d = ops.setAromaticEnabled(doc(), true);
    expect(d.aromaticEnabled).toBe(true);
    d = ops.setRingEnabled(d, "ring-a", true);
    expect(d.aromaticRings).toEqual({ "ring-a": true });
  });
});
