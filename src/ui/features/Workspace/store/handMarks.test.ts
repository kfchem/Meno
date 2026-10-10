import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument, writtenAsLabels } from "../document";
import { writeMolfile } from "../../../../lib/chem/molWriter";
import { forFlatReaders } from "../chem/drawing";
import { stereoPlaces } from "../chem/marks";
import { readDrawn, recordText } from "../utils/copyPaste";
import { readWorkspace, workspaceText } from "../utils/workspace";
import { drawnOf } from "../fileActions";
import { marksAtOf, turnedBy } from "../utils/selection";

function editor() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, state: () => store.getState() };
}

/** Methylammonium: a charge, and an atom and a bond to put marks of. */
function drawn(state: ReturnType<typeof editor>["state"]) {
  const c = state().addAtom(0, 0, "C");
  const n = state().addAtomBonded(c, 1.5, 0, "N", 1);
  state().stepCharge(n, 1);
  return { c, n };
}

describe("charges, R and S put by hand", () => {
  it("stay where a hand puts them, one step for a drag, and go back where the drawing puts them", () => {
    const { doc, state } = editor();
    const { n } = drawn(state);
    const depth = doc.history().undoDepth;
    for (const x of [0.5, 0.8, 1]) state().putMark({ atom: n, kind: "charge" }, { x, y: 1 }, "drag");
    expect(state().model.atoms.find((a) => a.id === n)!.chargeAt).toEqual({ x: 1, y: 1 });
    expect(doc.history().undoDepth).toBe(depth + 1);
    state().putMark({ atom: n, kind: "stereo" }, { x: -1, y: 0 });
    expect(state().model.atoms.find((a) => a.id === n)).toMatchObject({ chargeAt: { x: 1, y: 1 }, stereoAt: { x: -1, y: 0 } });
    // (back: as if never moved)
    state().putMark({ atom: n, kind: "charge" }, null);
    const back = state().model.atoms.find((a) => a.id === n)!;
    expect(back.chargeAt).toBeUndefined();
    expect(back.stereoAt).toEqual({ x: -1, y: 0 });
    doc.undo();
    expect(state().model.atoms.find((a) => a.id === n)!.chargeAt).toEqual({ x: 1, y: 1 });
    // (its charge changed, still where it was put; no charge left to put, gone - and a new one where the drawing puts it)
    state().stepCharge(n, 1);
    expect(state().model.atoms.find((a) => a.id === n)!.chargeAt).toEqual({ x: 1, y: 1 });
    state().stepCharge(n, -1);
    state().stepCharge(n, -1);
    expect(state().model.atoms.find((a) => a.id === n)!.charge).toBeUndefined();
    expect(state().model.atoms.find((a) => a.id === n)!.chargeAt).toBeUndefined();
  });

  it("are kept in a saved workspace and a copy - those that do not read as a place left where the drawing puts them", () => {
    const { state } = editor();
    const { n } = drawn(state);
    const b = state().model.bonds[0].id;
    state().putMark({ atom: n, kind: "charge" }, { x: 0.5, y: 0.75 });
    state().putMark({ bond: b }, { x: 0, y: -1 });
    const ws = readWorkspace(workspaceText({ ...state(), turns3d: {}, frames3d: {}, lists3d: {} }))!;
    expect(ws.drawn.atoms.find((a) => a.id === n)!.chargeAt).toEqual({ x: 0.5, y: 0.75 });
    expect(ws.drawn.bonds.find((x) => x.id === b)!.stereoAt).toEqual({ x: 0, y: -1 });
    const copied = readDrawn(JSON.parse(recordText(drawnOf(state()))));
    expect(copied?.atoms.find((a) => a.id === n)!.chargeAt).toEqual({ x: 0.5, y: 0.75 });
    // (nonsense, or far off the page: back where the drawing puts it)
    const bad = readDrawn({
      atoms: [
        { id: 1, x: 0, y: 0, el: "N", chargeAt: { x: "a", y: 1 } },
        { id: 2, x: 1, y: 0, el: "O", chargeAt: { x: 1e9, y: 0 }, stereoAt: { x: 1, y: 2 } },
      ],
      bonds: [{ id: 3, a: 1, b: 2, order: 1, stereoAt: null }],
    })!;
    expect(bad.atoms[0].chargeAt).toBeUndefined();
    expect(bad.atoms[1].chargeAt).toBeUndefined();
    expect(bad.atoms[1].stereoAt).toEqual({ x: 1, y: 2 });
    expect("stereoAt" in bad.bonds[0]).toBe(false);
  });

  it("are turned and turned over with their atoms, and put back by Clean-up", () => {
    const { state } = editor();
    const { c, n } = drawn(state);
    state().putMark({ atom: n, kind: "charge" }, { x: 1, y: 0 });
    // (turned a quarter round with them)
    const turned = marksAtOf(state().model, new Set([c, n]), turnedBy(Math.PI / 2))!;
    expect(turned.atoms[0].chargeAt!.x).toBeCloseTo(0);
    expect(turned.atoms[0].chargeAt!.y).toBeCloseTo(1);
    // (turned over left to right with them)
    state().setSel({ atoms: new Set([c, n]), bonds: new Set() });
    state().turnSelectionOver("vertical");
    expect(state().model.atoms.find((a) => a.id === n)!.chargeAt).toEqual({ x: -1, y: 0 });
    // (cleaned up: back where the drawing puts it - the structure laid anew, they were put for it as it was)
    state().putMark({ atom: n, kind: "stereo" }, { x: 2, y: 2 });
    state().relayout({ atoms: state().model.atoms.map((a) => ({ id: a.id, x: a.x, y: a.y })), bonds: [] });
    const after = state().model.atoms.find((a) => a.id === n)!;
    expect(after.chargeAt).toBeUndefined();
    expect(after.stereoAt).toBeUndefined();
  });

  it("place an R or S put by hand where it was put, the others clear of it", () => {
    const model = {
      atoms: [
        { id: 1, x: 0, y: 0, r: 0.9, el: "C" },
        { id: 2, x: 1.5, y: 0, r: 0.9, el: "C" },
        { id: 3, x: -0.75, y: 1.3, r: 0.9, el: "C" },
      ],
      bonds: [
        { id: 10, a: 1, b: 2, order: 1 as const },
        { id: 11, a: 1, b: 3, order: 1 as const },
      ],
    };
    const common = {
      model,
      centres: new Map([
        [1, "R"],
        [2, "S"],
      ]),
      doubleBonds: new Map<number, string>(),
      boxes: new Map(),
      half: () => ({ x: 0.1, y: 0.1 }),
      apart: 0.05,
      off: 0.1,
      bond: 1.5,
    };
    const free = stereoPlaces(common);
    const fixed = stereoPlaces({ ...common, fixed: new Map([["centre-1", { x: 0.75, y: 0.2 }]]) });
    expect(fixed.find((p) => p.key === "centre-1")).toMatchObject({ x: 0.75, y: 0.2, text: "R" });
    // (the other kept clear of it)
    const other = fixed.find((p) => p.key === "centre-2")!;
    expect(Math.abs(other.x - 0.75) > 0.25 || Math.abs(other.y - 0.2) > 0.25).toBe(true);
    expect(free.find((p) => p.key === "centre-1")).not.toMatchObject({ x: 0.75, y: 0.2 });
  });
});

describe("a group named as an element is (Ac, Pr, Ts, Fm, At)", () => {
  it("typed as a label, is the group it holds: written out as the group, drawn out again as it", () => {
    const { doc, state } = editor();
    const c = state().addAtom(0, 0, "C");
    const x = state().addAtomBonded(c, 1.5, 0, "C", 1);
    state().beginLabelEdit(x, "ac");
    state().setLabelEditValue("Ac");
    state().commitLabelEdit("ac");
    const a = state().model.atoms.find((at) => at.id === x)!;
    expect(a.el).toBe("Ac");
    expect(a.abbrev?.atoms.map((at) => at.el)).toEqual(["C", "C", "O"]);
    // (what was typed, kept: to be had back from its menu)
    expect(a.typed).toBe("ac");
    // (a MOL file holds the acetyl group, as a superatom - no actinium)
    const mol = writeMolfile(forFlatReaders(drawnOf(state())));
    expect(mol).not.toMatch(/\bAc\s+0\s+0/);
    expect(mol).toMatch(/SUP|STY/);
    // (drawn out: the acetyl's atoms)
    state().expandAbbreviation(x);
    expect(state().model.atoms.map((at) => at.el).sort()).toEqual(["C", "C", "C", "O"]);
    doc.undo();
    // (typed as an element with more: the element, as typed - AcH is no group)
    state().beginLabelEdit(x, "");
    state().setLabelEditValue("N");
    state().commitLabelEdit("N");
    expect(state().model.atoms.find((at) => at.id === x)).toMatchObject({ el: "N" });
    expect(state().model.atoms.find((at) => at.id === x)!.typed).toBeUndefined();
  });

  it("written by Clean-up by its label, holds the group: N-tosyl stays tosyl, not tennessine", () => {
    const { state } = editor();
    const n = state().addAtom(0, 0, "N");
    const s = state().addAtomBonded(n, 1.5, 0, "S", 1);
    const done = writtenAsLabels(
      { ...createWorkspaceDocument().getState(), model: state().model },
      [{ atoms: [s], at: s, label: "Ts" }],
    );
    const ts = done.model.atoms.find((a) => a.id === s)!;
    expect(ts.el).toBe("Ts");
    expect(ts.abbrev?.atoms.some((a) => a.el === "S")).toBe(true);
  });
});
