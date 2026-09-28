import { create, type StoreApi, type UseBoundStore } from "zustand";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import type { DocumentStore } from "../../../../lib/doc";
import { createStructureDocument, type StructureDocument } from "../document";
import type { EditorState } from "./types";
import { createModelSlice } from "./slices/modelSlice";
import { createSelectionSlice } from "./slices/selectionSlice";
import { createHoverSlice } from "./slices/hoverSlice";
import { createInteractionSlice } from "./slices/interactionSlice";
import { createUiSlice } from "./slices/uiSlice";

// Re-export types for backward compatibility
export * from "./types";

export type EditorStore = UseBoundStore<StoreApi<EditorState>>;

/**
 * The part of the store that mirrors the document. Components keep reading
 * `model`, `arrows` and the aromatic flags from the store, while the document
 * is what actually holds them - which is how undo and redo reach the canvas.
 */
function mirrorOf(doc: StructureDocument) {
  return {
    model: doc.model,
    arrows: doc.arrows,
    aromaticEnabled: doc.aromaticEnabled,
    aromaticRings: doc.aromaticRings,
    nextId: doc.nextId,
    nextArrowId: doc.nextArrowId,
    docStyle: doc.style,
  };
}

/**
 * Mirrors the document into the store and keeps doing so. Returns the
 * unsubscribe, so a canvas that goes away stops listening - and one that comes
 * back (React StrictMode remounts it in dev) subscribes again and catches up
 * on whatever changed meanwhile.
 */
export function connectStoreToDocument(
  store: EditorStore,
  doc: DocumentStore<StructureDocument>,
): () => void {
  const sync = () =>
    store.setState((prev) => ({ ...prev, ...mirrorOf(doc.getState()) }));
  sync();
  return doc.subscribe(sync);
}

export function createEditorStore(
  doc: DocumentStore<StructureDocument>,
): EditorStore {
  const store = create<EditorState>((set, get) => ({
    // Document state, mirrored. Never written directly: the slices edit the
    // document and the subscription below brings the change back here.
    ...mirrorOf(doc.getState()),

    // Ephemeral view state: hover, gestures, camera requests, edit buffers.
    sel: { atoms: new Set<number>(), bonds: new Set<number>() },
    hovered: { atomId: null, bondId: null },
    hoverPulse: { id: null, nonce: 0, until: 0 },
    fitNonce: 0,
    autoFitSuspended: false,
    labelEdit: { active: false, atomId: null, value: "", autoCap: true },
    moveDrag: {
      active: false,
      atomId: null,
      pointer: null,
      mode: "snap",
      preview: null,
    },
    extend: { active: false, atomId: null, pointer: null, mode: "snap" },
    panHold: { active: false, pointerId: null },
    suppressDblClickUntil: 0,
    savedPath: null,

    ...createModelSlice(doc, set, get),
    ...createSelectionSlice(set),
    ...createHoverSlice(set),
    ...createUiSlice(doc, set, get),
    ...createInteractionSlice(set, get),
  }));

  return store;
}

const EditorStoreContext = createContext<EditorStore | null>(null);

export function EditorProvider({
  tabId,
  document,
  children,
}: {
  tabId: string;
  /**
   * The tab's document. Canvases outside the tab shell - the workflow
   * editor's sketch node - get one of their own, so they keep working.
   */
  document?: DocumentStore<StructureDocument>;
  children: ReactNode;
}) {
  const doc = useMemo(
    () => document ?? createStructureDocument(),
    // A different tab identity means a different canvas, so a canvas without a
    // document of its own gets a fresh one rather than keeping the old tab's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [document, tabId],
  );
  // One store per provider instance. Deliberately not a module-level registry
  // keyed by tabId: ids are not globally unique (the workflow editor's sketch
  // node is "mol2d" in every Workflow Builder tab).
  const store = useMemo(() => createEditorStore(doc), [doc]);
  useEffect(() => connectStoreToDocument(store, doc), [store, doc]);
  return (
    <EditorStoreContext.Provider value={store}>
      {children}
    </EditorStoreContext.Provider>
  );
}

export function useEditorStore(): EditorStore {
  const store = useContext(EditorStoreContext);
  if (!store)
    throw new Error("useEditorStore must be used within EditorProvider");
  return store;
}

export function useEditor<T = EditorState>(
  selector?: (s: EditorState) => T,
): T {
  const store = useEditorStore();
  // NOTE: this is a bound store hook; call it directly
  // When no selector is provided, return the entire state
  return (store as unknown as (sel?: (s: EditorState) => T) => T)(
    selector ?? ((s: EditorState) => s as unknown as T),
  );
}
