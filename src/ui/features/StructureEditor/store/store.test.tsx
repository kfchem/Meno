import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { EditorProvider, useEditorStore, type EditorStore } from ".";

function Capture({ into }: { into: EditorStore[] }) {
  into.push(useEditorStore());
  return null;
}

describe("EditorProvider", () => {
  it("gives each canvas its own store even when ids collide", () => {
    // Every Workflow Builder tab embeds a sketch canvas with the node id
    // "mol2d"; those canvases must not share a model.
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

    stores[0].getState().addAtom(0, 0, "C");
    expect(stores[0].getState().model.atoms).toHaveLength(1);
    expect(stores[1].getState().model.atoms).toHaveLength(0);
  });
});
