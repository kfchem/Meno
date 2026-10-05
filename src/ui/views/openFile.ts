import type { TabKind } from "../../lib/core";
import { detectFormat } from "../../utils/importers";
import { outputExtensions, outputKindOf } from "../../lib/calc/catalog";

/** What a file opens as: a tab of `kind`, named for the file, holding `data`. */
export type Opened = { kind: TabKind; label: string; data: Record<string, unknown> };

const EXT_3D = new Set(["sdf", "xyz", "pdb"]);
const EXT_2D = new Set(["mol", "rxn", "ket"]);
const EXT_TEXT = new Set([
  "txt", "md", "markdown", "json", "csv", "tsv", "yaml", "yml", "ini", "cfg", "log",
  "js", "ts", "tsx", "py", "c", "cpp", "css", "html",
]);

/** The files Open offers: Meno workspaces, chemical files, calculations' output, and text. */
export const OPENABLE = [...new Set([...["meno", ...EXT_2D, ...EXT_3D].map((ext) => `.${ext}`), ...outputExtensions(), ...[...EXT_TEXT].map((ext) => `.${ext}`)])].join(",");

/**
 * The tab a file opens in: a Meno workspace, as it was saved, and any
 * chemical file - drawings as drawings, 3D structures standing in 3D, an
 * XYZ file known by its content too, and a calculation's output, known by
 * how it starts (lib/calc) - on a structure canvas, which reads it by its
 * name; text in the text editor, JSON laid out; and anything else as text.
 */
export function openedAs(name: string, text: string): Opened {
  const ext = (name.split(".").pop() || "").toLowerCase();
  const fmt = detectFormat(name, text);
  if (ext === "meno" || fmt !== null || EXT_3D.has(ext) || EXT_2D.has(ext) || outputKindOf(text))
    return { kind: "structure", label: name, data: { filename: name, payload: text } };
  if (ext === "json" || !EXT_TEXT.has(ext)) {
    try {
      return { kind: "text", label: name, data: { text: JSON.stringify(JSON.parse(text), null, 2), language: "json", filename: name } };
    } catch {}
  }
  return { kind: "text", label: name, data: { text, language: ext || "txt", filename: name } };
}
