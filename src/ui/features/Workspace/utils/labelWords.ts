/**
 * An atom's label as it is typed in place (components/LabelTyping2D): words
 * on the page (./wordsEditor) on one line - a new line typed or pasted is
 * none - and, once the IME has given what it composes, the label's rules
 * applied to it as it stands (`settle`: utils/labelTyping `typedLabel`), the
 * caret kept where it was.
 */
import { caretAt, Lines, type Edit, type Sel } from "../../../../lib/text/editing";
import type { Composing } from "../../TextEditor/editor";
import { WordsEditor } from "./wordsEditor";

export class LabelWords extends WordsEditor {
  /** What the label's rules make of the text as typed. */
  settle: (text: string) => string = (t) => t;

  edit(e: Edit, sel?: Sel): void {
    const insert = e.insert.replace(/[\r\n]+/g, "");
    // (a new line taken out: the caret after what is put in)
    super.edit({ ...e, insert }, insert === e.insert ? sel : undefined);
    this.settled();
  }

  setComposing(c: Composing | null): void {
    super.setComposing(c);
    if (!c) this.settled();
  }

  /** The text as the label's rules have it - none while the IME composes - the caret kept, as far as it can be. */
  settled(): void {
    if (this.composing) return;
    const t = this.settle(this.text);
    if (t === this.text) return;
    this.lines = new Lines(t);
    const clamp = (n: number) => Math.min(n, t.length);
    this.sel = this.sel.anchor === this.sel.head ? caretAt(clamp(this.sel.head)) : { anchor: clamp(this.sel.anchor), head: clamp(this.sel.head) };
    this.onChange();
  }
}
