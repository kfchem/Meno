import type { StoreApi } from "zustand";
import type { DocumentStore } from "../../../../../lib/doc";
import * as ops from "../../document";
import type { StructureDocument } from "../../document";
import type { EditorState } from "../types";

type SetState = StoreApi<EditorState>["setState"];

/**
 * PDFs on the page (docs/PDF.md): edits to the document, so that undo takes
 * them back and Save keeps them; which is under the pointer, the view's.
 */
export function createPdfsSlice(doc: DocumentStore<StructureDocument>, set: SetState) {
  return {
    setHoveredPdf: (id: number | null) => set({ hoveredPdf: id }),
    addPdfs: (pdfs: Parameters<EditorState["addPdfs"]>[0], at: { x: number; y: number }) => {
      const row = ops.pdfsInRow(pdfs, at);
      if (row.length) doc.edit(row.length > 1 ? "add PDFs" : "add PDF", (d) => row.reduce(ops.addPdf, d));
    },
    movePdf: (id: number, x: number, y: number, gesture?: string) =>
      doc.edit("move PDF", (d) => ops.updatePdf(d, id, { x, y }), { ...(gesture ? { coalesceKey: `pdf:${id}:${gesture}` } : {}) }),
    turnPdf: (id: number, page: number) => doc.edit("turn page", (d) => ops.updatePdf(d, id, { page })),
    spreadPdf: (id: number, spread: boolean) => doc.edit(spread ? "spread pages" : "gather pages", (d) => ops.updatePdf(d, id, { spread })),
    removePdf: (id: number) => {
      if (doc.edit("delete PDF", (d) => ops.removePdf(d, id))) set((prev: EditorState) => ({ ...prev, hoveredPdf: prev.hoveredPdf === id ? null : prev.hoveredPdf }));
    },
  };
}
