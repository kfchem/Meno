import { readClipboard } from "../../../../lib/clipboard";
import { structureInPicture } from "../picture";
import type { Model } from "../store/types";
import { looksLikeMolfile, looksLikeSmiles, readRecord } from "../utils/copyPaste";
import { editorModelOf, processFileContent } from "../utils/io";
import { structureFromSmiles } from "./fromSmiles";

/**
 * The structure on the clipboard, if there is one, from the first of:
 * - Meno's own record of it;
 * - a picture Meno made of it - Office's clip format, handed back by Word
 *   or PowerPoint when the picture is copied there, or a PNG;
 * - a MOL file another program put there;
 * - plain text that is a MOL file or a SMILES.
 * Null when there is nothing that reads as a structure.
 */
export async function structureOnClipboard(): Promise<Model | null> {
  const own = await readClipboard(["meno"]);
  const record = own?.text != null ? readRecord(own.text) : null;
  if (record) return record;
  for (const flavor of ["gvml", "png"] as const) {
    const picture = await readClipboard([flavor]);
    const found = picture && (await structureInPicture(picture));
    if (found) return found;
  }
  const item = await readClipboard(["mol", "text"]);
  const text = item?.text;
  if (!item || text == null) return null;
  if (item.flavor === "mol" || looksLikeMolfile(text)) {
    const { model } = await processFileContent("clipboard.mol", text);
    return editorModelOf(model);
  }
  if (looksLikeSmiles(text)) return structureFromSmiles(text.trim());
  return null;
}
