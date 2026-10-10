/**
 * A text read in the column, as both its halves have it (docs/PDF.md,
 * *One canvas*): its body in HTML (TextBody) takes the pointer, the wheel
 * and the keys, and the canvas draws it in the column's pass (ColumnText),
 * each from the same editor. Kept for each workspace's store, a text at a
 * time, by its id, so that a text gone back to is where it was left.
 */
import { Editor } from "./editor";

/** A text's editor, and how to ask the canvas to draw it again. */
export type ColumnTextEntry = { ed: Editor; redraw: () => void };

const kept = new WeakMap<object, Map<number, ColumnTextEntry>>();

/** A text's editor in a workspace - made, from its text, the first time it is asked for. */
export function columnText(store: object, id: number, text: string): ColumnTextEntry {
  let all = kept.get(store);
  if (!all) kept.set(store, (all = new Map()));
  let e = all.get(id);
  if (!e) all.set(id, (e = { ed: new Editor(text), redraw: () => {} }));
  return e;
}

/** The texts a workspace no longer holds, let go. */
export function keepColumnTexts(store: object, ids: readonly number[]): void {
  const all = kept.get(store);
  if (!all) return;
  for (const id of all.keys()) if (!ids.includes(id)) all.delete(id);
}
