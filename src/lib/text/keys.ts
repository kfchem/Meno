/**
 * An editor's keys, as each system has them (docs/PDF.md, *A text*): what
 * a key pressed in a text Meno draws does - the caret moved, what is
 * selected drawn on, words deleted - on a Mac and on Windows. Keys that
 * only type are not here: what they type comes through the field kept out
 * of sight (ui/features/TextEditor/typingField), the IME's too.
 */

/** How far a key moves the caret, or deletes. */
export type Unit = "letter" | "word" | "line" | "paragraph" | "lineEdge" | "page" | "all";

export type Command =
  /** The caret moved, `extend` drawing the selection on. */
  | { kind: "move"; unit: Unit; dir: -1 | 1; extend: boolean }
  /** What is selected deleted, or as far as `unit` from the caret. */
  | { kind: "delete"; unit: Unit; dir: -1 | 1 }
  /** The view moved, the caret where it is: a page, a line, or to an end. */
  | { kind: "scroll"; unit: "line" | "page" | "all"; dir: -1 | 1 }
  | { kind: "selectAll" };

export type KeyLike = { key: string; shiftKey?: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean };

const ARROWS: Record<string, { axis: "x" | "y"; dir: -1 | 1 }> = {
  ArrowLeft: { axis: "x", dir: -1 },
  ArrowRight: { axis: "x", dir: 1 },
  ArrowUp: { axis: "y", dir: -1 },
  ArrowDown: { axis: "y", dir: 1 },
};

/** A key's command, on a Mac (`mac`) or elsewhere; none, for a key that types or is not an editor's. */
export function commandOf(e: KeyLike, mac: boolean): Command | null {
  const extend = !!e.shiftKey;
  const arrow = ARROWS[e.key];
  if (mac) {
    // (Control's keys, as every text on a Mac has them)
    if (e.ctrlKey && !e.metaKey && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === "a") return { kind: "move", unit: "lineEdge", dir: -1, extend };
      if (k === "e") return { kind: "move", unit: "lineEdge", dir: 1, extend };
      if (k === "b") return { kind: "move", unit: "letter", dir: -1, extend };
      if (k === "f") return { kind: "move", unit: "letter", dir: 1, extend };
      if (k === "p") return { kind: "move", unit: "line", dir: -1, extend };
      if (k === "n") return { kind: "move", unit: "line", dir: 1, extend };
      if (k === "h" && !extend) return { kind: "delete", unit: "letter", dir: -1 };
      if (k === "d" && !extend) return { kind: "delete", unit: "letter", dir: 1 };
      if (k === "k" && !extend) return { kind: "delete", unit: "lineEdge", dir: 1 };
    }
    if (arrow) {
      if (e.ctrlKey) return null;
      if (arrow.axis === "x") {
        const unit: Unit = e.metaKey ? "lineEdge" : e.altKey ? "word" : "letter";
        return { kind: "move", unit, dir: arrow.dir, extend };
      }
      const unit: Unit = e.metaKey ? "all" : e.altKey ? "paragraph" : "line";
      return { kind: "move", unit, dir: arrow.dir, extend };
    }
    if (e.key === "Home" || e.key === "End") {
      const dir = e.key === "Home" ? -1 : 1;
      return extend ? { kind: "move", unit: "all", dir, extend } : { kind: "scroll", unit: "all", dir };
    }
    if (e.key === "PageUp" || e.key === "PageDown") {
      const dir = e.key === "PageUp" ? -1 : 1;
      // (a page of the view; with Option, or Shift, the caret goes with it)
      return e.altKey || extend ? { kind: "move", unit: "page", dir, extend } : { kind: "scroll", unit: "page", dir };
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      if (e.ctrlKey || extend) return null;
      const dir = e.key === "Backspace" ? -1 : 1;
      return { kind: "delete", unit: e.metaKey ? "lineEdge" : e.altKey ? "word" : "letter", dir };
    }
    if (e.metaKey && !e.altKey && !e.ctrlKey && !extend && e.key.toLowerCase() === "a") return { kind: "selectAll" };
    return null;
  }
  if (arrow) {
    if (e.altKey || e.metaKey) return null;
    if (arrow.axis === "x") return { kind: "move", unit: e.ctrlKey ? "word" : "letter", dir: arrow.dir, extend };
    // (Ctrl and an arrow up or down moves the view a line, the caret where it is)
    return e.ctrlKey ? { kind: "scroll", unit: "line", dir: arrow.dir } : { kind: "move", unit: "line", dir: arrow.dir, extend };
  }
  if (e.altKey || e.metaKey) return null;
  if (e.key === "Home" || e.key === "End") return { kind: "move", unit: e.ctrlKey ? "all" : "lineEdge", dir: e.key === "Home" ? -1 : 1, extend };
  if (e.key === "PageUp" || e.key === "PageDown") return { kind: "move", unit: "page", dir: e.key === "PageUp" ? -1 : 1, extend };
  if (e.key === "Backspace" || e.key === "Delete") {
    if (extend) return null;
    return { kind: "delete", unit: e.ctrlKey ? "word" : "letter", dir: e.key === "Backspace" ? -1 : 1 };
  }
  if (e.ctrlKey && !extend && e.key.toLowerCase() === "a") return { kind: "selectAll" };
  return null;
}
