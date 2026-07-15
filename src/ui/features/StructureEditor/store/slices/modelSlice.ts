import { NOMINAL_BOND_LENGTH } from "../../../../../lib/chem/acs";
import { EditorState, Bond, Atom, Arrow, Model } from "../types";
import { StoreApi } from "zustand";

type SetState = StoreApi<EditorState>["setState"];
type GetState = StoreApi<EditorState>["getState"];

export const createModelSlice = (set: SetState, get: GetState) => ({
  addAtom: (x: number, y: number, el: string = "C", r: number = 0.9) => {
    const id = get().nextId;
    set((prev: EditorState) => ({
      ...prev,
      nextId: id + 1,
      model: {
        atoms: [...prev.model.atoms, { id, x, y, r, el }],
        bonds: prev.model.bonds,
      },
    }));
    return id;
  },

  addBond: (a: number, b: number, order: Bond["order"] = 1) => {
    const id = get().nextId;
    set((prev: EditorState) => ({
      ...prev,
      nextId: id + 1,
      model: {
        atoms: prev.model.atoms,
        bonds: [
          ...prev.model.bonds,
          { id, a, b, order, stereo: "none", stereoOrient: "principle" },
        ],
      },
    }));
    return id;
  },

  connectAtoms: (
    a: number,
    b: number,
    order: Bond["order"] = 1,
  ): number | null => {
    const st = get();
    if (a === b) return null;
    // avoid duplicate bonds
    const has = st.model.bonds.some(
      (bb) => (bb.a === a && bb.b === b) || (bb.a === b && bb.b === a),
    );
    if (has) return null;
    return get().addBond(a, b, order);
  },

  replaceDraggedAtomWith: (movingId: number, targetId: number) =>
    set((prev: EditorState) => {
      if (movingId === targetId) return prev;
      // Rewire bonds connected to movingId to targetId, avoid duplicates & self-loops
      const bonds: Bond[] = [];
      for (const b of prev.model.bonds) {
        if (b.a === movingId && b.b === targetId) continue; // dup
        if (b.b === movingId && b.a === targetId) continue; // dup
        if (b.a === movingId && b.b !== targetId) {
          const exists = prev.model.bonds.some(
            (bb) =>
              (bb.a === targetId && bb.b === b.b) ||
              (bb.b === targetId && bb.a === b.b),
          );
          if (!exists && targetId !== b.b) bonds.push({ ...b, a: targetId });
          continue;
        }
        if (b.b === movingId && b.a !== targetId) {
          const exists = prev.model.bonds.some(
            (bb) =>
              (bb.a === targetId && bb.b === b.a) ||
              (bb.b === targetId && bb.a === b.a),
          );
          if (!exists && targetId !== b.a) bonds.push({ ...b, b: targetId });
          continue;
        }
        bonds.push(b);
      }
      // Remove moving atom
      const atoms = prev.model.atoms.filter((a) => a.id !== movingId);
      return { ...prev, model: { atoms, bonds } };
    }),

  findAtomNear: (
    x: number,
    y: number,
    tol: number = NOMINAL_BOND_LENGTH * 0.3,
    excludeId: number | null = null,
  ): number | null => {
    const st = get();
    let best: { id: number; d: number } | null = null;
    for (const a of st.model.atoms) {
      if (excludeId != null && a.id === excludeId) continue;
      const d = Math.hypot(x - a.x, y - a.y);
      if (d <= tol && (!best || d < best.d)) best = { id: a.id, d };
    }
    return best ? best.id : null;
  },

  moveAtom: (id: number, x: number, y: number) =>
    set((prev: EditorState) => ({
      ...prev,
      model: {
        atoms: prev.model.atoms.map((a) => (a.id === id ? { ...a, x, y } : a)),
        bonds: prev.model.bonds,
      },
    })),

  updateBond: (id: number, patch: Partial<Bond>) =>
    set((prev: EditorState) => ({
      ...prev,
      model: {
        atoms: prev.model.atoms,
        bonds: prev.model.bonds.map((b) =>
          b.id === id ? { ...b, ...patch } : b,
        ),
      },
    })),

  setBondOrder: (id: number, order: Bond["order"]) =>
    set((prev: EditorState) => ({
      ...prev,
      model: {
        atoms: prev.model.atoms,
        bonds: prev.model.bonds.map((b) => (b.id === id ? { ...b, order } : b)),
      },
    })),

  setBondDoubleMode: (id: number, mode: NonNullable<Bond["doubleMode"]>) =>
    set((prev: EditorState) => ({
      ...prev,
      model: {
        atoms: prev.model.atoms,
        bonds: prev.model.bonds.map((b) =>
          b.id === id ? { ...b, doubleMode: mode } : b,
        ),
      },
    })),

  setBondStereo: (id: number, stereo: NonNullable<Bond["stereo"]>) =>
    set((prev: EditorState) => ({
      ...prev,
      model: {
        atoms: prev.model.atoms,
        bonds: prev.model.bonds.map((b) =>
          b.id === id ? { ...b, stereo } : b,
        ),
      },
    })),

  setBondStereoOrient: (
    id: number,
    orient: NonNullable<Bond["stereoOrient"]>,
  ) =>
    set((prev: EditorState) => ({
      ...prev,
      model: {
        atoms: prev.model.atoms,
        bonds: prev.model.bonds.map((b) =>
          b.id === id ? { ...b, stereoOrient: orient } : b,
        ),
      },
    })),

  replaceModel: (next: Model) =>
    set((prev: EditorState) => {
      const maxId = Math.max(
        0,
        ...next.atoms.map((a) => a.id || 0),
        ...next.bonds.map((b) => b.id || 0),
      );
      return {
        ...prev,
        model: { atoms: next.atoms.slice(), bonds: next.bonds.slice() },
        arrows: [],
        nextArrowId: 1,
        sel: { atoms: new Set(), bonds: new Set() },
        hovered: { atomId: null, bondId: null },
        labelEdit: { active: false, atomId: null, value: "", autoCap: true },
        moveDrag: { active: false, atomId: null, pointer: null },
        extend: { active: false, atomId: null, pointer: null, mode: "snap" },
        aromaticEnabled: false,
        aromaticRings: {},
        nextId: Math.max(1, maxId + 1),
        // Always trigger fit
        fitNonce: prev.fitNonce + 1,
      };
    }),

  appendModel: (next: Model) =>
    set((prev: EditorState) => {
      const idMap = new Map<number, number>();
      let cur = prev.nextId;
      const newAtoms = next.atoms.map((a) => {
        const nid = cur++;
        idMap.set(a.id, nid);
        return { id: nid, x: a.x, y: a.y, r: a.r, el: a.el } as Atom;
      });
      const newBonds = next.bonds.map((b) => {
        const a = idMap.get(b.a) ?? b.a;
        const c = idMap.get(b.b) ?? b.b;
        const nid = cur++;
        return {
          id: nid,
          a,
          b: c,
          order: b.order as 1 | 2 | 3,
          stereo: (b as any).stereo ?? "none",
        } as Bond;
      });
      return {
        ...prev,
        nextId: cur,
        model: {
          atoms: [...prev.model.atoms, ...newAtoms],
          bonds: [...prev.model.bonds, ...newBonds],
        },
        hovered: { atomId: null, bondId: null },
        // Trigger fit after append as well
        fitNonce: prev.fitNonce + 1,
      };
    }),

  addArrow: (
    x: number,
    y: number,
    angle: number = 0,
    length: number = NOMINAL_BOND_LENGTH * 4,
  ) => {
    let newId = 0;
    set((prev: EditorState) => {
      const id = prev.nextArrowId;
      newId = id;
      const arrow: Arrow = { id, x, y, angle, length };
      return {
        ...prev,
        nextArrowId: id + 1,
        arrows: [...prev.arrows, arrow],
      };
    });
    return newId;
  },

  updateArrow: (id: number, patch: Partial<Arrow>) =>
    set((prev: EditorState) => ({
      ...prev,
      arrows: prev.arrows.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    })),

  removeArrow: (id: number) =>
    set((prev: EditorState) => ({
      ...prev,
      arrows: prev.arrows.filter((a) => a.id !== id),
    })),
});
