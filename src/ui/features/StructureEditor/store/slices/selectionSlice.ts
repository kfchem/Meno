import { EditorState, type Sel } from "../types";
import { StoreApi } from "zustand";
import { fragmentOf } from "../../chem/cleanUp";
import { pathBetween } from "../../utils/selection";

type SetState = StoreApi<EditorState>["setState"];

const none = (): Sel => ({ atoms: new Set(), bonds: new Set() });

/**
 * What is selected, and the last atom chosen - where a Shift+click's path
 * starts from. The selection is the view's, not the document's: it is not
 * undone, and it forgets what an edit takes away (modelSlice).
 */
export function createSelectionSlice(set: SetState) {
  return {
    setSel: (sel: Sel, anchor: number | null = null) =>
      set((prev: EditorState) => ({ ...prev, sel, selAnchor: anchor })),

    /** An atom added to the selection, or taken out of it (Ctrl or ⌘ and a click). */
    toggleAtomSel: (id: number) =>
      set((prev: EditorState) => {
        const atoms = new Set(prev.sel.atoms);
        const bonds = new Set(prev.sel.bonds);
        if (atoms.has(id)) {
          atoms.delete(id);
          // (a bond goes with either of its atoms)
          for (const b of prev.model.bonds) if (b.a === id || b.b === id) bonds.delete(b.id);
        } else {
          atoms.add(id);
        }
        return { ...prev, sel: { atoms, bonds }, selAnchor: atoms.has(id) ? id : prev.selAnchor };
      }),

    /** A bond added to the selection with its atoms, or taken out of it. */
    toggleBondSel: (id: number) =>
      set((prev: EditorState) => {
        const bond = prev.model.bonds.find((b) => b.id === id);
        if (!bond) return prev;
        const atoms = new Set(prev.sel.atoms);
        const bonds = new Set(prev.sel.bonds);
        if (bonds.has(id)) bonds.delete(id);
        else {
          bonds.add(id);
          atoms.add(bond.a);
          atoms.add(bond.b);
        }
        return { ...prev, sel: { atoms, bonds } };
      }),

    /** Everything along the bonds from the last atom chosen to this one, added (Shift and a click). */
    selectPathTo: (id: number) =>
      set((prev: EditorState) => {
        const from = prev.selAnchor;
        const path = from != null ? pathBetween(prev.model, from, id) : null;
        const add = path ?? { atoms: new Set([id]), bonds: new Set<number>() };
        return {
          ...prev,
          sel: {
            atoms: new Set([...prev.sel.atoms, ...add.atoms]),
            bonds: new Set([...prev.sel.bonds, ...add.bonds]),
          },
          selAnchor: id,
        };
      }),

    /** A whole structure: every atom bonded to this one, however far along, and their bonds. */
    selectStructure: (id: number) =>
      set((prev: EditorState) => {
        const atoms = fragmentOf(prev.model, id);
        const bonds = new Set(prev.model.bonds.filter((b) => atoms.has(b.a)).map((b) => b.id));
        return { ...prev, sel: { atoms, bonds }, selAnchor: id };
      }),

    /** Everything on the canvas, the molecules in 3D with it. */
    selectAll: () =>
      set((prev: EditorState) => ({
        ...prev,
        sel: { atoms: new Set(prev.model.atoms.map((a) => a.id)), bonds: new Set(prev.model.bonds.map((b) => b.id)) },
        sel3d: new Set(prev.molecules3d.map((m) => m.id)),
      })),

    /** Nothing selected, and no atom of a molecule in 3D chosen. */
    clearSel: () =>
      set((prev: EditorState) =>
        prev.sel.atoms.size || prev.sel.bonds.size || prev.sel3d.size || prev.chosen3d
          ? { ...prev, sel: none(), selAnchor: null, sel3d: new Set<number>(), chosen3d: null }
          : prev,
      ),

    setBoxSelect: (box: EditorState["boxSelect"]) => set((prev: EditorState) => ({ ...prev, boxSelect: box })),
  };
}
