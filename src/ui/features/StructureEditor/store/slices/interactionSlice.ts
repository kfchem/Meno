import { EditorState } from "../types";
import { StoreApi } from "zustand";
import { NOMINAL_BOND_LENGTH } from "../../../../../lib/chem/acs";

type SetState = StoreApi<EditorState>["setState"];
type GetState = StoreApi<EditorState>["getState"];

export function createInteractionSlice(set: SetState, get: GetState) {
  return {
    startExtend: (atomId: number) =>
      set((prev: EditorState) => ({
        ...prev,
        extend: { active: true, atomId, pointer: null, mode: "snap" },
        suppressDblClickUntil: Math.max(
          prev.suppressDblClickUntil,
          (typeof performance !== "undefined"
            ? performance.now()
            : Date.now()) + 120,
        ),
      })),

    updateExtend: (x: number, y: number) =>
      set((prev: EditorState) => ({
        ...prev,
        extend: prev.extend.active
          ? { ...prev.extend, pointer: { x, y } }
          : prev.extend,
      })),

    commitExtend: () => {
      const st = get();
      if (!st.extend.active || st.extend.atomId == null) return;
      const base = st.model.atoms.find((a) => a.id === st.extend.atomId);
      if (!base) {
        set((prev: EditorState) => ({
          ...prev,
          extend: { active: false, atomId: null, pointer: null, mode: "snap" },
          suppressDblClickUntil:
            (typeof performance !== "undefined"
              ? performance.now()
              : Date.now()) + 120,
        }));
        return;
      }
      // Fixed nominal bond length and tolerance
      const L = NOMINAL_BOND_LENGTH;
      const TOL = L * 0.4;
      const step = Math.PI / 6; // 30°
      const px = st.extend.pointer?.x ?? base.x + L;
      const py = st.extend.pointer?.y ?? base.y;
      // 1) Prefer connecting to a nearby existing atom if within tolerance
      if (st.extend.pointer) {
        const nearPtr = get().findAtomNear(px, py, TOL, base.id);
        if (nearPtr != null) {
          get().connectAtoms(base.id, nearPtr, 1);
          set((prev: EditorState) => ({
            ...prev,
            extend: {
              active: false,
              atomId: null,
              pointer: null,
              mode: "snap",
            },
            suppressDblClickUntil:
              (typeof performance !== "undefined"
                ? performance.now()
                : Date.now()) + 120,
          }));
          return;
        }
      }
      // 2) Compute final position for snap/free modes
      let nx: number, ny: number;
      if (st.extend.mode === "free" && st.extend.pointer) {
        // Place exactly at pointer position (no snap, variable length)
        nx = st.extend.pointer.x;
        ny = st.extend.pointer.y;
      } else {
        const ang = Math.atan2(py - base.y, px - base.x);
        const snap = Math.round(ang / step) * step;
        nx = base.x + L * Math.cos(snap);
        ny = base.y + L * Math.sin(snap);
      }
      // 3) Check for nearby atoms again at final position
      const nearId = get().findAtomNear(nx, ny, TOL, base.id);
      if (nearId != null) {
        get().connectAtoms(base.id, nearId, 1);
      } else {
        const nid = get().addAtom(nx, ny, "C", 0.9);
        get().addBond(base.id, nid, 1);
      }
      set((prev: EditorState) => ({
        ...prev,
        extend: { active: false, atomId: null, pointer: null, mode: "snap" },
        suppressDblClickUntil:
          (typeof performance !== "undefined"
            ? performance.now()
            : Date.now()) + 120,
      }));
    },

    cancelExtend: () =>
      set((prev: EditorState) => ({
        ...prev,
        extend: { active: false, atomId: null, pointer: null, mode: "snap" },
        suppressDblClickUntil:
          (typeof performance !== "undefined"
            ? performance.now()
            : Date.now()) + 120,
      })),

    setExtendMode: (mode: "snap" | "free") =>
      set((prev: EditorState) => ({
        ...prev,
        extend: prev.extend.active ? { ...prev.extend, mode } : prev.extend,
      })),

    beginMoveDrag: (
      atomId: number,
      pointer?: { x: number; y: number } | null,
    ) =>
      set((prev: EditorState) => {
        // Clear hover if it currently targets the moving atom or its bonds
        let hovered = prev.hovered;
        if (hovered.atomId === atomId)
          hovered = { atomId: null, bondId: hovered.bondId };
        const bondsOfAtom = new Set(
          prev.model.bonds
            .filter((b) => b.a === atomId || b.b === atomId)
            .map((b) => b.id),
        );
        if (hovered.bondId != null && bondsOfAtom.has(hovered.bondId)) {
          hovered = { atomId: hovered.atomId, bondId: null };
        }
        return {
          ...prev,
          moveDrag: {
            active: true,
            atomId,
            pointer: pointer ?? null,
            mode: "snap",
          },
          hovered,
        };
      }),

    updateMovePointer: (x: number, y: number) =>
      set((prev: EditorState) => ({
        ...prev,
        moveDrag: prev.moveDrag.active
          ? { ...prev.moveDrag, pointer: { x, y } }
          : prev.moveDrag,
      })),

    setMoveMode: (mode: "snap" | "free") =>
      set((prev: EditorState) => ({
        ...prev,
        moveDrag: prev.moveDrag.active
          ? { ...prev.moveDrag, mode }
          : prev.moveDrag,
      })),

    endMoveDrag: () =>
      set((prev: EditorState) => ({
        ...prev,
        moveDrag: { active: false, atomId: null, pointer: null, mode: "snap" },
      })),

    beginPanHold: (pointerId: number | null) =>
      set((prev: EditorState) => ({
        ...prev,
        panHold: { active: true, pointerId: pointerId ?? null },
      })),

    endPanHold: (pointerId?: number | null) =>
      set((prev: EditorState) => {
        if (!prev.panHold.active) return prev;
        if (
          pointerId == null ||
          prev.panHold.pointerId == null ||
          prev.panHold.pointerId === pointerId
        ) {
          return { ...prev, panHold: { active: false, pointerId: null } };
        }
        return prev;
      }),
  };
}
