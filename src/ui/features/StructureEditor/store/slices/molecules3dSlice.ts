import type { StoreApi } from "zustand";
import type { DocumentStore } from "../../../../../lib/doc";
import * as ops from "../../document";
import type { StructureDocument } from "../../document";
import type { EditorState, Look3D, Molecule3D, Turn3D } from "../types";

type SetState = StoreApi<EditorState>["setState"];
type GetState = StoreApi<EditorState>["getState"];

/** The most atoms a measurement takes: four, for a torsion angle. */
const MOST_CHOSEN = 4;

/**
 * Molecules in 3D on the page: where they stand, how they look and what is
 * measured on them are the document's, and are undone; how they are turned,
 * which frame they show, which is under the pointer and what is selected or
 * chosen of them are the view's.
 */
export function createMolecules3dSlice(doc: DocumentStore<StructureDocument>, set: SetState, get: GetState) {
  return {
    setHovered3d: (h: { id: number; part: "body" | "rim" } | null) =>
      set((prev) =>
        prev.hovered3d?.id === h?.id && prev.hovered3d?.part === h?.part ? prev : { ...prev, hovered3d: h },
      ),
    setHoveredMeasure3d: (h: { id: number; measure: number } | null) =>
      set((prev) =>
        prev.hoveredMeasure3d?.id === h?.id && prev.hoveredMeasure3d?.measure === h?.measure
          ? prev
          : { ...prev, hoveredMeasure3d: h },
      ),
    setTurn3d: (id: number, turn: Turn3D) =>
      set((prev) => ({ ...prev, turns3d: { ...prev.turns3d, [id]: turn } })),
    resetTurn3d: (id: number) =>
      set((prev) => {
        if (!(id in prev.turns3d)) return prev;
        const { [id]: _was, ...turns3d } = prev.turns3d;
        return { ...prev, turns3d };
      }),
    setFrame3d: (id: number, frame: number) =>
      set((prev) => (prev.frames3d[id] === frame ? prev : { ...prev, frames3d: { ...prev.frames3d, [id]: frame } })),
    selectMolecules3d: (ids: Iterable<number>, add = false) =>
      set((prev) => {
        const sel3d = new Set(add ? prev.sel3d : []);
        for (const id of ids) sel3d.add(id);
        // (alone: the drawing's selection goes, as a click on one part lets the others go)
        return add
          ? { ...prev, sel3d }
          : { ...prev, sel3d, sel: { atoms: new Set(), bonds: new Set() }, selAnchor: null, chosen3d: null };
      }),
    toggleMolecule3dSel: (id: number) =>
      set((prev) => {
        const sel3d = new Set(prev.sel3d);
        if (sel3d.has(id)) sel3d.delete(id);
        else sel3d.add(id);
        return { ...prev, sel3d };
      }),
    chooseAtom3d: (id: number, atom: number) =>
      set((prev) => {
        const was = prev.chosen3d?.id === id ? prev.chosen3d.atoms : [];
        const atoms = was.includes(atom)
          ? was.filter((a) => a !== atom)
          : was.length >= MOST_CHOSEN
            ? [atom]
            : [...was, atom];
        return { ...prev, chosen3d: atoms.length ? { id, atoms } : null };
      }),
    moveMolecule3d: (id: number, at: { x: number; y: number }, gesture?: string) => {
      doc.edit("move molecule", (d) => ops.moveMolecule3d(d, id, at), gesture ? { coalesceKey: gesture } : undefined);
    },
    moveMolecules3d: (moves: { id: number; at: { x: number; y: number } }[], gesture?: string) => {
      doc.edit(
        moves.length > 1 ? "move molecules" : "move molecule",
        (d) => ops.moveMolecules3d(d, moves),
        gesture ? { coalesceKey: gesture } : undefined,
      );
    },
    removeMolecule3d: (id: number) => {
      doc.edit("delete molecule", (d) => ops.removeMolecule3d(d, id));
    },
    setLook3d: (id: number, look: Look3D) => {
      doc.edit(look === "space" ? "space-filling" : "balls and sticks", (d) => ops.setLook3d(d, id, look));
    },
    measureChosen3d: () => {
      const chosen = get().chosen3d;
      if (!chosen || chosen.atoms.length < 2) return;
      const label = ["", "", "measure distance", "measure angle", "measure torsion angle"][chosen.atoms.length];
      doc.edit(label, (d) => ops.addMeasure3d(d, chosen.id, chosen.atoms));
      set((prev) => ({ ...prev, chosen3d: null }));
    },
    removeMeasure3d: (id: number, measure: number) => {
      doc.edit("delete measurement", (d) => ops.removeMeasure3d(d, id, measure));
    },
  };
}

/**
 * The view's hold on molecules in 3D, kept to those the document still has:
 * an undo, a deletion or a file opened afresh takes the others away - their
 * turn, their frame, their place in the selection, their chosen atoms and
 * the hover.
 */
export function heldOf(prev: EditorState, molecules: Molecule3D[]): Partial<EditorState> {
  const by = new Map(molecules.map((m) => [m.id, m]));
  const keep = <T,>(r: Record<number, T>) => {
    const out: Record<number, T> = {};
    let same = true;
    for (const k of Object.keys(r)) {
      if (by.has(Number(k))) out[Number(k)] = r[Number(k)];
      else same = false;
    }
    return same ? r : out;
  };
  const sel3d = [...prev.sel3d].every((id) => by.has(id)) ? prev.sel3d : new Set([...prev.sel3d].filter((id) => by.has(id)));
  const c = prev.chosen3d;
  const chosenStays = !c || (by.has(c.id) && c.atoms.every((a) => a < by.get(c.id)!.atoms.length));
  const hm = prev.hoveredMeasure3d;
  const measureStays = !hm || (by.get(hm.id)?.measures ?? []).some((x) => x.id === hm.measure);
  return {
    hoveredMeasure3d: measureStays ? hm : null,
    turns3d: keep(prev.turns3d),
    frames3d: keep(prev.frames3d),
    sel3d,
    chosen3d: chosenStays ? c : null,
    hovered3d: prev.hovered3d && !by.has(prev.hovered3d.id) ? null : prev.hovered3d,
  };
}
