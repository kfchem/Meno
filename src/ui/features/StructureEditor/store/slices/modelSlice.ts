import { NOMINAL_BOND_LENGTH } from "../../../../../lib/chem/acs";
import type { DocumentStore } from "../../../../../lib/doc";
import * as ops from "../../document";
import { useReadings } from "../../../../../lib/calc/readings";
import type { ImportedScheme, StructureDocument } from "../../document";
import type { ArrowLook } from "../../../../../lib/chem/reactionArrow";
import { ARROW_LENGTH_BONDS } from "../../../../../lib/chem/reactionScheme";
import { EditorState, Bond, Arrow, Model, Drawn } from "../types";
import { turnedOver } from "../../utils/selection";
import { schemeAmong } from "../../utils/copyPaste";
import { relinked } from "../../utils/drawnLink";
import { resultKey } from "../../../../../lib/calc/results";
import type { Workspace } from "../../utils/workspace";
import { StoreApi } from "zustand";
import { DOUBLE_CLICK_MS } from "../../constants";
import { nextIdAfter } from "../../workflow/saved";

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
    const { sel, sel3d, model, arrows, pluses, captions } = get();
    if (!sel.atoms.size && !sel.bonds.size && !sel3d.size) return;
    // the arrows and pluses among it go with it, as with a cut; and the
    // molecules in 3D selected, in the same step
    const among = schemeAmong({ ...model, arrows, pluses, captions }, sel.atoms);
    const ids = (xs: { id: number }[]) => new Set(xs.map((x) => x.id));
    const deleted = doc.edit("delete selection", (d) =>
      ops.removeMolecules3d(ops.deleteDrawn(d, sel.atoms, sel.bonds, ids(among.arrows), ids(among.pluses), ids(among.captions)), sel3d),
    );
    if (deleted) forgetDeleted(set);
  },

  moveAtom: (id: number, x: number, y: number) => {
    doc.edit("move atom", (d) => ops.moveAtom(d, id, x, y), {
      coalesceKey: `move-atom:${id}`,
    });
  },

  noteDoubleClickBond: (atomId: number) =>
    set((prev: EditorState) => ({
      ...prev,
      doubleClickBond: { atomId, depth: doc.history().undoDepth, at: performance.now() },
    })),

  takeBackDoubleClickBond: (atomId: number) => {
    const d = get().doubleClickBond;
    set((prev: EditorState) => ({ ...prev, doubleClickBond: null }));
    if (!d || d.atomId !== atomId || performance.now() - d.at > 2 * DOUBLE_CLICK_MS) return;
    if (doc.history().undoDepth === d.depth) doc.undo();
  },

  drawStrokeAt: (start: { x: number; y: number }, nodes: Parameters<typeof ops.addStroke>[2]) => {
    doc.edit("draw chain", (d) => ops.addStrokeAt(d, start, nodes));
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

  relayout: (change: Parameters<typeof ops.relayout>[1], labels: readonly ops.WrittenAsLabel[] = []) => {
    const edited = doc.edit("clean up", (d) => ops.relayout(labels.length ? ops.writtenAsLabels(d, labels) : d, change));
    if (edited && labels.length) forgetDeleted(set);
  },

  justExpanded: () =>
    new Set(doc.history().undoLabel === "expand abbreviation" ? (doc.getState().expanded ?? []) : []),

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
    // (each molecule in 3D showing the frame its file says - numbered from
    // the first, in order, as replaceModel left them to be)
    set((prev: EditorState) => ({ ...prev, frames3d: shownFrames(scheme, 1, {}), lists3d: shownLists(scheme, 1, {}) }));
  },

  joinReadings: () => {
    doc.amend((d) => ops.withReadings(d, useReadings.getState().bySource));
  },

  openWorkspace: (ws: Workspace, start = false) => {
    const { drawn } = ws;
    const opened = (d: StructureDocument) => {
      const next = ops.withImportedScheme(ops.replaceModel(d, drawn), ops.schemeOf(drawn));
      // (a workflow's parts by their own ids: what a box holds is what lies inside it, whatever the molecules' ids)
      const workflow = ws.workflow ? { ...ws.workflow, nextWorkflowId: nextIdAfter(ws.workflow) } : {};
      return ops.setDocumentStyle(
        { ...next, ...workflow, aromaticEnabled: ws.aromaticEnabled, aromaticRings: ws.aromaticRings },
        ws.style,
      );
    };
    if (start) doc.reset(opened(doc.getState()), "open workspace");
    else doc.edit("open workspace", opened);
    get().forgetInteraction();
    // each molecule in 3D turned, and showing the frame, as it was saved -
    // numbered from the first, in order, as replaceModel left them to be
    const turns3d: EditorState["turns3d"] = {};
    const frames3d: EditorState["frames3d"] = {};
    const lists3d: EditorState["lists3d"] = {};
    (drawn.molecules3d ?? []).forEach((m, i) => {
      if (m.turn) turns3d[i + 1] = m.turn;
      if (m.frame) frames3d[i + 1] = m.frame;
      // (a list open as it was saved, its row chosen and its surface's value)
      if (m.list) lists3d[i + 1] = { list: m.list.id, row: m.list.row, pointed: null, ...(m.list.iso != null ? { iso: m.list.iso } : {}) };
    });
    set((prev: EditorState) => ({ ...prev, turns3d, frames3d, lists3d }));
  },

  /** A file opened over what the canvas holds: one step, arrow and all. */
  replaceModel: (next: Model, scheme?: ImportedScheme) => {
    doc.edit("open structure", (d) =>
      ops.withImportedScheme(ops.replaceModel(d, next), scheme),
    );
    get().forgetInteraction();
  },

  forgetInteraction: () => {
    // Interaction state does not survive a new structure - nor how the
    // molecules in 3D were turned, which the new ones' ids would take on.
    set((prev: EditorState) => ({
      ...prev,
      sel: { atoms: new Set(), bonds: new Set() },
      sel3d: new Set<number>(),
      chosen3d: null,
      hoveredBox: null,
      chosenBox: null,
      hoveredStep: null,
      hoveredWire: null,
      openStep: null,
      wireDrag: null,
      workflowMenu: null,
      turns3d: {},
      frames3d: {},
      hovered3d: null,
      hoveredMeasure3d: null,
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
    const carried = next.molecules3d ?? [];
    if (!next.atoms.length && !carried.length) return;
    const start = doc.getState().nextId;
    const start3d = doc.getState().nextMolecule3dId ?? 1;
    // (the pasted atoms numbered on from here, in their order: a molecule in
    // 3D pasted with its drawing is tied to the pasted drawing)
    const idOf = new Map(next.atoms.map((a, k) => [a.id, start + k]));
    const tied = { ...next, molecules3d: carried.map((m) => relinked(m, next, (id) => idOf.get(id))) };
    if (!doc.edit("paste", (d) => ops.withImportedScheme(ops.appendModel(d, next), ops.schemeOf(tied)))) return;
    // the molecules in 3D pasted, numbered from there on in order: selected
    // with the rest, turned and showing the frame they were copied in
    const ids = carried.map((_, i) => start3d + i);
    const turns3d = { ...get().turns3d };
    const frames3d = { ...get().frames3d };
    carried.forEach((m, i) => {
      if (m.turn) turns3d[ids[i]] = m.turn;
      if (m.frame) frames3d[ids[i]] = m.frame;
    });
    set((prev: EditorState) => ({
      ...prev,
      sel: added(start, doc.getState().model),
      sel3d: new Set(ids),
      chosen3d: null,
      turns3d,
      frames3d,
      selAnchor: null,
      hovered: { atomId: null, bondId: null },
    }));
  },

  appendModel: (next: Model, scheme?: ImportedScheme) => {
    const start = doc.getState().nextId;
    const start3d = doc.getState().nextMolecule3dId ?? 1;
    const edited = doc.edit("add structure", (d) =>
      ops.withImportedScheme(ops.appendModel(d, next), scheme),
    );
    set((prev: EditorState) => ({
      ...prev,
      // (each molecule in 3D added showing the frame its file says)
      ...(edited ? { frames3d: shownFrames(scheme, start3d, prev.frames3d), lists3d: shownLists(scheme, start3d, prev.lists3d) } : {}),
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

  deleteDrawn: (part: Drawn, molecules3d: number[] = []) => {
    const edited = doc.edit("cut", (d) =>
      ops.removeMolecules3d(
        ops.deleteDrawn(
          d,
          new Set(part.atoms.map((a) => a.id)),
          new Set(part.bonds.map((b) => b.id)),
          new Set((part.arrows ?? []).map((a) => a.id)),
          new Set((part.pluses ?? []).map((p) => p.id)),
          new Set((part.captions ?? []).map((c) => c.id)),
        ),
        molecules3d,
      ),
    );
    if (edited) forgetDeleted(set);
  },

  expandAbbreviation: (id: number) => {
    // (one after another, they are one run of drawing out)
    const run = doc.history().undoLabel === "expand abbreviation" ? (doc.getState().expanded ?? []) : [];
    doc.edit("expand abbreviation", (d) => {
      const out = ops.expandAbbreviation(d, id);
      return out === d ? d : { ...out, expanded: [...run, ...(out.expanded ?? [])] };
    });
  },

  contractToAbbreviation: (ids: ReadonlySet<number>, label: string) => {
    if (doc.edit("show as abbreviation", (d) => ops.contractToAbbreviation(d, ids, label))) forgetDeleted(set);
  },

  setArrowLook: (id: number, look: ArrowLook, coalesceKey?: string) => {
    doc.edit("arrow style", (d) => ops.setArrowLook(d, id, look), { coalesceKey });
  },
});

/**
 * The frames shown, with each molecule in 3D a file brings showing the one
 * its file says - an optimisation's last - those molecules numbered from
 * `first`, in order.
 */
function shownFrames(scheme: ImportedScheme | undefined, first: number, shown: EditorState["frames3d"]): EditorState["frames3d"] {
  const out = { ...shown };
  (scheme?.molecules3d ?? []).forEach((m, i) => {
    if (m.frame) out[first + i] = m.frame;
  });
  return out;
}

/**
 * Each molecule in 3D added from a file, with a list its reader asked to be
 * shown as it comes (lib/calc/results `shown`) - a cube file's grids -
 * opened under it, that row chosen; numbered as `shownFrames` numbers them.
 */
function shownLists(scheme: ImportedScheme | undefined, first: number, open: EditorState["lists3d"]): EditorState["lists3d"] {
  const out = { ...open };
  (scheme?.molecules3d ?? []).forEach((m, i) => {
    const list = m.calc?.results?.find((r) => r.on === "list" && r.shown != null);
    if (list?.on === "list" && list.shown != null) out[first + i] = { list: resultKey(list), row: list.shown, pointed: null };
  });
  return out;
}
