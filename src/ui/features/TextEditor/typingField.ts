/**
 * The field a text Meno draws is typed through (docs/PDF.md, *A text*): a
 * textarea kept out of sight - under the drawing, its words and caret
 * clear - lying just where the drawn lines lie, so that the IME's
 * candidates show at the caret. It holds the caret's line and those around
 * it, and what is selected among them, so that the IME can convert again
 * a word already written (lib/text/field).
 *
 * What is typed into it, the IME's included, is read back as an edit of
 * the text; while the IME composes, what it has so far is drawn by Meno,
 * and the field is left alone until it is done. An editor's keys are
 * Meno's (lib/text/keys); copying, cutting and pasting take the whole
 * selection, however much of it the field holds.
 */
import { IS_MAC } from "../../../lib/doc/shortcuts";
import { caretAt, plainLines, selFrom, selTo } from "../../../lib/text/editing";
import { editOf, inText, windowOf, type FieldWindow } from "../../../lib/text/field";
import { commandOf } from "../../../lib/text/keys";
import type { Editor } from "./editor";
import { LINE_PX, xAt } from "./linePictures";

export class TypingField {
  /** What the field was last given: what it holds, from where in the text, and what is selected in it. */
  private win: FieldWindow | null = null;
  /** The IME composing: what the field held as it began, and what was selected in it. */
  private composing: { before: string; a: number; b: number; start: number } | null = null;
  private off: (() => void)[] = [];

  constructor(
    private ta: HTMLTextAreaElement,
    private ed: Editor,
  ) {
    const on = <K extends keyof HTMLElementEventMap>(type: K, f: (e: HTMLElementEventMap[K]) => void) => {
      ta.addEventListener(type, f as EventListener);
      this.off.push(() => ta.removeEventListener(type, f as EventListener));
    };
    on("keydown", (e) => this.onKey(e));
    on("beforeinput", (e) => this.onBeforeInput(e));
    on("input", () => this.onInput());
    on("compositionstart", () => this.onCompositionStart());
    on("compositionend", () => this.onCompositionEnd());
    on("copy", (e) => this.onCopy(e, false));
    on("cut", (e) => this.onCopy(e, true));
    on("paste", (e) => this.onPaste(e));
    on("focus", () => this.focused(true));
    on("blur", () => this.focused(false));
  }

  dispose(): void {
    for (const f of this.off) f();
    this.off = [];
  }

  focus(): void {
    this.ta.focus({ preventScroll: true });
  }

  private focused(yes: boolean): void {
    this.ed.focused = yes;
    this.ed.stirred = performance.now();
    if (yes) this.sync();
    this.ed.onChange();
  }

  /** The field given the lines about the caret, and laid where they are drawn - unless the IME is composing in it. */
  sync(): void {
    if (this.composing) return;
    const ed = this.ed;
    const w = windowOf(ed.lines, ed.sel);
    const same = this.win && this.win.start === w.start && this.win.text === w.text;
    this.win = w;
    if (!same || this.ta.value !== w.text) this.ta.value = w.text;
    const backward = ed.sel.head < ed.sel.anchor && w.whole;
    if (this.ta.selectionStart !== w.sel[0] || this.ta.selectionEnd !== w.sel[1]) this.ta.setSelectionRange(w.sel[0], w.sel[1], backward ? "backward" : "forward");
    this.place();
  }

  /** Laid where the lines it holds are drawn: its first line's top, its first letter's place across. */
  place(): void {
    const w = this.win;
    if (!w) return;
    const ed = this.ed;
    const first = ed.lines.at(w.start);
    const last = ed.lines.at(w.end);
    const lineStart = ed.lines.start(first);
    const left = ed.xOf(lineStart) + xAt(ed.lines.line(first), w.start - lineStart) - xAt(ed.lines.line(first), 0);
    const s = this.ta.style;
    s.left = `${left}px`;
    s.top = `${ed.topOf(first)}px`;
    s.height = `${(last - first + 1) * LINE_PX}px`;
    s.width = `${Math.max(ed.viewW, 400)}px`;
  }

  private onKey(e: KeyboardEvent): void {
    // (the IME's keys are its own)
    if (e.isComposing || e.keyCode === 229 || this.composing) {
      // (a selection the field cannot hold, typed over: let go of first)
      if (this.win && !this.win.whole && selFrom(this.ed.sel) !== selTo(this.ed.sel) && !this.composing) {
        this.ed.replaceSelection("");
        this.sync();
      }
      return;
    }
    const c = commandOf(e, IS_MAC);
    if (!c) return;
    e.preventDefault();
    e.stopPropagation();
    this.ed.command(c, IS_MAC);
    this.sync();
  }

  private onBeforeInput(e: InputEvent): void {
    // (undone and done again by the workspace's own Undo, as all else is)
    if (e.inputType === "historyUndo" || e.inputType === "historyRedo") {
      e.preventDefault();
      return;
    }
    // (a selection the field cannot hold, typed over or deleted: the whole of it)
    if (this.composing || e.isComposing || !this.win || this.win.whole || selFrom(this.ed.sel) === selTo(this.ed.sel)) return;
    if (e.inputType.startsWith("insert") && e.inputType !== "insertCompositionText") {
      e.preventDefault();
      const insert = e.inputType === "insertLineBreak" || e.inputType === "insertParagraph" ? "\n" : (e.data ?? "");
      this.ed.replaceSelection(plainLines(insert));
      this.sync();
    } else if (e.inputType.startsWith("delete")) {
      e.preventDefault();
      this.ed.replaceSelection("");
      this.sync();
    }
  }

  private onInput(): void {
    const w = this.win;
    if (!w) return;
    if (this.composing) {
      this.showComposing();
      return;
    }
    const e = editOf(w.text, w.sel[0], w.sel[1], this.ta.value);
    if (!e) return;
    const typed = inText({ ...e, insert: plainLines(e.insert) }, w.start);
    const head = w.start + this.ta.selectionEnd + (typed.insert.length - e.insert.length);
    this.ed.edit(typed, caretAt(head));
    this.sync();
  }

  private onCompositionStart(): void {
    const w = this.win;
    if (!w) return;
    this.composing = { before: this.ta.value, a: this.ta.selectionStart, b: this.ta.selectionEnd, start: w.start };
  }

  /** What the IME has so far, drawn in place of what it is taking the place of. */
  private showComposing(): void {
    const c = this.composing!;
    const e = editOf(c.before, c.a, c.b, this.ta.value);
    if (!e) {
      this.ed.setComposing({ from: c.start + c.a, to: c.start + c.b, text: "", sel: [0, 0] });
      return;
    }
    const sel: [number, number] = [Math.min(Math.max(this.ta.selectionStart - e.from, 0), e.insert.length), Math.min(Math.max(this.ta.selectionEnd - e.from, 0), e.insert.length)];
    this.ed.setComposing({ from: c.start + e.from, to: c.start + e.to, text: e.insert, sel });
  }

  private onCompositionEnd(): void {
    const c = this.composing;
    this.composing = null;
    this.ed.setComposing(null);
    if (!c) return;
    const now = this.ta.value;
    const e = editOf(c.before, c.a, c.b, now);
    // (what the field holds now, as given: an input after this reads no change)
    this.win = this.win && { ...this.win, text: now, end: this.win.start + now.length, sel: [this.ta.selectionStart, this.ta.selectionEnd] };
    if (e) {
      const typed = inText({ ...e, insert: plainLines(e.insert) }, c.start);
      this.ed.edit(typed, caretAt(c.start + this.ta.selectionEnd + (typed.insert.length - e.insert.length)));
    }
    // (given the lines about the caret again once the IME has quite let go of it)
    window.setTimeout(() => this.sync(), 0);
  }

  private onCopy(e: ClipboardEvent, cut: boolean): void {
    e.preventDefault();
    const text = this.ed.selectedText();
    if (!text) return;
    e.clipboardData?.setData("text/plain", text);
    if (cut) {
      this.ed.replaceSelection("");
      this.sync();
    }
  }

  private onPaste(e: ClipboardEvent): void {
    e.preventDefault();
    const text = e.clipboardData?.getData("text/plain");
    if (!text) return;
    this.ed.replaceSelection(plainLines(text));
    this.sync();
  }
}
