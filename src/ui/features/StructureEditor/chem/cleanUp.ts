/**
 * Clean-up: a structure laid out afresh by RDKit - even bond lengths and
 * angles - over where it was drawn, as one undo step.
 */
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { wedgeNarrowAtom } from "../../../../lib/chem/layout2d";
import { MOL_BOND_LENGTH } from "../../../../lib/chem/molWriter";
import type { CleanLayout } from "../../../../lib/rdkit/client";
import { chemMolblock, molIndex } from "../../../../lib/rdkit/molblock";
import { chemWorker } from "../../../../lib/rdkit/worker";
import type { EditorStore } from "../store";
import type { Bond, Model } from "../store/types";

/** An atom and every atom bonded to it, however far along. */
export function fragmentOf(model: Model, atomId: number): Set<number> {
  const next = new Map<number, number[]>();
  for (const b of model.bonds) {
    next.set(b.a, [...(next.get(b.a) ?? []), b.b]);
    next.set(b.b, [...(next.get(b.b) ?? []), b.a]);
  }
  const seen = new Set([atomId]);
  const todo = [atomId];
  while (todo.length) {
    for (const n of next.get(todo.pop()!) ?? []) {
      if (!seen.has(n)) {
        seen.add(n);
        todo.push(n);
      }
    }
  }
  return seen;
}

/** Some of a structure: these atoms, and the bonds between them. */
export function partOf(model: Model, ids: Set<number>): Model {
  return {
    atoms: model.atoms.filter((a) => ids.has(a.id)),
    bonds: model.bonds.filter((b) => ids.has(b.a) && ids.has(b.b)),
  };
}

/** A new layout for some of a structure, as the edits that make it. */
export type Relayout = {
  atoms: { id: number; x: number; y: number }[];
  bonds: {
    id: number;
    stereo: NonNullable<Bond["stereo"]>;
    stereoOrient: NonNullable<Bond["stereoOrient"]>;
  }[];
};

/**
 * RDKit's clean-up of `part` of `model` as edits: every atom of the part
 * moved, and - when the wedges as drawn would no longer say the same - the
 * wedges RDKit gives in their place, each narrow at its stereocentre, and
 * the part's other wedges made plain bonds.
 */
export function relayoutOf(
  model: Model,
  part: Model,
  layout: CleanLayout,
): Relayout {
  const { atoms, bonds } = molIndex(part);
  const scale = NOMINAL_BOND_LENGTH / MOL_BOND_LENGTH;
  const moved = atoms.map((a, i) => {
    const [x, y] = layout.coords[i] ?? [a.x / scale, a.y / scale];
    return { id: a.id, x: x * scale, y: y * scale };
  });
  if (!layout.wedges) return { atoms: moved, bonds: [] };
  // Which end of a wedge is narrow is held relative to the number of bonds
  // at each end, counted over the whole structure, as the drawing counts.
  const degree = new Map<number, number>();
  for (const b of model.bonds) {
    degree.set(b.a, (degree.get(b.a) ?? 0) + 1);
    degree.set(b.b, (degree.get(b.b) ?? 0) + 1);
  }
  const wedges = new Map(layout.wedges.map((w) => [w.bond, w]));
  const changed: Relayout["bonds"] = [];
  bonds.forEach((b, i) => {
    const w = wedges.get(i);
    const orient = b.stereoOrient ?? "principle";
    if (w) {
      const narrow = atoms[w.narrow]?.id;
      if (narrow == null) return;
      const usual = wedgeNarrowAtom(
        { a1: b.a, a2: b.b, order: b.order, stereoOrient: "principle" },
        degree,
      );
      const want = usual === narrow ? "principle" : "reverse";
      if (b.stereo !== w.stereo || orient !== want) {
        changed.push({ id: b.id, stereo: w.stereo, stereoOrient: want });
      }
    } else if (b.stereo === "up" || b.stereo === "down") {
      changed.push({ id: b.id, stereo: "none", stereoOrient: "principle" });
    }
  });
  return { atoms: moved, bonds: changed };
}

/**
 * Cleans up the fragment an atom is in, or the whole structure: asks RDKit
 * - setting it up first, if it has not been - and applies its layout as one
 * undo step. Refuses, rather than moving anything, if the structure changed
 * while RDKit was at it.
 */
export async function cleanUp(
  store: EditorStore,
  aroundAtom: number | null = null,
): Promise<void> {
  const model = store.getState().model;
  const part =
    aroundAtom == null ? model : partOf(model, fragmentOf(model, aroundAtom));
  if (part.bonds.length === 0) return; // nothing to lay out
  const chem = await chemWorker();
  const layout = await chem.request("clean", { molblock: chemMolblock(part) });
  if (store.getState().model !== model) {
    throw new Error(
      "The structure changed while it was being cleaned up, so nothing was moved.",
    );
  }
  store.getState().relayout(relayoutOf(model, part, layout));
}
