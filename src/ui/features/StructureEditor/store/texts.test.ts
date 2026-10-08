import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createStructureDocument, isBlankDocument } from "../document";

/** Store wired to a document, the way a structure tab is put together. */
function editor(data?: unknown) {
  const doc = createStructureDocument(data);
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, state: () => store.getState() };
}

describe("the texts a workspace holds", () => {
  it("are added as one step, shown in their column - one held already shown, not added again", () => {
    const { doc, state } = editor();
    state().addTexts([
      { name: "a.inp", text: "a", path: "/w/a.inp" },
      { name: "b.txt", text: "b" },
    ]);
    expect(state().texts.map((t) => t.name)).toEqual(["a.inp", "b.txt"]);
    expect(state().texts[0].path).toBe("/w/a.inp");
    expect(state().textShown).toBe(state().texts[1].id);
    expect(state().textsOpen).toBe(true);
    expect(doc.history()).toMatchObject({ undoDepth: 1, dirty: true });
    state().addTexts([{ name: "a.inp", text: "a" }]);
    expect(state().texts).toHaveLength(2);
    expect(state().textShown).toBe(state().texts[0].id);
    expect(doc.history().undoDepth).toBe(1);
    // (a new one, with no name, named)
    state().addTexts([{ name: "", text: "" }]);
    expect(state().texts[2].name).toBe("Untitled.txt");
  });

  it("are edited in the document, a run of typing one step", () => {
    const { doc, state } = editor();
    state().addTexts([{ name: "a.txt", text: "" }]);
    const id = state().texts[0].id;
    for (const typed of ["h", "he", "hel"]) state().editText(id, typed);
    expect(state().texts[0].text).toBe("hel");
    expect(doc.history().undoDepth).toBe(2);
    doc.undo();
    expect(state().texts[0].text).toBe("");
  });

  it("close, the column closing with the last; an undo brings one back, shown", () => {
    const { doc, state } = editor();
    state().addTexts([{ name: "a.txt", text: "a" }]);
    const id = state().texts[0].id;
    state().removeText(id);
    expect(state().texts).toEqual([]);
    expect(state().textsOpen).toBe(false);
    doc.undo();
    expect(state().texts.map((t) => t.id)).toEqual([id]);
    expect(state().textShown).toBe(id);
    expect(state().textsOpen).toBe(true);
  });

  it("stay as the column is hidden, and show again as it was", () => {
    const { state } = editor();
    state().addTexts([{ name: "a.txt", text: "a" }, { name: "b.txt", text: "b" }]);
    const first = state().texts[0].id;
    state().showText(first);
    state().closeTexts();
    expect(state().textsOpen).toBe(false);
    expect(state().textShown).toBe(first);
    state().showText(first);
    expect(state().textsOpen).toBe(true);
  });

  it("are what a canvas opened for them starts with: shown, nothing to undo, nothing unsaved", () => {
    const { doc, state } = editor({ texts: [{ name: "run.py", text: "print(1)\n", path: "/w/run.py" }, { name: 3 }] });
    expect(state().texts).toEqual([{ id: 1, name: "run.py", text: "print(1)\n", path: "/w/run.py" }]);
    expect(state().textShown).toBe(1);
    expect(state().textsOpen).toBe(true);
    expect(doc.history()).toMatchObject({ undoDepth: 0, dirty: false });
  });

  it("keep a canvas from being blank, as a molecule in 3D does", () => {
    const { doc, state } = editor();
    expect(isBlankDocument(doc.getState())).toBe(true);
    state().addTexts([{ name: "a.txt", text: "" }]);
    expect(isBlankDocument(doc.getState())).toBe(false);
    const solid = editor();
    solid.state().pasteModel({ atoms: [], bonds: [], molecules3d: [{ atoms: [{ el: "He", x: 0, y: 0, z: 0 }], bonds: [], at: { x: 0, y: 0 } } as never] });
    expect(isBlankDocument(solid.doc.getState())).toBe(false);
  });
});
