import { NOMINAL_BOND_LENGTH } from "../../../../../lib/chem/acs";
import type { DocumentStore } from "../../../../../lib/doc";
import * as ops from "../../document";
import type { ImportedArrow, StructureDocument } from "../../document";
import { EditorState, Bond, Arrow, Model } from "../types";
import { StoreApi } from "zustand";

type SetState = StoreApi<EditorState>["setState"];
type GetState = StoreApi<EditorState>["getState"];

/**
 * After a deletion, nothing is under the pointer until it moves again, and
 * the selection holds only what is still there. The view stays where it is.
 */
function forgetDeleted(set: SetState) {
  set((prev: EditorState) => {
    const atoms = new Set(prev.model.atoms.map((a) => a.id));
    const bonds = new Set(prev.model.bonds.map((b) => b.id));
    return {
      ...prev,
      hovered: { atomId: null, bondId: null },
      sel: {
        atoms: new Set([...prev.sel.atoms].filter((id) => atoms.has(id))),
        bonds: new Set([...prev.sel.bonds].filter((id) => bonds.has(id))),
      },
    };
  });
}

/**
 * Model edits go to the tab's document, which is what undo, redo and saving
 * act on. The store keeps a mirror of it for rendering (see ../index.tsx), so
 * components still read `model` and `arrows` exactly as before.
 *
 * Each action is one undo step, except where a gesture produces several edits
 * in a row - those share a coalesce key so a drag stays one step.
 */
export const createModelSlice = (
  doc: DocumentStore<StructureDocument>,
  set: SetState,
  get: GetState,
) => ({
  addAtom: (x: number, y: number, el: string = "C", r: number = 0.9) => {
    const id = doc.getState().nextId;
    doc.edit("add atom", (d) => ops.addAtom(d, x, y, el, r));
    return id;
  },

  addBond: (a: number, b: number, order: Bond["order"] = 1) => {
    const id = doc.getState().nextId;
    doc.edit("add bond", (d) => ops.addBond(d, a, b, order));
    return id;
  },

  connectAtoms: (
    a: number,
    b: number,
    order: Bond["order"] = 1,
  ): number | null => {
    const before = doc.getState();
    if (a === b || ops.hasBond(before, a, b)) return null;
    doc.edit("add bond", (d) => ops.connectAtoms(d, a, b, order));
    return before.nextId;
  },

  /** New atom plus the bond that holds it: one step for the whole gesture. */
  addAtomBonded: (
    baseId: number,
    x: number,
    y: number,
    el: string = "C",
    order: Bond["order"] = 1,
  ) => {
    const id = doc.getState().nextId;
    doc.edit("extend bond", (d) =>
      ops.addAtomBonded(d, baseId, x, y, el, order),
    );
    return id;
  },

  /** Two atoms and the bond between them: one step. */
  addBondedPair: (
    first: { x: number; y: number; el?: string },
    second: { x: number; y: number; el?: string },
    order: Bond["order"] = 1,
  ) => {
    doc.edit("draw bond", (d) => ops.addBondedPair(d, first, second, order));
  },

  replaceDraggedAtomWith: (movingId: number, targetId: number) => {
    doc.edit("merge atoms", (d) =>
      ops.replaceDraggedAtomWith(d, movingId, targetId),
    );
  },

  findAtomNear: (
    x: number,
    y: number,
    tol: number = NOMINAL_BOND_LENGTH * 0.3,
    excludeId: number | null = null,
  ): number | null => {
    let best: { id: number; d: number } | null = null;
    for (const a of get().model.atoms) {
      if (excludeId != null && a.id === excludeId) continue;
      const d = Math.hypot(x - a.x, y - a.y);
      if (d <= tol && (!best || d < best.d)) best = { id: a.id, d };
    }
    return best ? best.id : null;
  },

  moveAtom: (id: number, x: number, y: number) => {
    doc.edit("move atom", (d) => ops.moveAtom(d, id, x, y), {
      coalesceKey: `move-atom:${id}`,
    });
  },

  drawStroke: (
    baseId: number,
    nodes: Parameters<typeof ops.addStroke>[2],
    kind: "bond" | "chain",
  ) => {
    doc.edit(kind === "chain" ? "draw chain" : "extend bond", (d) =>
      ops.addStroke(d, baseId, nodes),
    );
  },

  deleteAtom: (id: number) => {
    if (doc.edit("delete atom", (d) => ops.deleteParts(d, [id], []))) {
      forgetDeleted(set);
    }
  },

  deleteBond: (id: number) => {
    if (doc.edit("delete bond", (d) => ops.deleteParts(d, [], [id]))) {
      forgetDeleted(set);
    }
  },

  relayout: (change: Parameters<typeof ops.relayout>[1]) => {
    doc.edit("clean up", (d) => ops.relayout(d, change));
  },

  updateBond: (id: number, patch: Partial<Bond>) => {
    doc.edit("change bond", (d) => ops.updateBond(d, id, patch));
  },

  setBondOrder: (id: number, order: Bond["order"]) => {
    doc.edit("change bond order", (d) => ops.updateBond(d, id, { order }));
  },

  setBondDoubleMode: (id: number, mode: NonNullable<Bond["doubleMode"]>) => {
    doc.edit("change double bond", (d) =>
      ops.updateBond(d, id, { doubleMode: mode }),
    );
  },

  setBondStereo: (id: number, stereo: NonNullable<Bond["stereo"]>) => {
    doc.edit("change stereo", (d) => ops.updateBond(d, id, { stereo }));
  },

  setBondStereoOrient: (
    id: number,
    orient: NonNullable<Bond["stereoOrient"]>,
  ) => {
    doc.edit("change stereo", (d) =>
      ops.updateBond(d, id, { stereoOrient: orient }),
    );
  },

  /**
   * The structure a tab opens with. That is where the document starts, not
   * an edit made to it: nothing to undo, nothing unsaved.
   */
  openModel: (next: Model, arrow?: ImportedArrow) => {
    doc.reset(
      ops.withImportedArrow(ops.replaceModel(doc.getState(), next), arrow),
      "open structure",
    );
    get().forgetInteraction();
  },

  /** A file opened over what the canvas holds: one step, arrow and all. */
  replaceModel: (next: Model, arrow?: ImportedArrow) => {
    doc.edit("open structure", (d) =>
      ops.withImportedArrow(ops.replaceModel(d, next), arrow),
    );
    get().forgetInteraction();
  },

  forgetInteraction: () => {
    // Interaction state does not survive a new structure.
    set((prev: EditorState) => ({
      ...prev,
      sel: { atoms: new Set(), bonds: new Set() },
      hovered: { atomId: null, bondId: null },
      moveArmed: null,
      labelEdit: { active: false, atomId: null, value: "", autoCap: true },
      moveDrag: {
        active: false,
        atomId: null,
        pointer: null,
        mode: "snap",
        preview: null,
      },
      extend: { active: false, atomId: null, pointer: null, mode: "snap" },
      fitNonce: prev.fitNonce + 1,
    }));
  },

  appendModel: (next: Model, arrow?: ImportedArrow) => {
    doc.edit("add structure", (d) =>
      ops.withImportedArrow(ops.appendModel(d, next), arrow),
    );
    set((prev: EditorState) => ({
      ...prev,
      hovered: { atomId: null, bondId: null },
      fitNonce: prev.fitNonce + 1,
    }));
  },

  addArrow: (
    x: number,
    y: number,
    angle: number = 0,
    length: number = NOMINAL_BOND_LENGTH * 4,
  ) => {
    const id = doc.getState().nextArrowId;
    doc.edit("add arrow", (d) => ops.addArrow(d, x, y, angle, length));
    return id;
  },

  updateArrow: (id: number, patch: Partial<Arrow>) => {
    doc.edit("move arrow", (d) => ops.updateArrow(d, id, patch), {
      coalesceKey: `arrow:${id}`,
    });
  },

  removeArrow: (id: number) => {
    doc.edit("delete arrow", (d) => ops.removeArrow(d, id));
  },
});
