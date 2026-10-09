import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import {
  connectStoreToDocument,
  createEditorStore,
  EditorProvider,
  storeOf,
  takeOpening,
  useEditorStore,
  type EditorStore,
} from ".";
import { createStructureDocument } from "../document";

function Capture({ into }: { into: EditorStore[] }) {
  into.push(useEditorStore());
  return null;
}

describe("EditorProvider", () => {
  it("gives each canvas its own store even when ids collide", () => {
    // Two canvases given the same id (an embedded canvas's, say) must not
    // share one.
    const stores: EditorStore[] = [];
    renderToString(
      <>
        <EditorProvider tabId="mol2d">
          <Capture into={stores} />
        </EditorProvider>
        <EditorProvider tabId="mol2d">
          <Capture into={stores} />
        </EditorProvider>
      </>
    );
    expect(stores).toHaveLength(2);
    expect(stores[0]).not.toBe(stores[1]);
  });

  it("keeps canvases with separate documents independent", () => {
    // What the provider does in an effect, done by hand here.
    const first = createStructureDocument();
    const second = createStructureDocument();
    const a = createEditorStore(first);
    const b = createEditorStore(second);
    connectStoreToDocument(a, first);
    connectStoreToDocument(b, second);

    a.getState().addAtom(0, 0, "C");

    expect(a.getState().model.atoms).toHaveLength(1);
    expect(b.getState().model.atoms).toHaveLength(0);
    expect(second.history().undoDepth).toBe(0);
  });
});

describe("a canvas made again", () => {
  // (after it failed: ui/layouts/ErrorBoundary)
  it("finds its document's store as it was", () => {
    const doc = createStructureDocument();
    const stores: EditorStore[] = [];
    for (let i = 0; i < 2; i++)
      renderToString(
        <EditorProvider tabId="tab" document={doc}>
          <Capture into={stores} />
        </EditorProvider>
      );
    renderToString(
      <EditorProvider tabId="tab" document={createStructureDocument()}>
        <Capture into={stores} />
      </EditorProvider>
    );
    expect(stores[1]).toBe(stores[0]);
    expect(stores[1]).toBe(storeOf(doc));
    expect(stores[2]).not.toBe(stores[0]);
  });

  it("takes what it was opened with once, however often it is made", () => {
    const store = storeOf(createStructureDocument());
    expect(takeOpening(store)).toBe(true);
    expect(takeOpening(store)).toBe(false);
    expect(takeOpening(storeOf(createStructureDocument()))).toBe(true);
  });

  it("lets go of what it was in the middle of, and keeps the rest", () => {
    const doc = createStructureDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const atom = store.getState().addAtom(0, 0, "C");
    store.setState({
      sel: { atoms: new Set([atom]), bonds: new Set() },
      turns3d: { 1: { q: [0, 0, 0, 1] } as never },
      textsOpen: true,
      hovered: { atomId: atom, bondId: null },
      hoveredCaption: 2,
      hoveredPicture: 3,
      selPictures: new Set([3]),
      boxSelect: { active: true, kind: "lasso", points: [{ x: 0, y: 0 }] },
      pressHold: { atomId: atom, start: 0 },
      moveDrag: { active: true, atomId: atom, pointer: { x: 1, y: 1 }, mode: "free", preview: null },
      panHold: { active: true, pointerId: 1 },
      labelEdit: { active: true, atomId: atom, value: "N", autoCap: true },
      captionEdit: { id: null, at: { x: 0, y: 0 } },
      quickAdd: { at: { x: 0, y: 0 }, x: 0, y: 0, within: { width: 100, height: 100 } },
      pdfWords: {} as never,
      menuAsk: { id: 1, clientX: 0, clientY: 0 },
      pdfSel: {} as never,
    });
    store.getState().startExtend(atom);

    store.getState().letGo();

    const s = store.getState();
    expect(s.hovered).toEqual({ atomId: null, bondId: null });
    expect(s.hoveredCaption).toBeNull();
    expect(s.hoveredPicture).toBeNull();
    expect(s.boxSelect.active).toBe(false);
    expect(s.pressHold).toBeNull();
    expect(s.extend.active).toBe(false);
    expect(s.moveDrag.active).toBe(false);
    expect(s.panHold.active).toBe(false);
    expect(s.labelEdit.active).toBe(false);
    expect(s.captionEdit).toBeNull();
    expect(s.quickAdd).toBeNull();
    expect(s.pdfWords).toBeNull();
    expect(s.menuAsk).toBeNull();
    // (what is selected, how the molecules in 3D are turned, the column, and the drawing itself)
    expect([...s.sel.atoms]).toEqual([atom]);
    expect(s.turns3d[1]).toBeDefined();
    expect(s.textsOpen).toBe(true);
    expect(s.pdfSel).not.toBeNull();
    expect([...s.selPictures]).toEqual([3]);
    expect(s.model.atoms).toHaveLength(1);
    expect(doc.history().undoDepth).toBe(1);
  });
});
