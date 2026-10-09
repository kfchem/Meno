import type { StoreApi } from "zustand";
import type { DocumentStore } from "../../../../../lib/doc";
import * as ops from "../../document";
import type { StructureDocument } from "../../document";
import type { EditorState } from "../types";

type SetState = StoreApi<EditorState>["setState"];

/**
 * The texts the workspace holds: edits to the document, so that undo takes
 * them back and Save keeps them; which one its column shows is the view's
 * (store/index brings it along as they come and go).
 */
export function createTextsSlice(doc: DocumentStore<StructureDocument>, set: SetState) {
  return {
    addTexts: (texts: Parameters<EditorState["addTexts"]>[0]) => {
      if (!texts.length) return;
      const { doc: next, last } = ops.addTexts(doc.getState(), texts);
      if (next !== doc.getState()) doc.edit(texts.length > 1 ? "open texts" : "open text", () => next);
      set({ textShown: last, textsOpen: last != null });
    },
    editText: (id: number, text: string) =>
      doc.edit("type text", (d) => ops.editText(d, id, text), { coalesceKey: `text:${id}` }),
    removeText: (id: number) => doc.edit("close text", (d) => ops.removeText(d, id)),
    showText: (id: number) => set({ textShown: id, textsOpen: true, pdfShown: null }),
    closeTexts: () =>
      set((prev: EditorState) => {
        // (a PDF shown: its page goes back down to it on the page as the column shuts - docs/PDF.md)
        const pdf = prev.textsOpen && prev.pdfShown != null ? prev.pdfs.find((p) => p.id === prev.pdfShown) : undefined;
        return { ...prev, textsOpen: false, ...(pdf ? { pdfFlight: { id: pdf.id, page: pdf.page, to: "page" as const, start: performance.now() } } : {}) };
      }),
  };
}
