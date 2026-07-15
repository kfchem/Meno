import { create, type StoreApi, type UseBoundStore } from "zustand";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import type { EditorState } from "./types";
import { createModelSlice } from "./slices/modelSlice";
import { createSelectionSlice } from "./slices/selectionSlice";
import { createHoverSlice } from "./slices/hoverSlice";
import { createInteractionSlice } from "./slices/interactionSlice";
import { createUiSlice } from "./slices/uiSlice";

// Re-export types for backward compatibility
export * from "./types";

export type EditorStore = UseBoundStore<StoreApi<EditorState>>;

export function createEditorStore(): EditorStore {
  return create<EditorState>((set, get) => ({
    // Initial State (must match EditorState type)
    model: { atoms: [], bonds: [] },
    sel: { atoms: new Set<number>(), bonds: new Set<number>() },
    hovered: { atomId: null, bondId: null },
    hoverPulse: { id: null, nonce: 0, until: 0 },
    fitNonce: 0,
    autoFitSuspended: false,
    arrows: [],
    aromaticEnabled: false,
    aromaticRings: {},
    labelEdit: { active: false, atomId: null, value: "", autoCap: true },
    moveDrag: { active: false, atomId: null, pointer: null, mode: "snap" },
    extend: { active: false, atomId: null, pointer: null, mode: "snap" },
    panHold: { active: false, pointerId: null },
    suppressDblClickUntil: 0,
    nextId: 1,
    nextArrowId: 1,
    set: (fn) =>
      set((s: EditorState) => {
        const next = { ...s };
        fn(next);
        return next;
      }),

    // Spread slices
    ...createModelSlice(set, get),
    ...createSelectionSlice(set),
    ...createHoverSlice(set),
    ...createUiSlice(set),
    ...createInteractionSlice(set, get),
  }));
}

const storeRegistry = new Map<string, EditorStore>();

function getOrCreate(tabId: string): EditorStore {
  let s = storeRegistry.get(tabId);
  if (!s) {
    s = createEditorStore();
    storeRegistry.set(tabId, s);
  }
  return s;
}

const EditorStoreContext = createContext<EditorStore | null>(null);

export function EditorProvider({
  tabId,
  children,
}: {
  tabId: string;
  children: ReactNode;
}) {
  const store = useMemo(() => getOrCreate(tabId), [tabId]);
  useEffect(
    () => () => {
      // Clean up store when provider unmounts (tab closed)
      storeRegistry.delete(tabId);
    },
    [tabId],
  );
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
