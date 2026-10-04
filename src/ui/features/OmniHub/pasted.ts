import { structureOnClipboard } from "../StructureEditor/chem/fromClipboard";
import type { Drawn } from "../StructureEditor/store/types";
import { recordText } from "../StructureEditor/utils/copyPaste";

/**
 * What a new tab becomes for a structure pasted into it: a structure canvas
 * holding it - Meno's own record of it, opened as a document's structure
 * is - named as the New menu names one.
 */
export function canvasHolding(found: Drawn) {
  return { kind: "structure" as const, label: "Structure Canvas", filename: "clipboard.meno", payload: recordText(found) };
}

/** A canvas holding the structure on the clipboard; null when there is none. */
export async function canvasFromClipboard() {
  const found = await structureOnClipboard().catch(() => null);
  return found ? canvasHolding(found) : null;
}
