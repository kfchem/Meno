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
  altKey?: boolean;
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

/** Ctrl/Cmd+S saves; Ctrl/Cmd+Shift+S saves as. */
export function saveIntent(event: KeyLike): "save" | "saveAs" | null {
  if (!(event.ctrlKey || event.metaKey)) return null;
  if ((event.key || "").toLowerCase() !== "s") return null;
  return event.shiftKey ? "saveAs" : "save";
}

/**
 * Ctrl/Cmd+Shift+K cleans a structure up - but not while a text field has
 * the keys.
 */
export function isCleanUpKey(event: KeyLike): boolean {
  return (
    (event.ctrlKey || event.metaKey) === true &&
    event.shiftKey === true &&
    (event.key || "").toLowerCase() === "k" &&
    !isNativeEditingTarget(event.target) &&
    (event.target as { tagName?: string } | null)?.tagName?.toUpperCase() !==
      "TEXTAREA"
  );
}

/**
 * Delete or Backspace on its own deletes what is under the pointer - but not
 * while a text field has the keys.
 */
export function isDeleteKey(event: KeyLike): boolean {
  return (
    (event.key === "Delete" || event.key === "Backspace") &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !isNativeEditingTarget(event.target) &&
    (event.target as { tagName?: string } | null)?.tagName?.toUpperCase() !==
      "TEXTAREA"
  );
}

/**
 * + or - on its own - the keys that have them, the number pad's among them,
 * Shift or not - puts the charge of what is under the pointer one up or one
 * down: 1, -1, or 0 for any other key. Not while typing in a box, and not
 * with Ctrl or Cmd, which zoom.
 */
export function chargeStep(event: KeyLike): 1 | -1 | 0 {
  if (event.ctrlKey || event.metaKey || event.altKey) return 0;
  if (isNativeEditingTarget(event.target)) return 0;
  if ((event.target as { tagName?: string } | null)?.tagName?.toUpperCase() === "TEXTAREA") return 0;
  if (event.key === "+") return 1;
  if (event.key === "-" || event.key === "\u2212") return -1;
  return 0;
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
