import { describe, expect, it, vi } from "vitest";
import { connectStoreToDocument, createEditorStore } from "../store";
import { createStructureDocument } from "../document";
import { pageTextFrom, type PageText } from "../../../../lib/pdf/text";
import { goToFound, runFind, stepFound } from "./pdfFind";
import { onPage, ordered, placeBefore, selects } from "../utils/pdfSelection";
import { readWorkspace, workspaceText } from "../utils/workspace";

/** Each PDF's pages' words, as PDFium would read them: a line each, the letters 6 points wide. */
const WORDS: Record<string, string[]> = {
  ["a".repeat(64)]: ["the hydroxyl group", "no match here", "a Hydroxyl again"],
  ["b".repeat(64)]: ["hydroxyl in the second"],
};
const textOf = (sha: string, page: number): PageText => {
  const line = WORDS[sha]?.[page] ?? "";
  return pageTextFrom(line, [...line].map((_, k) => [72 + k * 6, 100, 78 + k * 6, 112] as const));
};
vi.mock("../../../../lib/pdf/text", async (real) => ({
  ...(await real<typeof import("../../../../lib/pdf/text")>()),
  textOf: (sha: string, page: number) => Promise.resolve(textOf(sha, page)),
  textHad: (sha: string, page: number) => textOf(sha, page),
}));

const A4: [number, number] = [595, 842];

function editor() {
  const doc = createStructureDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  store.getState().addPdfs(
    [
      { name: "paper.pdf", sha256: "a".repeat(64), pages: [A4, A4, A4] },
      { name: "si.pdf", sha256: "b".repeat(64), pages: [A4] },
    ],
    { x: 0, y: 0 },
  );
  store.getState().readPdf(1);
  return { doc, store, state: () => store.getState() };
}

describe("searching PDFs", () => {
  it("finds in the PDF shown, without regard to case, and goes to each place in turn, round from the last", async () => {
    const { store, state } = editor();
    await runFind(store, "hydroxyl", false);
    expect(state().pdfFind).toMatchObject({ q: "hydroxyl", all: false, busy: false, now: 0 });
    expect(state().pdfFind!.found.map((f) => [f.id, f.page, f.from, f.to])).toEqual([
      [1, 0, 4, 12],
      [1, 2, 2, 10],
    ]);
    stepFound(store, 1);
    expect(state().pdfFind!.now).toBe(1);
    stepFound(store, 1);
    expect(state().pdfFind!.now).toBe(0);
    stepFound(store, -1);
    expect(state().pdfFind!.now).toBe(1);
  });

  it("finds in all the PDFs, and going to a place in another shows that one in the column", async () => {
    const { store, state } = editor();
    await runFind(store, "hydroxyl", true);
    const found = state().pdfFind!.found;
    expect(found.map((f) => f.id)).toEqual([1, 1, 2]);
    await goToFound(store, 2);
    expect(state()).toMatchObject({ pdfShown: 2, textsOpen: true });
    expect(state().pdfFind!.now).toBe(2);
  });

  it("finds nothing for nothing asked, and is closed by none", async () => {
    const { store, state } = editor();
    await runFind(store, "   ", false);
    expect(state().pdfFind).toMatchObject({ found: [], busy: false });
    state().setPdfFind(null);
    expect(state().pdfFind).toBeNull();
  });
});

describe("words selected in a PDF", () => {
  it("are one selection with the drawing's: either lets the other go, and Esc's clearing lets both go", () => {
    const { state } = editor();
    const sel = { id: 1, anchor: { page: 1, at: 5 }, focus: { page: 0, at: 2 } };
    state().setPdfSel(sel);
    expect(selects(state().pdfSel)).toBe(true);
    expect(ordered(sel)).toEqual({ from: { page: 0, at: 2 }, to: { page: 1, at: 5 } });
    // (what of each page it takes)
    expect(onPage(sel, 0, 18)).toEqual([2, 18]);
    expect(onPage(sel, 1, 13)).toEqual([0, 5]);
    expect(onPage(sel, 2, 16)).toBeNull();
    expect(placeBefore({ page: 0, at: 9 }, { page: 1, at: 0 })).toBe(true);
    state().clearSel();
    expect(state().pdfSel).toBeNull();
    expect(selects({ id: 1, anchor: { page: 0, at: 3 }, focus: { page: 0, at: 3 } })).toBe(false);
  });

  it("taken out as words on the page keep where they came from, saved and read back", () => {
    const { state } = editor();
    const from = { sha256: "a".repeat(64), from: { page: 0, at: 4 }, to: { page: 0, at: 12 } };
    state().addCaption("hydroxyl", 3, 4, undefined, from);
    expect(state().captions[0]).toMatchObject({ text: "hydroxyl", from });
    const ws = readWorkspace(workspaceText(state()));
    expect(ws?.drawn.captions?.[0]).toMatchObject({ text: "hydroxyl", from });
  });
});
