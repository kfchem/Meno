import type { StoreApi } from "zustand";
import type { DocumentStore } from "../../../../../lib/doc";
import * as ops from "../../document";
import type { StructureDocument } from "../../document";
import type { EditorState, Turn3D } from "../types";

type SetState = StoreApi<EditorState>["setState"];

/**
 * Molecules in 3D on the page: where they stand is the document's, and is
 * undone; how they are turned and which is under the pointer are the view's.
 */
export function createMolecules3dSlice(doc: DocumentStore<StructureDocument>, set: SetState) {
  return {
    setHovered3d: (h: { id: number; part: "body" | "edge" } | null) =>
      set((prev) =>
        prev.hovered3d?.id === h?.id && prev.hovered3d?.part === h?.part ? prev : { ...prev, hovered3d: h },
      ),
    setTurn3d: (id: number, turn: Turn3D) =>
      set((prev) => ({ ...prev, turns3d: { ...prev.turns3d, [id]: turn } })),
    moveMolecule3d: (id: number, at: { x: number; y: number }, gesture?: string) => {
      doc.edit("move molecule", (d) => ops.moveMolecule3d(d, id, at), gesture ? { coalesceKey: gesture } : undefined);
    },
    removeMolecule3d: (id: number) => {
      doc.edit("delete molecule", (d) => ops.removeMolecule3d(d, id));
      set((prev) => {
        const { [id]: _gone, ...turns3d } = prev.turns3d;
        return { ...prev, turns3d, hovered3d: prev.hovered3d?.id === id ? null : prev.hovered3d };
      });
    },
  };
}
