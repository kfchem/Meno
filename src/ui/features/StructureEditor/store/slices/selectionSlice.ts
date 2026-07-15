import { EditorState } from "../types";
import { StoreApi } from "zustand";

type SetState = StoreApi<EditorState>["setState"];

export function createSelectionSlice(set: SetState) {
  return {
    toggleAtomSel: (id: number, multi?: boolean) =>
      set((prev: EditorState) => {
        if (!multi)
          return { ...prev, sel: { atoms: new Set([id]), bonds: new Set() } };
        const atoms = new Set(prev.sel.atoms);
        atoms.has(id) ? atoms.delete(id) : atoms.add(id);
        return { ...prev, sel: { atoms, bonds: new Set(prev.sel.bonds) } };
      }),

    clearSel: () =>
      set((prev: EditorState) => ({
        ...prev,
        sel: { atoms: new Set(), bonds: new Set() },
      })),
  };
}
