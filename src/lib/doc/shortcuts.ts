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

/** A Mac's, where ⌘ does what Ctrl does elsewhere, and a Ctrl-click is a right-click. */
export const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/**
 * Ctrl (⌘ on a Mac) with a click or a drag adds to the selection, or takes
 * out of it.
 */
export function addsToSelection(
  event: Pick<KeyLike, "ctrlKey" | "metaKey">,
  mac = IS_MAC,
): boolean {
  return (mac ? event.metaKey : event.ctrlKey) === true;
}

/** Ctrl/Cmd+A selects everything - but not while a text field has the keys. */
export function isSelectAllKey(event: KeyLike): boolean {
  return (
    (event.ctrlKey || event.metaKey) === true &&
    !event.shiftKey &&
    (event.key || "").toLowerCase() === "a" &&
    !isTextTarget(event.target)
  );
}

/** Escape lets the selection go - but not while a text field has the keys. */
export function isDeselectKey(event: KeyLike): boolean {
  return event.key === "Escape" && !isTextTarget(event.target);
}

function isTextTarget(target: unknown): boolean {
  return (
    isNativeEditingTarget(target) ||
    (target as { tagName?: string } | null)?.tagName?.toUpperCase() === "TEXTAREA"
  );
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

/** Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z and Ctrl+Y redo. */
export function undoIntent(event: KeyLike): UndoIntent {
  if (!(event.ctrlKey || event.metaKey)) return null;
  if (isNativeEditingTarget(event.target)) return null;
  const key = (event.key || "").toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y" && !event.shiftKey) return "redo";
  return null;
}
