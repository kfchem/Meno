import "./App.css";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import TopBar, { type TabsController } from "./ui/layouts/TopBar";
import {
  reducer,
  createInitialState,
  canOpenKind,
  TOO_MANY_CANVASES,
  TabKind,
} from "./lib/core";
import { Deck, viewRegistry, type ViewEntry } from "./ui/views";
import DocumentBridge from "./ui/views/DocumentBridge";
import type { TabInstance } from "./lib/core";
import type { DocumentStore } from "./lib/doc";
import { undoIntent } from "./lib/doc/shortcuts";

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  // Shown when an action is refused, e.g. the WebGL canvas budget is full.
  const [notice, setNotice] = useState<string | null>(null);

  // One document per tab, for the view kinds that declare `createDocument`.
  // Documents live outside React state: each is its own store and notifies
  // its subscribers, so the app shell only has to hand them out.
  const documentsRef = useRef(
    new Map<string, { kind: string; doc: DocumentStore<any> }>(),
  );
  const getDocument = useCallback((tab: TabInstance) => {
    const entry = viewRegistry[tab.content.kind];
    if (!entry?.createDocument) return undefined;
    const held = documentsRef.current.get(tab.meta.id);
    // A tab changes kind when a file is opened into it; start a fresh document.
    if (held && held.kind === tab.content.kind) return held.doc;
    const doc = entry.createDocument(tab.content.data);
    documentsRef.current.set(tab.meta.id, { kind: tab.content.kind, doc });
    return doc;
  }, []);

  // Undo/redo belong to the active tab, not to the app as a whole.
  const activeIdRef = useRef(state.activeId);
  useEffect(() => {
    activeIdRef.current = state.activeId;
  }, [state.activeId]);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const intent = undoIntent({
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        target: e.target,
      });
      if (!intent) return;
      const id = activeIdRef.current;
      const held = id ? documentsRef.current.get(id) : undefined;
      if (!held) return;
      const changed =
        intent === "undo" ? held.doc.undo() : held.doc.redo();
      if (changed) e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const ctl: TabsController = {
    tabOrder: state.tabOrder,
    tabsById: Object.fromEntries(
      Object.entries(state.tabsById).map(([k, v]) => [k, (v as any).meta])
    ),
    activeId: state.activeId,
    reorder: (order) => dispatch({ type: "REORDER", order }),
    select: (id) => dispatch({ type: "SELECT_TAB", id }),
    close: (id) => {
      documentsRef.current.delete(id);
      dispatch({ type: "CLOSE_TAB", id });
    },
    add: () => {
      const t = viewRegistry.loader.create("New Tab");
      dispatch({ type: "ADD_TAB", tab: t });
    },
    openByKind: async (kind: TabKind, opts?: { label?: string }) => {
      if (!canOpenKind(state, kind)) {
        setNotice(TOO_MANY_CANVASES);
        return;
      }
      const entry: ViewEntry = viewRegistry[kind] ?? viewRegistry.loader;
      const label = opts?.label ?? "New Tab";
      const tab = entry.create(label);
      dispatch({ type: "ADD_TAB", tab });
    },
  };

  const resolveView = useCallback(
    (kind: string): ViewEntry | Promise<ViewEntry> => {
      if (kind in viewRegistry) return viewRegistry[kind];
      return viewRegistry.loader;
    },
    []
  );

  const patchData = (id: string, patch: any) => {
    if (patch?.filename) {
      dispatch({ type: "RENAME_TAB", id, label: patch.filename });
    }
    dispatch({ type: "PATCH_DATA", id, patch });
    dispatch({ type: "SET_DIRTY", id, dirty: true });
  };

  // Explicit replace flow (used by OmniLoader and similar)
  const replaceData = (id: string, next: any) => {
    const nextKind = next?.kind ?? "loader";
    if (!canOpenKind(state, nextKind, id)) {
      setNotice(TOO_MANY_CANVASES);
      return;
    }
    const nextData = { ...next };
    // Keep `filename` in the data: views use it (e.g. the 2D editor's
    // `initialFilename`) to pick a parser by extension.
    const filename = nextData.filename as string | undefined;
    delete (nextData as any).kind;
    if (filename) dispatch({ type: "RENAME_TAB", id, label: filename });
    dispatch({ type: "SET_CONTENT", id, content: { kind: nextKind, data: nextData } });
  };

  return (
    <div className="h-screen w-screen flex flex-col relative">
      <TopBar ctl={ctl} />
      {notice && (
        <div
          role="alert"
          className="absolute top-12 left-1/2 -translate-x-1/2 z-50 max-w-[90%] flex items-start gap-3 rounded-md border border-gh-line bg-white/95 shadow-sm px-3 py-2 text-xs text-gh-black"
        >
          <span className="break-words">{notice}</span>
          <button
            onClick={() => setNotice(null)}
            className="shrink-0 underline text-gh-gray hover:text-gh-black"
          >
            OK
          </button>
        </div>
      )}
      {state.mountOrder.map((id) => {
        const tab = state.tabsById[id];
        const entry = tab ? viewRegistry[tab.content.kind] : undefined;
        const doc = tab ? getDocument(tab) : undefined;
        if (!tab || !entry || !doc) return null;
        return (
          <DocumentBridge
            key={id}
            id={id}
            document={doc}
            toTabData={entry.toTabData}
            dispatch={dispatch}
          />
        );
      })}
      <Deck
        order={state.mountOrder}
        tabs={state.tabsById}
        activeId={state.activeId}
        resolveView={resolveView}
        patchData={patchData}
        replaceData={replaceData}
        getDocument={getDocument}
      />
    </div>
  );
}
