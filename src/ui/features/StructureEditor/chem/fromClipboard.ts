import { readClipboard } from "../../../../lib/clipboard";
import type { Model } from "../store/types";
import { looksLikeMolfile, looksLikeSmiles, readRecord } from "../utils/copyPaste";
import { editorModelOf, processFileContent } from "../utils/io";
import { structureFromSmiles } from "./fromSmiles";

/**
 * The structure on the clipboard, if there is one: Meno's own record of it,
 * or a MOL file another program put there, or plain text that is a MOL
 * file or a SMILES. Null when there is nothing that reads as a structure.
 */
export async function structureOnClipboard(): Promise<Model | null> {
  const own = await readClipboard(["meno"]);
  const record = own && readRecord(own.text);
  if (record) return record;
  const item = await readClipboard(["mol", "text"]);
  if (!item) return null;
  if (item.flavor === "mol" || looksLikeMolfile(item.text)) {
    const { model } = await processFileContent("clipboard.mol", item.text);
    return editorModelOf(model);
  }
  if (looksLikeSmiles(item.text)) return structureFromSmiles(item.text.trim());
  return null;
}
