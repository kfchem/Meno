import type { DocumentStore } from "../../../../../lib/doc";
import * as ops from "../../document";
import type { StructureDocument } from "../../document";
import { EditorState } from "../types";
import { StoreApi } from "zustand";

type SetState = StoreApi<EditorState>["setState"];
type GetState = StoreApi<EditorState>["getState"];

export function createUiSlice(
  doc: DocumentStore<StructureDocument>,
  set: SetState,
  get: GetState,
) {
  return {
    markSavedAs: (path: string) => {
      set((prev: EditorState) => ({ ...prev, savedPath: path }));
      doc.markSaved();
    },

    beginLabelEdit: (atomId: number, initial = "", forceLower = false) =>
      set((prev: EditorState) => {
        const base = prev.model.atoms.find((a) => a.id === atomId);
        const start = initial.length
          ? initial
          : base?.el === "C"
            ? ""
            : (base?.el ?? "");
        const autoCap = !forceLower;
        const val = start.length
          ? autoCap
            ? start[0].toUpperCase() + start.slice(1)
            : start
          : "";
        return {
          ...prev,
          labelEdit: {
            active: true,
            atomId,
            value: val,
            autoCap,
          },
        };
      }),

    setLabelEditValue: (value: string) =>
      set((prev: EditorState) => {
        const autoCap = prev.labelEdit.autoCap && value.length > 0;
        return {
          ...prev,
          labelEdit: { ...prev.labelEdit, value, autoCap },
        };
      }),

    commitLabelEdit: () => {
      const { labelEdit } = get();
      if (!labelEdit.active || labelEdit.atomId == null) return;
      const id = labelEdit.atomId;
      const value = labelEdit.value.trim();
      // An empty input keeps the current label.
      if (value) doc.edit("rename atom", (d) => ops.setAtomLabel(d, id, value));
      set((prev: EditorState) => ({
        ...prev,
        labelEdit: { active: false, atomId: null, value: "", autoCap: true },
      }));
    },

    cancelLabelEdit: () =>
      set((prev: EditorState) => ({
        ...prev,
        labelEdit: { active: false, atomId: null, value: "", autoCap: true },
      })),

    setAromaticEnabled: (v: boolean) => {
      doc.edit("aromatic circles", (d) => ops.setAromaticEnabled(d, v));
    },

    toggleAromatic: () => {
      doc.edit("aromatic circles", (d) =>
        ops.setAromaticEnabled(d, !d.aromaticEnabled),
      );
    },

    setRingEnabled: (key: string, v: boolean) => {
      doc.edit("aromatic circle", (d) => ops.setRingEnabled(d, key, v));
    },

    toggleRing: (key: string) => {
      doc.edit("aromatic circle", (d) =>
        ops.setRingEnabled(d, key, !d.aromaticRings[key]),
      );
    },

    requestFit: () =>
      set((prev: EditorState) => ({ ...prev, fitNonce: prev.fitNonce + 1 })),

    beginAutoFitSuspend: () =>
      set((prev: EditorState) => ({ ...prev, autoFitSuspended: true })),

    endAutoFitSuspend: () =>
      set((prev: EditorState) => ({ ...prev, autoFitSuspended: false })),

    suppressDoubleClick: (ms = 120) =>
      set((prev: EditorState) => ({
        ...prev,
        suppressDblClickUntil: Math.max(
          prev.suppressDblClickUntil,
          (typeof performance !== "undefined"
            ? performance.now()
            : Date.now()) + ms,
        ),
      })),
  };
}
