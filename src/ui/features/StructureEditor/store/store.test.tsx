import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import {
  connectStoreToDocument,
  createEditorStore,
  EditorProvider,
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
    // Every Workflow Builder tab embeds a sketch canvas with the node id
    // "mol2d"; those canvases must not share one.
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
