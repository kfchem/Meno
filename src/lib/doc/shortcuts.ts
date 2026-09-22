/**
 * Undo/redo keyboard shortcuts, resolved without touching the DOM so the rule
 * can be tested on its own.
 */

export type UndoIntent = "undo" | "redo" | null;

type KeyLike = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  target?: unknown;
};

/**
 * Fields where the browser's own editing should keep Ctrl+Z: single-line
 * inputs (the 2D editor's atom label editor) and rich-text hosts.
 *
 * A `<textarea>` is deliberately **not** in this list: the text view's textarea
 * is backed by a document, so its undo has to be the document's.
 */
function isNativeEditingTarget(target: unknown): boolean {
  const el = target as { tagName?: string; isContentEditable?: boolean } | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = (el.tagName ?? "").toUpperCase();
  return tag === "INPUT" || tag === "SELECT";
}

/** Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z and Ctrl+Y redo. */
export function undoIntent(event: KeyLike): UndoIntent {
  if (!(event.ctrlKey || event.metaKey)) return null;
  if (isNativeEditingTarget(event.target)) return null;
  const key = (event.key || "").toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y" && !event.shiftKey) return "redo";
  return null;
}
