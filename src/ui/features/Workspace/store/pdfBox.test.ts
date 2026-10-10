import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument } from "../document";
import { boxName, inBox } from "../components/boxDrag";
import type { PdfBox } from "./types";

function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { state: () => store.getState() };
}

const box: PdfBox = { id: 1, page: 0, box: [72, 100, 300, 260] };

describe("a box drawn on a PDF's page", () => {
  it("is one selection in a PDF with its words: either lets the other go, and Esc lets it go", () => {
    const { state } = editor();
    const atom = state().addAtom(0, 0, "C");
    state().setSel({ atoms: new Set([atom]), bonds: new Set() });
    state().setPdfBox(box);
    expect(state().pdfBox).toEqual(box);
    expect(state().sel.atoms.size).toBe(0);
    state().setPdfSel({ id: 1, anchor: { page: 0, at: 0 }, focus: { page: 0, at: 4 } });
    expect(state().pdfBox).toBeNull();
    state().setPdfBox(box);
    expect(state().pdfSel).toBeNull();
    state().clearSel();
    expect(state().pdfBox).toBeNull();
  });

  it("holds a point of its page; its picture is named for its PDF and page", () => {
    expect(inBox(box, 0, 80, 120)).toBe(true);
    expect(inBox(box, 1, 80, 120)).toBe(false);
    expect(inBox(box, 0, 20, 120)).toBe(false);
    expect(boxName({ name: "paper.PDF" }, 2)).toBe("paper, page 3.png");
  });
});
