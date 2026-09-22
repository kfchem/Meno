import "./App.css";
import { useCallback, useReducer, useState } from "react";
import TopBar, { type TabsController } from "./ui/layouts/TopBar";
import {
  reducer,
  createInitialState,
  canOpenKind,
  TOO_MANY_CANVASES,
  TabKind,
} from "./lib/core";
import { Deck, viewRegistry, type ViewEntry } from "./ui/views";

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  // Shown when an action is refused, e.g. the WebGL canvas budget is full.
  const [notice, setNotice] = useState<string | null>(null);

  const ctl: TabsController = {
    tabOrder: state.tabOrder,
    tabsById: Object.fromEntries(
      Object.entries(state.tabsById).map(([k, v]) => [k, (v as any).meta])
    ),
    activeId: state.activeId,
    reorder: (order) => dispatch({ type: "REORDER", order }),
    select: (id) => dispatch({ type: "SELECT_TAB", id }),
    close: (id) => dispatch({ type: "CLOSE_TAB", id }),
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
      <Deck
        order={state.mountOrder}
        tabs={state.tabsById}
        activeId={state.activeId}
        resolveView={resolveView}
        patchData={patchData}
        replaceData={replaceData}
      />
    </div>
  );
}
