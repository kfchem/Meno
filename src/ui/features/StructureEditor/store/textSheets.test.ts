import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createStructureDocument } from "../document";
import * as ops from "../document";
import { readWorkspace, workspaceText } from "../utils/workspace";
import { POINT } from "../../../../lib/pdf/layout";
import { SHEET_LEAST_COLS, SHEET_LINE_PT, SHEET_MOST_COLS, SHEET_MOST_LINES, SHEET_PAD_PT, sheetBox, sheetOf } from "../utils/textSheets";

function editor(data?: unknown) {
  const doc = createStructureDocument(data);
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, store, state: () => store.getState() };
}

describe("a text's sheet", () => {
  it("is as large as its first lines need, at the size they would be printed - within bounds", () => {
    const small = sheetOf("hello\nworld\n");
    expect(small.lines).toEqual(["hello", "world"]);
    expect(small.cols).toBe(SHEET_LEAST_COLS);
    expect(small.h).toBeCloseTo((3 * SHEET_LINE_PT + 2 * SHEET_PAD_PT) * POINT);
    const big = sheetOf(Array.from({ length: 60 }, () => "x".repeat(120)).join("\n"));
    expect(big.cols).toBe(SHEET_MOST_COLS);
    expect(big.lines).toHaveLength(SHEET_MOST_LINES);
    expect(big.lines[0]).toHaveLength(SHEET_MOST_COLS);
    // (a tab to its next stop)
    expect(sheetOf("a\tb").lines[0]).toBe("a   b");
  });

  it("is put on the page where asked, a row of them, clear of a sheet already there", () => {
    const first = ops.textsInRow([{ name: "a.txt", text: "a" }], { x: 0, y: 0 }, { texts: [] });
    const s = sheetOf("a");
    expect(first[0].at!.x).toBeCloseTo(-s.w / 2);
    expect(first[0].at!.y).toBeCloseTo(s.h / 2);
    const second = ops.textsInRow([{ name: "b.txt", text: "b" }], { x: 0, y: 0 }, { texts: [{ id: 1, ...first[0] }] });
    const a = sheetBox(first[0].at!, s);
    const b = sheetBox(second[0].at!, sheetOf("b"));
    expect(b.x0).toBeGreaterThanOrEqual(a.x1);
  });
});

describe("texts on the page", () => {
  it("come as sheets, read in the column; a tab closed leaves the sheet, and reading it again brings the tab back", () => {
    const { state } = editor();
    state().addTexts([{ name: "notes.txt", text: "some words" }], { x: 10, y: 20 });
    const [t] = state().texts;
    expect(t.at).toBeDefined();
    expect(state().textShown).toBe(t.id);
    expect(state().textsOpen).toBe(true);
    state().stopReadingText(t.id);
    expect(state().texts[0]).toMatchObject({ id: t.id, reading: false });
    expect(state().textShown).toBeNull();
    expect(state().textsOpen).toBe(false);
    state().readText(t.id);
    expect(state().texts[0].reading).toBeUndefined();
    expect(state().textShown).toBe(t.id);
    expect(state().textsOpen).toBe(true);
  });

  it("without a sheet - an output, a log - go when their tab is closed", () => {
    const { state } = editor();
    state().addTexts([{ name: "run.log", text: "log" }]);
    const [t] = state().texts;
    expect(t.at).toBeUndefined();
    state().stopReadingText(t.id);
    expect(state().texts).toHaveLength(0);
  });

  it("are selected, moved with the selection, and deleted with it as one step", () => {
    const { doc, state } = editor();
    state().addTexts([{ name: "a.txt", text: "a" }], { x: 0, y: 0 });
    const [t] = state().texts;
    state().selectAll();
    expect([...state().selTexts]).toEqual([t.id]);
    state().moveAtoms([], "drag-1", { texts: [{ id: t.id, x: t.at!.x + 5, y: t.at!.y - 3 }] });
    expect(state().texts[0].at).toEqual({ x: t.at!.x + 5, y: t.at!.y - 3 });
    const depth = doc.history().undoDepth;
    state().deleteSelection();
    expect(state().texts).toHaveLength(0);
    expect(state().selTexts.size).toBe(0);
    expect(doc.history().undoDepth).toBe(depth + 1);
    doc.undo();
    expect(state().texts[0]).toMatchObject({ id: t.id, name: "a.txt" });
    state().clearSel();
    expect(state().selTexts.size).toBe(0);
  });

  it("keep their sheets' places, and whether they are read, in the workspace", () => {
    const { state } = editor();
    state().addTexts([{ name: "a.txt", text: "a" }], { x: 1, y: 2 });
    state().stopReadingText(state().texts[0].id);
    const ws = readWorkspace(workspaceText(state(), new Set(), ["a".repeat(64)]));
    expect(ws?.texts[0]).toMatchObject({ name: "a.txt", at: state().texts[0].at, reading: false });
    // (opened again: as they were)
    const again = editor();
    again.state().openWorkspace({ ...ws!, texts: ws!.texts.map((t) => ({ ...t, text: "a" })) }, true);
    expect(again.state().texts[0]).toMatchObject({ name: "a.txt", at: state().texts[0].at, reading: false });
  });
});
