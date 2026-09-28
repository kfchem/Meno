/**
 * Clean-up: a structure laid out afresh by Meno's own engine - the drawing a
 * chemist would make of it (docs/LAYOUT-2D.md) - where it was drawn, as one
 * undo step.
 */
import { emptyStructureDocument, relayout } from "../document";
import type { EditorStore } from "../store";
import type { Model } from "../store/types";
import { layoutJob, nextFree, relayoutFrom } from "./engineLayout";
import { layOut } from "./layOut";

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

/** The structures on the canvas, each the atoms bonded together, a lone atom not among them. */
export function fragmentsOf(model: Model): Set<number>[] {
  const seen = new Set<number>();
  const out: Set<number>[] = [];
  const bonded = new Set(model.bonds.flatMap((b) => [b.a, b.b]));
  for (const a of model.atoms) {
    if (seen.has(a.id) || !bonded.has(a.id)) continue;
    const f = fragmentOf(model, a.id);
    f.forEach((id) => seen.add(id));
    out.push(f);
  }
  return out;
}

/** The fragments that hold any of `atoms`, each once. */
export function fragmentsHolding(model: Model, atoms: Iterable<number>): Set<number>[] {
  const out: Set<number>[] = [];
  for (const id of atoms) {
    if (out.some((f) => f.has(id)) || !model.atoms.some((a) => a.id === id)) continue;
    out.push(fragmentOf(model, id));
  }
  return out;
}

/**
 * Cleans up the fragment an atom is in - or the fragments a selection's
 * atoms are in, or every structure on the canvas -
 * each where it was: laid out afresh by Meno's own engine (engineLayout),
 * off the drawing's thread, and applied as one undo step. Refuses, rather
 * than moving anything, if the structure changed meanwhile, or if the new
 * layout would not say the stereochemistry the old one said.
 */
export async function cleanUp(
  store: EditorStore,
  around: number | Iterable<number> | null = null,
): Promise<void> {
  const model = store.getState().model;
  const parts = (
    around == null
      ? fragmentsOf(model)
      : fragmentsHolding(model, typeof around === "number" ? [around] : around)
  )
    .map((ids) => partOf(model, ids))
    .filter((part) => part.bonds.length > 0);
  if (!parts.length) return; // nothing to lay out
  const jobs = parts.map(layoutJob);
  const laid = await Promise.all(jobs.map((job) => layOut(job.input)));
  if (store.getState().model !== model) {
    throw new Error(
      "The structure changed while it was being cleaned up, so nothing was moved.",
    );
  }
  const changes = parts.map((part, i) => relayoutFrom(model, part, jobs[i], laid[i]));
  store.getState().relayout({
    atoms: changes.flatMap((c) => c.atoms),
    bonds: changes.flatMap((c) => c.bonds),
    added: changes.flatMap((c) => c.added ?? []),
    removed: changes.flatMap((c) => c.removed ?? []),
  });
}

/**
 * `model` laid out afresh by the engine as a whole - a salt's ions set out
 * together - for a structure that has only just arrived, before it is
 * added: RDKit's drawing of a SMILES.
 */
export async function laidOut(model: Model): Promise<Model> {
  if (!model.bonds.length) return model;
  const job = layoutJob(model);
  const change = relayoutFrom(model, model, job, await layOut(job.input));
  return relayout({ ...emptyStructureDocument(), model, nextId: nextFree(model) }, change).model;
}
