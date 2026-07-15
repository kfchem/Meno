import { EditorState } from "../types";
import { StoreApi } from "zustand";

type SetState = StoreApi<EditorState>["setState"];

export function createUiSlice(set: SetState) {
  return {
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

    commitLabelEdit: () =>
      set((prev: EditorState) => {
        if (!prev.labelEdit.active || prev.labelEdit.atomId == null)
          return prev;
        const id = prev.labelEdit.atomId;
        const value = prev.labelEdit.value.trim();
        const atoms = prev.model.atoms.map((a) =>
          a.id === id ? { ...a, el: value || a.el } : a,
        );
        return {
          ...prev,
          model: { atoms, bonds: prev.model.bonds },
          labelEdit: { active: false, atomId: null, value: "", autoCap: true },
        };
      }),

    cancelLabelEdit: () =>
      set((prev: EditorState) => ({
        ...prev,
        labelEdit: { active: false, atomId: null, value: "", autoCap: true },
      })),

    setAromaticEnabled: (v: boolean) =>
      set((prev: EditorState) => ({ ...prev, aromaticEnabled: v })),

    toggleAromatic: () =>
      set((prev: EditorState) => ({
        ...prev,
        aromaticEnabled: !prev.aromaticEnabled,
      })),

    setRingEnabled: (key: string, v: boolean) =>
      set((prev: EditorState) => ({
        ...prev,
        aromaticRings: { ...prev.aromaticRings, [key]: v },
      })),

    toggleRing: (key: string) =>
      set((prev: EditorState) => ({
        ...prev,
        aromaticRings: {
          ...prev.aromaticRings,
          [key]: !prev.aromaticRings[key],
        },
      })),

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
