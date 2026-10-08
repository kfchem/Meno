import type { TabKind } from "../../lib/core";
import { kindOf, type Kind } from "../../lib/io/kinds";
import { OFFERED, WRITER_PLUGINS } from "../../lib/calc/catalog";
import { holdOutputsOf } from "../../lib/calc/asks";
import { isMenoFile, readMenoFile } from "../../lib/doc/menoFile";
import type { OpenedText } from "./texts";

/** What a file opens as: a tab of `kind`, named for the file, holding `data`. */
export type Opened = { kind: TabKind; label: string; data: Record<string, unknown> };

const EXT_TEXT = new Set([
  "txt", "md", "markdown", "json", "csv", "tsv", "yaml", "yml", "ini", "cfg", "log",
  "js", "ts", "tsx", "py", "c", "cpp", "css", "html",
]);

/**
 * The files Open offers: every kind Meno takes in (lib/io/kinds) - its own,
 * and those the plugins on offer bring, added or not, so that one not added
 * can be named - and text: what the plugins on offer write among it, a
 * calculation's input, say, to be read and changed in a workspace's column.
 */
export const OPENABLE = [
  ...new Set([
    ...OFFERED.kinds.flatMap((k) => k.extensions),
    ...WRITER_PLUGINS.flatMap((p) => p.writes.flatMap((w) => w.extensions)),
    ...[...EXT_TEXT].map((ext) => `.${ext}`),
  ]),
];

/**
 * A workspace file's workspace, its JSON - where `bytes` are one - with the
 * outputs it keeps held for the session, each read from it when wanted
 * (lib/calc/asks). None where they are no workspace file; throws, saying
 * why, where they are one that does not read.
 */
export function workspaceOfFile(bytes: Uint8Array): string | null {
  if (!isMenoFile(bytes)) return null;
  const file = readMenoFile(bytes);
  holdOutputsOf(file);
  return file.workspace;
}

/**
 * The canvas a file opens on, by what it is (lib/io/kinds): a Meno
 * workspace, a structure, a calculation's output - told what it is so that
 * it is not asked again; and anything else as text, held in the workspace
 * and shown in its column (`textsOf`: the app gives texts to the canvas in
 * front, where there is one - ui/views/texts). `path`, where the file has
 * one, goes with it; `kind`, where it was told otherwise - by a plugin, asked.
 */
export function openedAs(name: string, text: string, path?: string, kind: Kind | null = kindOf(name, text)): Opened {
  if (kind) return { kind: "structure", label: name, data: { filename: name, payload: text, kind: kind.id, ...(path ? { path } : {}) } };
  return openedTexts([{ name, text, ...(path ? { path } : {}) }]);
}

/** Texts opened, on a canvas of their own where none takes them: named for the first, as for any file opened. */
export function openedTexts(texts: OpenedText[]): Opened {
  const [first] = texts;
  return {
    kind: "structure",
    label: first?.name || "Untitled.txt",
    data: { texts, ...(first?.name ? { filename: first.name } : {}), ...(first?.path ? { path: first.path } : {}) },
  };
}

/** The texts a file opened is, where it is text. */
export function textsOf(opened: Opened): OpenedText[] | undefined {
  return (opened.data as { texts?: OpenedText[] }).texts;
}
