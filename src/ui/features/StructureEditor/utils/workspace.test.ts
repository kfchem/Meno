import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../lib/calc/workers", () => ({ readerClient: () => Promise.reject(new Error("no workers in tests")) }));
import { connectStoreToDocument, createEditorStore } from "../store";
import { createStructureDocument } from "../document";
import { DEFAULT_STYLE_CHOICE } from "../../../../lib/chem/style";
import { readWorkspace, workspaceText } from "./workspace";
import { askFor, rememberOutput } from "../../../../lib/calc/asks";
import { floatsText, resultKey } from "../../../../lib/calc/results";

const water3d = {
  atoms: [
    { el: "O", x: 0, y: 0, z: 0 },
    { el: "H", x: 0.76, y: 0.59, z: 0 },
    { el: "H", x: -0.76, y: 0.59, z: 0 },
  ],
  bonds: [
    { a1: 0, a2: 1, order: 1 },
    { a1: 0, a2: 2, order: 1 },
  ],
  frames: [[0, 0, 0, 0.8, 0.6, 0, -0.8, 0.6, 0]],
  look: "space" as const,
  measures: [{ id: 1, atoms: [1, 0, 2] }],
};

/** A canvas holding a drawn ethanol, an arrow, two molecules in 3D - one turned, showing its second frame - and a style of its own. */
function canvas() {
  const doc = createStructureDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const st = () => store.getState();
  const a = st().addAtom(0, 0, "C");
  const b = st().addAtom(1.8, 0, "C");
  const c = st().addAtom(2.7, 1.5, "O");
  st().addBond(a, b, 1);
  st().addBond(b, c, 1);
  st().addArrow(6, 0);
  st().pasteModel({ atoms: [], bonds: [], molecules3d: [{ ...water3d, at: { x: 10, y: 0 } }, { ...water3d, at: { x: 14, y: 0 } }] });
  st().setTurn3d(2, [0, 0, Math.SQRT1_2, Math.SQRT1_2]);
  st().setFrame3d(2, 1);
  st().setDocumentStyle({ ...DEFAULT_STYLE_CHOICE, changes: { bondColor: "#204080" } } as never);
  return { doc, st };
}

describe("a workspace file", () => {
  it("holds everything on the canvas, and reads back as it was", () => {
    const { st } = canvas();
    const ws = readWorkspace(workspaceText(st()));
    expect(ws).not.toBeNull();
    expect(ws!.drawn.atoms.map((x) => x.el)).toEqual(["C", "C", "O"]);
    expect(ws!.drawn.bonds).toHaveLength(2);
    expect(ws!.drawn.arrows).toHaveLength(1);
    expect(ws!.drawn.molecules3d).toHaveLength(2);
    const [first, second] = ws!.drawn.molecules3d!;
    expect(first.turn).toBeUndefined();
    expect(second.turn).toEqual([0, 0, Math.SQRT1_2, Math.SQRT1_2]);
    expect(second.frame).toBe(1);
    expect(second.look).toBe("space");
    expect(second.measures).toEqual([{ id: 1, atoms: [1, 0, 2] }]);
    expect(second.frames).toEqual(water3d.frames);
  });

  it("opens on another canvas just as it was saved: turned, in its frame, its style its own", () => {
    const { st } = canvas();
    const text = workspaceText(st());
    const doc = createStructureDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    store.getState().openWorkspace(readWorkspace(text)!, true);
    const s = store.getState();
    expect(s.model.atoms).toHaveLength(3);
    expect(s.arrows).toHaveLength(1);
    expect(s.molecules3d.map((m) => m.at)).toEqual([
      { x: 10, y: 0 },
      { x: 14, y: 0 },
    ]);
    expect(s.turns3d).toEqual({ 2: [0, 0, Math.SQRT1_2, Math.SQRT1_2] });
    expect(s.frames3d).toEqual({ 2: 1 });
    expect(s.docStyle).toEqual(st().docStyle);
    // where the document starts: nothing to undo
    expect(doc.history().undoDepth).toBe(0);
  });

  it("opened over a canvas is one step, undone as one", () => {
    const { st } = canvas();
    const text = workspaceText(st());
    const doc = createStructureDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    store.getState().addAtom(0, 0, "N");
    store.getState().openWorkspace(readWorkspace(text)!);
    expect(store.getState().molecules3d).toHaveLength(2);
    doc.undo();
    expect(store.getState().molecules3d).toHaveLength(0);
    expect(store.getState().model.atoms.map((a) => a.el)).toEqual(["N"]);
  });

  it("opens with a calculation's list open as it was, its row's surface - given - kept, at the value it was drawn at", async () => {
    // a molecule read from a cube file, its first grid shown and given; the
    // second a promise still
    const source = await rememberOutput("water.cube", "the cube");
    const grid = { origin: [0, 0, 0], axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], counts: [2, 2, 2], values: floatsText(new Float32Array(8)), signed: true };
    await askFor({ readers: ["Cube files"], source }, "Cube files", "grid:0", async () => ({ version: "", read: () => Promise.reject(), ask: async () => grid }));
    const calc = {
      readers: ["Cube files"],
      source,
      results: [{ id: "grids", on: "list", group: "Orbitals", label: "Orbitals", from: "Cube files", columns: [{ label: "Grid" }], rows: [{ cells: ["1"], surface: { ask: "grid:0" } }, { cells: ["2"], surface: { ask: "grid:1" } }] }],
    };
    const doc = createStructureDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    store.getState().pasteModel({ atoms: [], bonds: [], molecules3d: [{ ...water3d, at: { x: 0, y: 0 }, calc: calc as never }] });
    store.getState().openList3d(1, resultKey({ id: "grids", from: "Cube files" }));
    store.getState().chooseRow3d(1, 0);
    store.getState().setIso3d(1, 0.02);
    const text = workspaceText(store.getState());

    const again = createStructureDocument();
    const other = createEditorStore(again);
    connectStoreToDocument(other, again);
    other.getState().openWorkspace(readWorkspace(text)!, true);
    expect(other.getState().lists3d).toEqual({ 1: { list: resultKey({ id: "grids", from: "Cube files" }), row: 0, pointed: null, iso: 0.02 } });
    const rows = (other.getState().molecules3d[0].calc!.results![0] as { rows: { surface?: unknown }[] }).rows;
    expect(rows[0].surface).toEqual(grid);
    expect(rows[1].surface).toEqual({ ask: "grid:1" });
    expect(other.getState().molecules3d[0].calc!.source).toEqual(source);
  });

  it("is not read where it is not one, or of a version this one does not read", () => {
    expect(readWorkspace("not json")).toBeNull();
    expect(readWorkspace(JSON.stringify({ format: "meno-structure", version: 1, atoms: [], bonds: [] }))).toBeNull();
    expect(readWorkspace(JSON.stringify({ format: "meno-workspace", version: 2, atoms: [], bonds: [] }))).toBeNull();
  });
});
