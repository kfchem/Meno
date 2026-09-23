import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createStructureDocument } from "../document";

/** Store wired to a document, the way a structure tab is put together. */
function editor() {
  const doc = createStructureDocument();
  const store = createEditorStore(doc);
  // The canvas connects the two in an effect; do the same here.
  const disconnect = connectStoreToDocument(store, doc);
  return { doc, store, disconnect, state: () => store.getState() };
}

describe("editor store over a document", () => {
  it("writes edits to the document and mirrors them back", () => {
    const { doc, state } = editor();
    const id = state().addAtom(1, 2, "O");

    expect(doc.getState().model.atoms).toHaveLength(1);
    // the store's model is the document's, not a copy
    expect(state().model).toBe(doc.getState().model);
    expect(state().model.atoms[0]).toMatchObject({ id, el: "O", x: 1, y: 2 });
    expect(doc.history()).toMatchObject({ undoDepth: 1, dirty: true });
  });

  it("undoes and redoes through the canvas state", () => {
    const { doc, state } = editor();
    state().addAtom(0, 0, "C");
    state().addAtom(1.5, 0, "C");
    expect(state().model.atoms).toHaveLength(2);

    doc.undo();
    expect(state().model.atoms).toHaveLength(1);
    doc.undo();
    expect(state().model.atoms).toHaveLength(0);
    doc.redo();
    expect(state().model.atoms).toHaveLength(1);
  });

  it("counts a bond extension as one step", () => {
    const { doc, state } = editor();
    const base = state().addAtom(0, 0, "C");
    const before = doc.history().undoDepth;

    state().addAtomBonded(base, 1.5, 0, "C");
    expect(doc.history().undoDepth).toBe(before + 1);
    expect(state().model.atoms).toHaveLength(2);
    expect(state().model.bonds).toHaveLength(1);

    doc.undo();
    // the atom and its bond go together
    expect(state().model.atoms).toHaveLength(1);
    expect(state().model.bonds).toHaveLength(0);
  });

  it("counts drawing a bond in empty space as one step", () => {
    const { doc, state } = editor();
    state().addBondedPair({ x: 0, y: 0 }, { x: 1.5, y: 0 });
    expect(doc.history().undoDepth).toBe(1);
    doc.undo();
    expect(state().model.atoms).toHaveLength(0);
  });

  it("counts an import as one step, not one per atom", () => {
    const { doc, state } = editor();
    state().replaceModel({
      atoms: [
        { id: 1, x: 0, y: 0, r: 0.9, el: "C" },
        { id: 2, x: 1.5, y: 0, r: 0.9, el: "O" },
      ],
      bonds: [{ id: 3, a: 1, b: 2, order: 2 }],
    });

    expect(doc.history().undoDepth).toBe(1);
    expect(state().model.atoms).toHaveLength(2);
    // an import asks for a fit
    expect(state().fitNonce).toBe(1);

    doc.undo();
    expect(state().model.atoms).toHaveLength(0);
  });

  it("merges repeated moves of one atom into a single step", () => {
    const { doc, state } = editor();
    const id = state().addAtom(0, 0, "C");
    const before = doc.history().undoDepth;

    state().moveAtom(id, 1, 0);
    state().moveAtom(id, 2, 0);
    state().moveAtom(id, 3, 0);

    expect(doc.history().undoDepth).toBe(before + 1);
    doc.undo();
    expect(state().model.atoms[0]).toMatchObject({ x: 0, y: 0 });
  });

  it("keeps label edits in the document", () => {
    const { doc, state } = editor();
    const id = state().addAtom(0, 0, "C");
    state().beginLabelEdit(id);
    state().setLabelEditValue("O");
    state().commitLabelEdit();

    expect(state().model.atoms[0].el).toBe("O");
    expect(state().labelEdit.active).toBe(false);
    doc.undo();
    expect(state().model.atoms[0].el).toBe("C");
  });

  it("does not record a label edit that changes nothing", () => {
    const { doc, state } = editor();
    const id = state().addAtom(0, 0, "C");
    const before = doc.history().undoDepth;
    state().beginLabelEdit(id);
    state().setLabelEditValue("  ");
    state().commitLabelEdit();
    expect(doc.history().undoDepth).toBe(before);
    expect(state().model.atoms[0].el).toBe("C");
  });

  it("keeps aromatic circles in the document", () => {
    const { doc, state } = editor();
    state().toggleAromatic();
    expect(state().aromaticEnabled).toBe(true);
    state().toggleRing("ring-a");
    expect(state().aromaticRings["ring-a"]).toBe(true);
    doc.undo();
    expect(state().aromaticRings["ring-a"]).toBeFalsy();
  });

  it("leaves hover and gesture state out of the history", () => {
    const { doc, state } = editor();
    const id = state().addAtom(0, 0, "C");
    const depth = doc.history().undoDepth;

    state().setHoveredFromId(id);
    expect(state().hovered.atomId).toBe(id);

    state().beginMoveDrag(id, { x: 1, y: 1 });
    // grabbing an atom drops its hover highlight
    expect(state().hovered.atomId).toBeNull();
    state().updateMovePointer(2, 2);
    state().endMoveDrag();
    state().requestFit();

    // none of that is an edit
    expect(doc.history().undoDepth).toBe(depth);
    expect(doc.history().dirty).toBe(true); // still dirty from the added atom
  });

  it("stops mirroring once disconnected, and catches up when reconnected", () => {
    const { doc, store, disconnect, state } = editor();
    state().addAtom(0, 0, "C");
    disconnect();

    doc.undo();
    // the document moved on, the detached store did not
    expect(doc.getState().model.atoms).toHaveLength(0);
    expect(state().model.atoms).toHaveLength(1);

    // reconnecting (a remount) resyncs rather than leaving a stale canvas
    connectStoreToDocument(store, doc);
    expect(state().model.atoms).toHaveLength(0);
  });
});
