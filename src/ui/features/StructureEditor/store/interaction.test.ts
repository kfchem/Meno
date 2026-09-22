import { describe, expect, it } from "vitest";
import { createEditorStore } from ".";
import { createStructureDocument } from "../document";

describe("move drag preview", () => {
  const withDraggedAtom = () => {
    const store = createEditorStore(createStructureDocument());
    const id = store.getState().addAtom(0, 0, "O");
    store.getState().beginMoveDrag(id, { x: 1, y: 1 });
    return { store, id };
  };

  it("starts at the grab point", () => {
    const { store, id } = withDraggedAtom();
    expect(store.getState().moveDrag.atomId).toBe(id);
    expect(store.getState().moveDrag.preview).toEqual({ x: 1, y: 1 });
  });

  it("follows the snapped preview position", () => {
    const { store } = withDraggedAtom();
    store.getState().setMoveDragPreview(2.5, -3);
    expect(store.getState().moveDrag.preview).toEqual({ x: 2.5, y: -3 });
  });

  it("ignores movement too small to see", () => {
    const { store } = withDraggedAtom();
    store.getState().setMoveDragPreview(2, 2);
    const before = store.getState().moveDrag;
    store.getState().setMoveDragPreview(2 + 1e-6, 2 - 1e-6);
    // same object: no re-render for sub-pixel jitter
    expect(store.getState().moveDrag).toBe(before);
  });

  it("is dropped when the drag ends", () => {
    const { store } = withDraggedAtom();
    store.getState().setMoveDragPreview(4, 4);
    store.getState().endMoveDrag();
    expect(store.getState().moveDrag.active).toBe(false);
    expect(store.getState().moveDrag.preview).toBeNull();
  });

  it("does nothing when no atom is being dragged", () => {
    const store = createEditorStore(createStructureDocument());
    const before = store.getState().moveDrag;
    store.getState().setMoveDragPreview(5, 5);
    expect(store.getState().moveDrag).toBe(before);
  });
});
