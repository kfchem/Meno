import type { StoreApi } from "zustand";
import type { DocumentStore } from "../../../../../lib/doc";
import * as ops from "../../document";
import type { StructureDocument } from "../../document";
import type { EditorState, WordsFrom } from "../types";

type SetState = StoreApi<EditorState>["setState"];

/**
 * Words on the page (lib/chem/captions): edits to the document, so that
 * undo takes them back and Save keeps them; which are under the pointer,
 * being written, and the icons a double-click opens, the view's.
 */
export function createCaptionsSlice(doc: DocumentStore<StructureDocument>, set: SetState) {
  return {
    setHoveredCaption: (id: number | null) => set({ hoveredCaption: id }),
    setCaptionEdit: (edit: EditorState["captionEdit"]) => set({ captionEdit: edit }),
    setQuickAdd: (q: EditorState["quickAdd"]) => set({ quickAdd: q }),
    addCaption: (text: string, x: number, y: number, arrow?: number, from?: WordsFrom) => {
      const id = doc.getState().nextCaptionId ?? 1;
      doc.edit("add text", (d) => ops.addCaption(d, { text, x, y, ...(arrow != null ? { arrow } : {}), ...(from ? { from } : {}) }));
      return id;
    },
    updateCaption: (id: number, patch: Parameters<EditorState["updateCaption"]>[1], gesture?: string) =>
      doc.edit(
        patch.text != null ? "edit text" : patch.width !== undefined ? "resize text" : patch.align !== undefined ? "align text" : "move text",
        (d) => ops.updateCaption(d, id, patch),
        {
          ...(gesture ? { coalesceKey: `caption:${id}:${gesture}` } : {}),
        },
      ),
    removeCaption: (id: number) => {
      if (doc.edit("delete text", (d) => ops.removeCaption(d, id))) set((prev: EditorState) => ({ ...prev, hoveredCaption: prev.hoveredCaption === id ? null : prev.hoveredCaption }));
    },
  };
}
