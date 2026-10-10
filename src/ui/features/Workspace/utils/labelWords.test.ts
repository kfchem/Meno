import { describe, expect, it } from "vitest";
import { typedLabel } from "./labelTyping";
import { LabelWords } from "./labelWords";
import { connectStoreToDocument, createEditorStore } from "../store";
import { createWorkspaceDocument } from "../document";

describe("a label typed in place", () => {
  it("is one line: a new line typed or pasted is none, the caret after what went in", () => {
    const ed = new LabelWords("O");
    ed.replaceSelection("M\ne");
    expect(ed.text).toBe("OMe");
    expect(ed.sel).toEqual({ anchor: 3, head: 3 });
    ed.replaceSelection("\n");
    expect(ed.text).toBe("OMe");
  });

  it("is set by the label's rules once the input method has given it - the caret kept", () => {
    const ed = new LabelWords("");
    ed.settle = (t) => typedLabel(t, true);
    ed.replaceSelection("c");
    expect(ed.text).toBe("C");
    ed.replaceSelection("ooh");
    expect(ed.text).toBe("Cooh");
    // (composing: left as the input method has it)
    const was = ed.text;
    ed.setComposing({ from: 4, to: 4, text: "ｈ", sel: [1, 1] });
    expect(ed.text).toBe(was);
    ed.setComposing(null);
    ed.edit({ from: 4, to: 4, insert: "ＣＯＯＨ" });
    // (full-width letters, as an input method gives them, as the ordinary ones)
    expect(ed.text).toBe("CoohCOOH");
    expect(ed.sel.head).toBe(8);
  });

  it("kept and changed, is drawn as written until the drawing's own label is; let go or unchanged, it is not", () => {
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const s = () => store.getState();
    const id = s().addAtom(0, 0, "C");
    s().beginLabelEdit(id);
    const n = s().labelEdit.n!;
    s().setLabelEditValue("N");
    s().commitLabelEdit();
    expect(s().labelLeft).toEqual({ atomId: id, n, text: "N" });
    s().labelShown();
    expect(s().labelLeft).toBeNull();
    // (each edit its own number; the same label again changes nothing)
    s().beginLabelEdit(id);
    expect(s().labelEdit.n).toBeGreaterThan(n);
    s().setLabelEditValue("N");
    s().commitLabelEdit();
    expect(s().labelLeft).toBeNull();
    s().beginLabelEdit(id);
    s().cancelLabelEdit();
    expect(s().labelLeft).toBeNull();
  });
});
