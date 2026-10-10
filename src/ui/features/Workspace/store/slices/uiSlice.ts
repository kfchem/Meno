import type { DocumentStore } from "../../../../../lib/doc";
import * as ops from "../../document";
import type { WorkspaceDocument } from "../../document";
import { EditorState } from "../types";
import { StoreApi } from "zustand";
import type { StyleChoice } from "../../../../../lib/chem/style";
import { isElementSymbol } from "../../../../../lib/roles/molblock";
import { labelTextOf, readLabel } from "../../utils/labelTyping";

type SetState = StoreApi<EditorState>["setState"];
type GetState = StoreApi<EditorState>["getState"];

/** How many label edits have begun: each its own number. */
let labelEdits = 0;

export function createUiSlice(
  doc: DocumentStore<WorkspaceDocument>,
  set: SetState,
  get: GetState,
) {
  return {
    setCover: (px: number) => {
      if (Math.abs(get().cover - px) > 0.25) set({ cover: px });
    },
    markSavedAs: (path: string) => {
      set((prev: EditorState) => ({ ...prev, savedPath: path }));
      doc.markSaved();
    },
    markOpenedOver: (name: string) =>
      set((prev: EditorState) => ({ ...prev, savedPath: null, openedName: name })),

    beginLabelEdit: (atomId: number, initial = "", forceLower = false) =>
      set((prev: EditorState) => {
        const base = prev.model.atoms.find((a) => a.id === atomId);
        // (with its charge and mass number, as they are typed: N+, 13C)
        const start = initial.length ? initial : base ? labelTextOf(base) : "";
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
            opened: { at: typeof performance !== "undefined" ? performance.now() : Date.now(), value: val },
            n: ++labelEdits,
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
      // (full-width letters, from an input method, as the ordinary ones)
      const value = labelEdit.value.normalize("NFKC").trim();
      // An empty input keeps the current label.
      // An element with a charge, or a charge alone, sets the atom's
      // chemistry (labelTyping); anything else is a label as typed.
      const atom = get().model.atoms.find((a) => a.id === id);
      let changed = false;
      if (value && atom) {
        const read = readLabel(value, isElementSymbol);
        const chem =
          read.kind === "charge"
            ? { ...atom, charge: read.charge }
            : read.kind === "element"
              ? {
                  el: read.el,
                  charge: read.charge,
                  isotope: read.isotope,
                  // (an unpaired electron stays with its element)
                  radical: read.el === atom.el ? atom.radical : undefined,
                }
              : // R1, R2: an Rgroup, drawn R¹ (IUPAC GR-9.1)
                /^R\d+$/.test(read.el)
                ? { el: "R#", rgroups: [Number.parseInt(read.el.slice(1), 10)] }
                : { el: read.el };
        changed = doc.edit("rename atom", (d) => ops.setAtomChemistry(d, id, chem));
      }
      set((prev: EditorState) => ({
        ...prev,
        labelEdit: { active: false, atomId: null, value: "", autoCap: true },
        // (written anew: drawn as written until the drawing's own label is)
        labelLeft: changed && labelEdit.n != null ? { atomId: id, n: labelEdit.n, text: value } : prev.labelLeft,
      }));
    },

    labelShown: () => set((prev: EditorState) => (prev.labelLeft ? { ...prev, labelLeft: null } : prev)),

    cancelLabelEdit: () =>
      set((prev: EditorState) => ({
        ...prev,
        labelEdit: { active: false, atomId: null, value: "", autoCap: true },
      })),

    setAromaticEnabled: (v: boolean) => {
      doc.edit("aromatic circles", (d) => ops.setAromaticEnabled(d, v));
    },

    setDocumentStyle: (style: StyleChoice | undefined, coalesceKey?: string) => {
      doc.edit("drawing style", (d) => ops.setDocumentStyle(d, style), {
        coalesceKey,
      });
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
