import type { TabKind } from "../../lib/core";
import { detectFormat, readMoleculesFromText } from "../../utils/importers";

/** What a file opens as: a tab of `kind`, named for the file, holding `data`. */
export type Opened = { kind: TabKind; label: string; data: Record<string, unknown> };

const EXT_3D = new Set(["sdf", "xyz", "pdb"]);
const EXT_2D = new Set(["mol", "rxn", "ket"]);
const EXT_TEXT = new Set([
  "txt", "md", "markdown", "json", "csv", "tsv", "yaml", "yml", "ini", "cfg", "log",
  "js", "ts", "tsx", "py", "c", "cpp", "css", "html",
]);

/** The files Open offers: chemical files, and text. */
export const OPENABLE = [...EXT_2D, ...EXT_3D, ...EXT_TEXT].map((ext) => `.${ext}`).join(",");

/**
 * The tab a file opens in: an XYZ file in the 3D viewer; any other chemical
 * file on a structure canvas, which reads it by its name; text in the text
 * editor, JSON laid out; and anything else as text.
 */
export function openedAs(name: string, text: string): Opened {
  const ext = (name.split(".").pop() || "").toLowerCase();
  const fmt = detectFormat(name, text);
  if (fmt === "xyz") return { kind: "3d", label: name, data: { molecules: readMoleculesFromText(text, "xyz"), filename: name } };
  if (fmt !== null || EXT_3D.has(ext) || EXT_2D.has(ext)) return { kind: "structure", label: name, data: { filename: name, payload: text } };
  if (ext === "json" || !EXT_TEXT.has(ext)) {
    try {
      return { kind: "text", label: name, data: { text: JSON.stringify(JSON.parse(text), null, 2), language: "json", filename: name } };
    } catch {}
  }
  return { kind: "text", label: name, data: { text, language: ext || "txt", filename: name } };
}
