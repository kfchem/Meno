import "./App.css";
import { useCallback, useReducer } from "react";
import TopBar, { type TabsController } from "./ui/layouts/TopBar";
import { reducer, createInitialState, TabKind } from "./lib/core";
import { Deck, viewRegistry, type ViewEntry } from "./ui/views";

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);

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
    const nextData = { ...next };
    const filename = nextData.filename as string | undefined;
    delete (nextData as any).kind;
    delete (nextData as any).filename;
    if (filename) dispatch({ type: "RENAME_TAB", id, label: filename });
    dispatch({ type: "SET_CONTENT", id, content: { kind: nextKind, data: nextData } });
  };

  return (
    <div className="h-screen w-screen flex flex-col">
      <TopBar ctl={ctl} />
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
