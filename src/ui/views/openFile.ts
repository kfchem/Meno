import type { TabKind } from "../../lib/core";
import { extensionOf, kinds, kindOf, type Kind } from "../../lib/io/kinds";

/** What a file opens as: a tab of `kind`, named for the file, holding `data`. */
export type Opened = { kind: TabKind; label: string; data: Record<string, unknown> };

const EXT_TEXT = new Set([
  "txt", "md", "markdown", "json", "csv", "tsv", "yaml", "yml", "ini", "cfg", "log",
  "js", "ts", "tsx", "py", "c", "cpp", "css", "html",
]);

/** The files Open offers: every kind Meno takes in (lib/io/kinds), and text. */
export const OPENABLE = [...new Set([...kinds().flatMap((k) => k.extensions), ...[...EXT_TEXT].map((ext) => `.${ext}`)])];

/**
 * The tab a file opens in, by what it is (lib/io/kinds): a Meno workspace,
 * a structure, a calculation's output - on a structure canvas, told what
 * it is so that it is not asked again; text in the text editor, JSON laid
 * out; and anything else as text. `path`, where the file has one, goes
 * with it; `kind`, where it was told otherwise - by a plugin, asked.
 */
export function openedAs(name: string, text: string, path?: string, kind: Kind | null = kindOf(name, text)): Opened {
  if (kind) return { kind: "structure", label: name, data: { filename: name, payload: text, kind: kind.id, ...(path ? { path } : {}) } };
  const ext = extensionOf(name).slice(1);
  if (ext === "json" || !EXT_TEXT.has(ext)) {
    try {
      return { kind: "text", label: name, data: { text: JSON.stringify(JSON.parse(text), null, 2), language: "json", filename: name } };
    } catch {}
  }
  return { kind: "text", label: name, data: { text, language: ext || "txt", filename: name } };
}
