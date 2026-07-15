import { EditorState } from "../types";
import { StoreApi } from "zustand";

type SetState = StoreApi<EditorState>["setState"];

export function createHoverSlice(set: SetState) {
  return {
    setHoveredFromId: (id: number) =>
      set((prev: EditorState) => {
        if (!id) return { ...prev, hovered: { atomId: null, bondId: null } };
        // Suppress hover on the moving atom and bonds directly connected to it
        const movingId = prev.moveDrag.active ? prev.moveDrag.atomId : null;
        if (movingId != null) {
          const isMovingAtom = prev.model.atoms.some(
            (a) => a.id === id && a.id === movingId,
          );
          if (isMovingAtom) return prev;
          const isMovingBond = prev.model.bonds.some(
            (b) => b.id === id && (b.a === movingId || b.b === movingId),
          );
          if (isMovingBond) return prev;
        }
        const isAtom = prev.model.atoms.some((a) => a.id === id);
        const isBond = !isAtom && prev.model.bonds.some((b) => b.id === id);
        return {
          ...prev,
          hovered: {
            atomId: isAtom ? id : null,
            bondId: isBond ? id : null,
          },
        };
      }),

    clearHovered: () =>
      set((prev: EditorState) => ({
        ...prev,
        hovered: { atomId: null, bondId: null },
      })),

    clearAtomHover: () =>
      set((prev: EditorState) => ({
        ...prev,
        hovered: { atomId: null, bondId: prev.hovered.bondId },
      })),

    clearBondHover: () =>
      set((prev: EditorState) => ({
        ...prev,
        hovered: { atomId: prev.hovered.atomId, bondId: null },
      })),

    triggerHoverPulse: (bondId: number) =>
      set((prev: EditorState) => ({
        ...prev,
        hoverPulse: {
          id: bondId,
          nonce: prev.hoverPulse.nonce + 1,
          until:
            (typeof performance !== "undefined"
              ? performance.now()
              : Date.now()) + 140,
        },
      })),
  };
}
