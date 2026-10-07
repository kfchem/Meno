import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createStructureDocument, isBlankDocument } from "../document";
import { centredAt, readRecord, recordText, schemeAmong } from "../utils/copyPaste";
import { readWorkspace, workspaceText } from "../utils/workspace";
import { drawingSvg, drawnOf } from "../fileActions";
import { ACS_1996 } from "../../../../lib/chem/style";

function editor() {
  const doc = createStructureDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, state: () => store.getState() };
}

describe("words on the page", () => {
  it("are added, written anew, moved and deleted, each one step", () => {
    const { doc, state } = editor();
    const id = state().addCaption("K2CO3, DMF", 1, 2);
    expect(state().captions).toEqual([{ id, x: 1, y: 2, text: "K2CO3, DMF" }]);
    expect(isBlankDocument(doc.getState())).toBe(false);
    state().updateCaption(id, { text: "K2CO3, DMF, 60 °C" });
    for (const x of [2, 3, 4]) state().updateCaption(id, { x, y: 2 }, "drag");
    expect(state().captions[0]).toMatchObject({ x: 4, text: "K2CO3, DMF, 60 °C" });
    expect(doc.history().undoDepth).toBe(3);
    doc.undo();
    expect(state().captions[0].x).toBe(1);
    state().removeCaption(id);
    expect(state().captions).toEqual([]);
    doc.undo();
    expect(state().captions).toHaveLength(1);
  });

  it("over an arrow go where it goes - moved, reshaped, with a selection - and stay where they are when it goes", () => {
    const { state } = editor();
    const arrow = state().addArrow(0, 0);
    const over = state().addCaption("Pd(PPh3)4", 0, 1, arrow);
    const free = state().addCaption("note", 9, 9);
    state().updateArrow(arrow, { x: 2, y: -1 });
    expect(state().captions.find((c) => c.id === over)).toMatchObject({ x: 2, y: 0, arrow });
    expect(state().captions.find((c) => c.id === free)).toMatchObject({ x: 9, y: 9 });
    // (moved with atoms, as a drag of a selection moves an arrow among it)
    state().moveAtoms([], "drag", { arrows: [{ id: arrow, x: 3, y: -1 }] });
    expect(state().captions.find((c) => c.id === over)).toMatchObject({ x: 3, y: 0 });
    // (moved itself as well: where it is put, not twice as far)
    state().moveAtoms([], "drag2", { arrows: [{ id: arrow, x: 4, y: -1 }], captions: [{ id: over, x: 4, y: 0 }] });
    expect(state().captions.find((c) => c.id === over)).toMatchObject({ x: 4, y: 0 });
    // (taken from it by being moved away)
    state().updateCaption(over, { x: 5, y: 5, arrow: null });
    expect(state().captions.find((c) => c.id === over)!.arrow).toBeUndefined();
    state().updateCaption(over, { x: 4, y: 0, arrow });
    state().removeArrow(arrow);
    expect(state().captions.find((c) => c.id === over)).toEqual({ id: over, x: 4, y: 0, text: "Pd(PPh3)4" });
  });

  it("go with a selection among them - over an arrow that is among it too - and are copied, pasted and saved with it", () => {
    const { state } = editor();
    const a = state().addAtom(0, 0, "C");
    const b = state().addAtom(10, 0, "C");
    const arrow = state().addArrow(5, 0, 0, 4);
    const over = state().addCaption("hv", 5, 1, arrow);
    const far = state().addCaption("far away", 30, 30);
    const drawn = drawnOf(state());
    const among = schemeAmong(drawn, new Set([a, b]));
    expect(among.captions.map((c) => c.id)).toEqual([over]);
    expect(among.captions.map((c) => c.id)).not.toContain(far);
    // (a copy's record keeps them, over their arrow)
    const record = readRecord(recordText({ ...drawn, captions: among.captions, arrows: among.arrows }))!;
    expect(record.captions).toEqual([{ id: over, x: 5, y: 1, text: "hv", arrow }]);
    // (pasted, over the arrow pasted with them, as it is numbered there)
    const other = editor();
    other.state().addArrow(50, 50);
    other.state().pasteModel(centredAt({ ...record, atoms: drawn.atoms, bonds: [] }, { x: 0, y: 0 }));
    const pasted = other.state().captions;
    expect(pasted).toHaveLength(1);
    expect(pasted[0].arrow).toBe(other.state().arrows[1].id);
    expect(pasted[0].x).toBeCloseTo(other.state().arrows[1].x);
    // (a workspace keeps them all)
    const ws = readWorkspace(workspaceText({ ...state(), turns3d: {}, frames3d: {}, lists3d: {} }))!;
    expect(ws.drawn.captions?.map((c) => c.text)).toEqual(["hv", "far away"]);
    // (deleted with the selection)
    state().selectAll();
    state().deleteSelection();
    expect(state().captions.map((c) => c.id)).toEqual([far]);
  });

  it("are read only as words, over an arrow that is there", () => {
    const read = readRecord(
      JSON.stringify({
        format: "meno-structure",
        version: 1,
        atoms: [],
        bonds: [],
        arrows: [{ id: 1, x: 0, y: 0, angle: 0, length: 4 }],
        captions: [
          { id: 1, x: 0, y: 1, text: "ok", arrow: 1 },
          { id: 2, x: 0, y: 1, text: "gone arrow", arrow: 9 },
          { id: 3, x: 0, y: 1, text: "   " },
          { id: "4", x: 0, y: 1, text: "bad id" },
        ],
      }),
    )!;
    expect(read.captions).toEqual([
      { id: 1, x: 0, y: 1, text: "ok", arrow: 1 },
      { id: 2, x: 0, y: 1, text: "gone arrow" },
    ]);
  });
});

describe("words in a picture", () => {
  it("are set as on the canvas: their counts low, and the picture as large as they reach", () => {
    const svg = drawingSvg({ atoms: [], bonds: [], captions: [{ id: 1, x: 0, y: 0, text: "K2CO3, DMF" }] }, { aromaticEnabled: false, aromaticRings: {} }, ACS_1996);
    const texts = [...svg.matchAll(/<text[^>]*font-size="([\d.]+)"[^>]*>([^<]*)<\/text>/g)].map((m) => [m[2], Number(m[1])] as const);
    expect(texts.map(([t]) => t)).toEqual(["K", "2", "CO", "3", ", DMF"]);
    // (the counts smaller than the rest)
    expect(texts[1][1]).toBeLessThan(texts[0][1]);
    const width = Number(/width="([\d.]+)/.exec(svg)![1]);
    expect(width).toBeGreaterThan(20);
  });
});
