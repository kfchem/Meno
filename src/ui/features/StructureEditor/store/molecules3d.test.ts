import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { addMolecule3d, createStructureDocument } from "../document";
import { molecules3dIn } from "../utils/selection";

const water = {
  atoms: [
    { el: "O", x: 0, y: 0, z: 0 },
    { el: "H", x: 0.76, y: 0.59, z: 0 },
    { el: "H", x: -0.76, y: 0.59, z: 0 },
    { el: "H", x: 0, y: -0.9, z: 0.3 },
    { el: "H", x: 0, y: -0.9, z: -0.3 },
  ],
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 0, a2: 2, order: 1 },
  ],
};

/** A canvas's store over a document holding two molecules in 3D, side by side. */
function editor() {
  const doc = createStructureDocument();
  doc.edit("add", (d) => addMolecule3d(addMolecule3d(d, { ...water, at: { x: 0, y: 0 } }), { ...water, at: { x: 6, y: 0 } }));
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, state: () => store.getState() };
}

describe("molecules in 3D turned together, as one body", () => {
  const half: [number, number, number, number] = [0, 1, 0, 0]; // (a half turn about the upright)

  it("move as the turn takes them, as one undo step, and the undo puts their turns back too", () => {
    const { doc, state } = editor();
    state().setTurn3d(1, [0, 0, 0, 1]);
    state().turnMolecules3d(
      [
        { id: 1, at: { x: 6, y: 0, z: 2 }, turn: half },
        { id: 2, at: { x: 0, y: 0, z: 2 }, turn: half },
      ],
      "turn-1",
    );
    state().turnMolecules3d(
      [
        { id: 1, at: { x: 6, y: 0, z: 2.5 }, turn: half },
        { id: 2, at: { x: 0, y: 0, z: 2.5 }, turn: half },
      ],
      "turn-1",
    );
    expect(state().molecules3d.map((m) => m.at)).toEqual([
      { x: 6, y: 0, z: 2.5 },
      { x: 0, y: 0, z: 2.5 },
    ]);
    expect(state().turns3d).toEqual({ 1: half, 2: half });
    expect(doc.history().undoLabel).toBe("turn molecules");
    doc.undo();
    expect(state().molecules3d.map((m) => m.at)).toEqual([
      { x: 0, y: 0 },
      { x: 6, y: 0 },
    ]);
    expect(state().turns3d).toEqual({ 1: [0, 0, 0, 1] });
    doc.redo();
    expect(state().turns3d).toEqual({ 1: half, 2: half });
  });

  it("leave the turns alone on an undo of something else", () => {
    const { doc, state } = editor();
    state().turnMolecules3d([{ id: 1, at: { x: 1, y: 0, z: 2 }, turn: half }], "turn-1");
    state().moveMolecules3d([{ id: 2, at: { x: 9, y: 0 } }]);
    state().setTurn3d(1, [0, 0, 1, 0]);
    doc.undo();
    expect(state().turns3d[1]).toEqual([0, 0, 1, 0]);
    // and a move keeps how high one stands
    expect(state().molecules3d[0].at).toEqual({ x: 1, y: 0, z: 2 });
  });
});

describe("molecules in 3D, chosen and selected", () => {
  it("choose atoms one by one, in order, a fifth or another molecule's starting afresh", () => {
    const { state } = editor();
    for (const a of [0, 1, 2]) state().chooseAtom3d(1, a);
    expect(state().chosen3d).toEqual({ id: 1, atoms: [0, 1, 2], bonds: [] });
    // chosen again: let go
    state().chooseAtom3d(1, 1);
    expect(state().chosen3d).toEqual({ id: 1, atoms: [0, 2], bonds: [] });
    state().chooseAtom3d(1, 3);
    state().chooseAtom3d(1, 4);
    state().chooseAtom3d(1, 1);
    expect(state().chosen3d).toEqual({ id: 1, atoms: [1], bonds: [] });
    state().chooseAtom3d(2, 0);
    expect(state().chosen3d).toEqual({ id: 2, atoms: [0], bonds: [] });
  });

  it("choose bonds too, with atoms, and let them go likewise", () => {
    const { state } = editor();
    state().chooseBond3d(1, 0);
    state().chooseAtom3d(1, 2);
    expect(state().chosen3d).toEqual({ id: 1, atoms: [2], bonds: [0] });
    state().chooseBond3d(1, 0);
    state().chooseAtom3d(1, 2);
    expect(state().chosen3d).toBeNull();
  });

  it("measure what is chosen, as one step, and let it go", () => {
    const { doc, state } = editor();
    state().chooseAtom3d(1, 1);
    state().chooseAtom3d(1, 0);
    state().chooseAtom3d(1, 2);
    state().measureChosen3d();
    expect(state().molecules3d[0].measures).toEqual([{ id: 1, atoms: [1, 0, 2] }]);
    expect(state().chosen3d).toBeNull();
    expect(doc.history().undoLabel).toBe("measure angle");
  });

  it("measure a bond chosen as its length, and two bonds as the angle between them", () => {
    const { state } = editor();
    state().chooseBond3d(1, 1);
    state().measureChosen3d();
    expect(state().molecules3d[0].measures).toEqual([{ id: 1, atoms: [0, 2] }]);
    state().chooseBond3d(1, 0);
    state().chooseBond3d(1, 1);
    state().measureChosen3d();
    expect(state().molecules3d[0].measures?.[1].atoms).toEqual([2, 0, 1]);
  });

  it("are selected whole, alone or with others, and all with everything", () => {
    const { state } = editor();
    state().selectMolecules3d([1]);
    expect([...state().sel3d]).toEqual([1]);
    state().toggleMolecule3dSel(2);
    expect([...state().sel3d]).toEqual([1, 2]);
    state().toggleMolecule3dSel(1);
    expect([...state().sel3d]).toEqual([2]);
    state().clearSel();
    expect(state().sel3d.size).toBe(0);
    state().chooseAtom3d(1, 0);
    state().selectAll();
    expect([...state().sel3d]).toEqual([1, 2]);
    state().clearSel();
    expect(state().chosen3d).toBeNull();
  });

  it("are deleted with the selection, in the same step, and come back with an undo", () => {
    const { doc, state } = editor();
    state().selectMolecules3d([2]);
    state().deleteSelection();
    expect(state().molecules3d.map((m) => m.id)).toEqual([1]);
    expect(state().sel3d.size).toBe(0);
    doc.undo();
    expect(state().molecules3d.map((m) => m.id)).toEqual([1, 2]);
  });

  it("are forgotten by the view when the document no longer has them", () => {
    const { doc, state } = editor();
    state().selectMolecules3d([1, 2]);
    state().chooseAtom3d(2, 1);
    state().setTurn3d(2, [0, 0, 0, 1]);
    state().setFrame3d(2, 0);
    state().setHovered3d({ id: 2 });
    doc.edit("delete", (d) => ({ ...d, molecules3d: d.molecules3d!.filter((m) => m.id !== 2) }));
    expect([...state().sel3d]).toEqual([1]);
    expect(state().chosen3d).toBeNull();
    expect(state().turns3d).toEqual({});
    expect(state().frames3d).toEqual({});
    expect(state().hovered3d).toBeNull();
  });

  it("are taken by a box or a lasso round their centres", () => {
    const ms = [
      { id: 1, at: { x: 0, y: 0 } },
      { id: 2, at: { x: 6, y: 0 } },
    ];
    expect(molecules3dIn(ms, "box", [{ x: -1, y: -1 }, { x: 1, y: 1 }])).toEqual([1]);
    expect(molecules3dIn(ms, "box", [{ x: 7, y: 1 }, { x: -1, y: -1 }])).toEqual([1, 2]);
    const lasso = [
      { x: 5, y: -1 },
      { x: 7, y: -1 },
      { x: 7, y: 1 },
      { x: 5, y: 1 },
    ];
    expect(molecules3dIn(ms, "lasso", lasso)).toEqual([2]);
  });
});
