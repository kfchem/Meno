import { NOMINAL_BOND_LENGTH } from "../../../../../lib/chem/acs";
import type { DocumentStore } from "../../../../../lib/doc";
import * as ops from "../../document";
import type { ImportedScheme, StructureDocument } from "../../document";
import type { ArrowLook } from "../../../../../lib/chem/reactionArrow";
import { ARROW_LENGTH_BONDS } from "../../../../../lib/chem/reactionScheme";
import { EditorState, Bond, Arrow, Model, Drawn } from "../types";
import { turnedOver } from "../../utils/selection";
import { schemeAmong } from "../../utils/copyPaste";
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
 * What `appendModel` (../../document) added to `model`, whose next id was
 * `start`: every atom and bond numbered from there on - ids are handed out
 * in order and never again, an Sgroup's among them - selected, so that it
 * can be dragged straight on.
 */
function added(start: number, model: Model): EditorState["sel"] {
  return {
    atoms: new Set(model.atoms.filter((a) => a.id >= start).map((a) => a.id)),
    bonds: new Set(model.bonds.filter((b) => b.id >= start).map((b) => b.id)),
  };
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

  moveAtoms: (moves: { id: number; x: number; y: number }[], gesture: string, marks?: ops.MarkPlaces) => {
    doc.edit("move atoms", (d) => ops.placeMarks(ops.placeAtoms(d, moves), marks), {
      coalesceKey: `move-atoms:${gesture}`,
    });
  },

  turnSelectionOver: (axis: "vertical" | "horizontal") => {
    const { sel, model } = get();
    if (!sel.atoms.size) return;
    const over = turnedOver(model, sel.atoms, axis);
    doc.edit("turn over", (d) => ops.placeAtoms(d, over.atoms, over.bonds));
  },

  deleteSelection: () => {
    const { sel, model, arrows, pluses } = get();
    if (!sel.atoms.size && !sel.bonds.size) return;
    // the arrows and pluses among it go with it, as with a cut
    const among = schemeAmong({ ...model, arrows, pluses }, sel.atoms);
    const ids = (xs: { id: number }[]) => new Set(xs.map((x) => x.id));
    if (doc.edit("delete selection", (d) => ops.deleteDrawn(d, sel.atoms, sel.bonds, ids(among.arrows), ids(among.pluses)))) {
      forgetDeleted(set);
    }
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

  stepCharge: (id: number, step: 1 | -1) => {
    const atom = doc.getState().model.atoms.find((a) => a.id === id);
    if (!atom) return;
    const charge = (atom.charge ?? 0) + step;
    doc.edit("change charge", (d) => ops.setAtomChemistry(d, id, { ...atom, charge }));
  },

  toggleRadical: (id: number) => {
    const atom = doc.getState().model.atoms.find((a) => a.id === id);
    if (!atom) return;
    doc.edit("change radical", (d) =>
      ops.setAtomChemistry(d, id, { ...atom, radical: atom.radical ? undefined : "doublet" }),
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
  openModel: (next: Model, scheme?: ImportedScheme) => {
    doc.reset(
      ops.withImportedScheme(ops.replaceModel(doc.getState(), next), scheme),
      "open structure",
    );
    get().forgetInteraction();
  },

  /** A file opened over what the canvas holds: one step, arrow and all. */
  replaceModel: (next: Model, scheme?: ImportedScheme) => {
    doc.edit("open structure", (d) =>
      ops.withImportedScheme(ops.replaceModel(d, next), scheme),
    );
    get().forgetInteraction();
  },

  forgetInteraction: () => {
    // Interaction state does not survive a new structure.
    set((prev: EditorState) => ({
      ...prev,
      sel: { atoms: new Set(), bonds: new Set() },
      hovered: { atomId: null, bondId: null },
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

  pasteModel: (next: Drawn) => {
    if (!next.atoms.length) return;
    const start = doc.getState().nextId;
    if (!doc.edit("paste", (d) => ops.withImportedScheme(ops.appendModel(d, next), ops.schemeOf(next)))) return;
    set((prev: EditorState) => ({
      ...prev,
      sel: added(start, doc.getState().model),
      selAnchor: null,
      hovered: { atomId: null, bondId: null },
    }));
  },

  appendModel: (next: Model, scheme?: ImportedScheme) => {
    const start = doc.getState().nextId;
    const edited = doc.edit("add structure", (d) =>
      ops.withImportedScheme(ops.appendModel(d, next), scheme),
    );
    set((prev: EditorState) => ({
      ...prev,
      // (selected, as a paste is)
      ...(edited && next.atoms.length ? { sel: added(start, doc.getState().model), selAnchor: null } : {}),
      hovered: { atomId: null, bondId: null },
      fitNonce: prev.fitNonce + 1,
    }));
  },

  addArrow: (
    x: number,
    y: number,
    angle: number = 0,
    length: number = NOMINAL_BOND_LENGTH * ARROW_LENGTH_BONDS,
  ) => {
    const id = doc.getState().nextArrowId;
    doc.edit("add arrow", (d) => ops.addArrow(d, x, y, angle, length));
    return id;
  },

  updateArrow: (id: number, patch: Partial<Arrow>, gesture?: string) => {
    doc.edit("move arrow", (d) => ops.updateArrow(d, id, patch), {
      coalesceKey: `arrow:${id}:${gesture ?? ""}`,
    });
  },

  addPlus: (x: number, y: number) => {
    const id = doc.getState().nextPlusId ?? 1;
    doc.edit("add plus", (d) => ops.addPlus(d, x, y));
    return id;
  },

  removeArrow: (id: number) => {
    doc.edit("delete arrow", (d) => ops.removeArrow(d, id));
  },

  movePlus: (id: number, x: number, y: number, gesture?: string) => {
    doc.edit("move plus", (d) => ops.movePlus(d, id, x, y), { coalesceKey: `plus:${id}:${gesture ?? ""}` });
  },

  removePlus: (id: number) => {
    doc.edit("delete plus", (d) => ops.removePlus(d, id));
  },

  deleteDrawn: (part: Drawn) => {
    const edited = doc.edit("cut", (d) =>
      ops.deleteDrawn(
        d,
        new Set(part.atoms.map((a) => a.id)),
        new Set(part.bonds.map((b) => b.id)),
        new Set((part.arrows ?? []).map((a) => a.id)),
        new Set((part.pluses ?? []).map((p) => p.id)),
      ),
    );
    if (edited) forgetDeleted(set);
  },

  expandAbbreviation: (id: number) => {
    doc.edit("expand abbreviation", (d) => ops.expandAbbreviation(d, id));
  },

  setArrowLook: (id: number, look: ArrowLook, coalesceKey?: string) => {
    doc.edit("arrow style", (d) => ops.setArrowLook(d, id, look), { coalesceKey });
  },
});
