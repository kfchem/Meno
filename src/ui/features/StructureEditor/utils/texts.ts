/**
 * The texts a workspace holds (docs/WORKSPACE.md, *Texts*): which its
 * column shows as they come and go, what a new one is called, and where
 * Export suggests writing one.
 */
import type { WorkspaceText } from "../store/types";
import { firstFreeBeside } from "../../../../lib/io/beside";

/**
 * The text the column shows once the texts are `after`, having been
 * `before` and showing `shown` - and whether it is to open, to show it: one
 * that has come - opened, or brought back by an undo - the last of them,
 * opening; else one whose words an undo or a redo changed while another was
 * shown, or none, opening; else the one shown, while it is there - gone,
 * the one now where it was, or none.
 */
export function shownText(
  before: readonly WorkspaceText[],
  after: readonly WorkspaceText[],
  shown: number | null,
): { shown: number | null; open?: true } {
  if (before === after) return { shown };
  const was = new Map(before.map((t) => [t.id, t]));
  const come = after.filter((t) => !was.has(t.id));
  if (come.length) return { shown: come[come.length - 1].id, open: true };
  const changed = after.filter((t) => was.get(t.id)!.text !== t.text);
  if (changed.length === 1 && changed[0].id !== shown) return { shown: changed[0].id, open: true };
  if (shown == null || after.some((t) => t.id === shown)) return { shown };
  if (!after.length) return { shown: null };
  const at = before.findIndex((t) => t.id === shown);
  return { shown: after[Math.min(Math.max(at, 0), after.length - 1)].id };
}

/** What a new text is called: "Untitled.txt", or numbered from 2 where the workspace holds one so called. */
export function newTextName(texts: readonly Pick<WorkspaceText, "name">[]): string {
  const names = new Set(texts.map((t) => t.name.toLowerCase()));
  if (!names.has("untitled.txt")) return "Untitled.txt";
  let n = 2;
  while (names.has(`untitled-${n}.txt`)) n++;
  return `Untitled-${n}.txt`;
}

/**
 * Where Export suggests writing a text: never the file it was opened from
 * (docs/FILE-IO.md) - beside it, numbered from 2, the first name `taken`
 * does not say is there; one opened from nowhere Open said, by its name.
 */
export function textExportPath(
  text: Pick<WorkspaceText, "name" | "path">,
  taken: (path: string) => boolean = () => false,
): string {
  return text.path ? firstFreeBeside(text.path, taken) : text.name;
}
