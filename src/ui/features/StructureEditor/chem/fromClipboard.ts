import { readClipboard, readDrop, type ClipItem, type Flavor } from "../../../../lib/clipboard";
import { structureInPicture } from "../picture";
import type { Model } from "../store/types";
import { looksLikeMolfile, looksLikeSmiles, readRecord } from "../utils/copyPaste";
import { editorModelOf, processFileContent } from "../utils/io";
import { structureFromSmiles } from "./fromSmiles";

/**
 * The structure on the clipboard, if there is one, from the first of:
 * - Meno's own record of it, or the object for Office that holds it (on
 *   Windows, Word and PowerPoint copy one they hold with it; on a Mac,
 *   Word and PowerPoint hand over its storage);
 * - a picture Meno made of it - Office's clip format, handed back by Word
 *   or PowerPoint when the picture is copied there, or a PNG;
 * - a MOL file another program put there;
 * - plain text that is a MOL file or a SMILES.
 * Null when there is nothing that reads as a structure.
 */
export async function structureOnClipboard(): Promise<Model | null> {
  return structureIn(readClipboard, true);
}

/**
 * The structure in what was just dropped on the page - a picture or an
 * object dragged out of Word or PowerPoint - read as a paste reads the
 * clipboard, but for plain text: a dragged file's path, say, is no SMILES.
 */
export async function structureInDrop(): Promise<Model | null> {
  return structureIn(readDrop, false);
}

async function structureIn(
  read: (flavors: Flavor[]) => Promise<ClipItem | null>,
  withText: boolean,
): Promise<Model | null> {
  const own = await read(["meno", "embed"]);
  const record = own?.text != null ? readRecord(own.text) : null;
  if (record) return record;
  for (const flavor of ["object", "gvml", "png"] as const) {
    const picture = await read([flavor]);
    const found = picture && (await structureInPicture(picture));
    if (found) return found;
  }
  if (!withText) {
    const mol = await read(["mol"]);
    if (!mol?.text) return null;
    const { model } = await processFileContent("dropped.mol", mol.text);
    return editorModelOf(model);
  }
  const item = await read(["mol", "text"]);
  const text = item?.text;
  if (!item || text == null) return null;
  if (item.flavor === "mol" || looksLikeMolfile(text)) {
    const { model } = await processFileContent("clipboard.mol", text);
    return editorModelOf(model);
  }
  if (looksLikeSmiles(text)) return structureFromSmiles(text.trim());
  return null;
}
