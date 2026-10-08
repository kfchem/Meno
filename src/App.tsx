import { AnimatePresence, motion } from "motion/react";
import { RISE } from "./ui/theme/motion";
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
import { openedAs, openedTexts, OPENABLE, textsOf, workspaceOfFile, type Opened } from "./ui/views/openFile";
import { textTakerOf, type OpenedText } from "./ui/views/texts";
import type { Action, State, TabInstance } from "./lib/core";
import type { DocumentStore } from "./lib/doc";
import { keepClipboard, keepPageUnselected, openIntent, undoIntent } from "./lib/doc/shortcuts";
import { saverOf } from "./lib/doc/savers";
import { isBlankDocument, type StructureDocument } from "./ui/features/StructureEditor/document";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { MENO_KINDS } from "./lib/io/kinds";
import { kindOfFile } from "./lib/calc/probe";
import { addedReaders } from "./lib/calc/workers";
import { READERS, WRITER_PLUGINS } from "./lib/calc/catalog";
import ConfirmDiscard from "./ui/layouts/ConfirmDiscard";
import { loadAppSettings, useAppSettings } from "./lib/settings/appSettings";
import {
  applyNetworkSettings,
  startNetwork,
  useNetwork,
} from "./lib/net/network";
import ConsentDialog from "./ui/network/ConsentDialog";
import NetworkToasts from "./ui/network/NetworkToasts";
import UpdateNotice from "./ui/network/UpdateNotice";
import { startUpdates } from "./lib/update";
import { showSettingsSection } from "./ui/features/SettingsPanel/section";
import { letOfficeGo, officeInUse, startedForOffice, takeOfficeStructures, watchOffice } from "./lib/ole";

/** How long a Meno started for Office waits for Office to ask it for something. */
const OFFICE_GRACE_MS = 1500;

/** The object in an Office document a tab was opened from, if it was (lib/ole). */
const officeIdOf = (tab: TabInstance | undefined) =>
  (tab?.content.data as { officeId?: number } | undefined)?.officeId;

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  // The tabs as they are, for what is registered once and called later - and
  // brought up to date at once by `act`, for what acts twice in a row.
  const stateRef = useRef<State>(state);
  stateRef.current = state;
  const act = (action: Action) => {
    stateRef.current = reducer(stateRef.current, action);
    dispatch(action);
  };
  // Shown when an action is refused, e.g. the WebGL canvas budget is full.
  const [notice, setNotice] = useState<string | null>(null);
  // Something with unsaved changes, waiting on a yes or a no.
  const [pendingClose, setPendingClose] = useState<
    { kind: "tab"; id: string } | { kind: "window" } | null
  >(null);

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

  // The plugins added on this computer, looked at once as Meno starts: the
  // kinds they bring registered (lib/io/kinds), for whatever is opened,
  // dropped or pasted, and those they write offered by Export.
  useEffect(() => {
    if (isTauri()) void addedReaders([...READERS, ...WRITER_PLUGINS.filter((p) => !READERS.includes(p))]).catch(() => {});
  }, []);

  // The application's settings - the drawing style among them - read once,
  // and the network brought into line with them: offline or not, and what
  // has been allowed. From then on, a change to either is saved.
  useEffect(() => {
    let stopUpdates: (() => void) | undefined;
    let gone = false;
    void (async () => {
      await startNetwork();
      await loadAppSettings();
      await applyNetworkSettings(useAppSettings.getState().network);
      // keeping Meno up to date, as the network now allows (lib/update)
      if (!gone) stopUpdates = startUpdates();
    })();
    const unwatch = useNetwork.subscribe((s, prev) => {
      if (!useAppSettings.getState().loaded) return;
      const sameGrants = s.granted.join("\n") === prev.granted.join("\n");
      if (s.offline === prev.offline && sameGrants) return;
      useAppSettings.getState().setNetwork({ offline: s.offline, granted: s.granted });
    });
    return () => {
      gone = true;
      stopUpdates?.();
      unwatch();
    };
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

  // Ctrl/Cmd+A never selects the app's own words, and Ctrl/Cmd+C with
  // nothing to copy leaves the clipboard alone: see keepPageUnselected and
  // keepClipboard.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keepPageUnselected(e);
      keepClipboard(e, window.getSelection());
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // The last tab closed, Meno goes with it. (Destroyed, not closed: what
  // was unsaved has been asked about already.)
  const closeTab = (id: string) => {
    documentsRef.current.delete(id);
    const last = stateRef.current.tabOrder.every((x) => x === id);
    act({ type: "CLOSE_TAB", id });
    if (last) {
      try {
        void getCurrentWindow().destroy().catch(() => {});
      } catch {}
    }
  };

  // A canvas nothing is drawn on, nor opened into: what a file opened takes
  // the place of, and nothing to keep a Meno started for Office open.
  const isBlankTab = (t: TabInstance | undefined): t is TabInstance => {
    if (!t || t.content.kind !== "structure" || officeIdOf(t) != null) return false;
    if ((t.content.data as { payload?: string } | undefined)?.payload) return false;
    const doc = documentsRef.current.get(t.meta.id)?.doc as DocumentStore<StructureDocument> | undefined;
    return !doc || isBlankDocument(doc.getState());
  };

  // Something opened - a file, a structure from a document - in a tab of its
  // own: in place of the tab in front, if that is a blank canvas. False when
  // there is no room for another canvas.
  const openTab = (opened: Opened): boolean => {
    const s = stateRef.current;
    const front = s.activeId ? s.tabsById[s.activeId] : undefined;
    const blank = isBlankTab(front) ? front.meta.id : undefined;
    if (!canOpenKind(s, opened.kind, blank)) {
      setNotice(TOO_MANY_CANVASES);
      return false;
    }
    const made = viewRegistry[opened.kind].create(opened.label);
    const tab = { ...made, content: { ...made.content, data: opened.data } } as TabInstance;
    if (blank) {
      documentsRef.current.delete(blank);
      act({ type: "REPLACE_TAB", id: blank, tab });
    } else act({ type: "ADD_TAB", tab });
    return true;
  };

  // Texts opened - files, or a new one - held in the workspace `into`, the
  // tab that was in front as they were opened, and shown in its column; on
  // a canvas of their own where it takes none (ui/views/texts).
  const openTexts = (texts: OpenedText[], into: string | null): boolean => {
    const take = into ? textTakerOf(into) : undefined;
    if (!take) return openTab(openedTexts(texts));
    take(texts);
    return true;
  };

  // Open (Ctrl/Cmd+O, or the menu): files picked in the system's dialog,
  // each in a tab, by what it is (openFile) - text in the workspace in
  // front. Tauri's dialog gives each file's path, which goes with it;
  // outside Tauri - the browser dev server - the page's own picker stands
  // in, and gives none.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pickFiles = async () => {
    if (!isTauri()) {
      fileInputRef.current?.click();
      return;
    }
    const into = stateRef.current.activeId;
    const picked = await openDialog({
      multiple: true,
      filters: [{ name: "Files Meno opens", extensions: OPENABLE.map((ext) => ext.slice(1)) }],
    }).catch(() => null);
    const texts: OpenedText[] = [];
    for (const path of picked ?? []) {
      const name = path.split(/[\\/]/).pop() || path;
      try {
        const bytes = await readFile(path);
        // (a workspace file: its workspace, and the outputs it keeps held)
        const workspace = workspaceOfFile(bytes);
        if (workspace != null) {
          openTab(openedAs(name, workspace, path, MENO_KINDS.workspace));
          continue;
        }
        const text = new TextDecoder().decode(bytes);
        // (what it is: told by what it holds - or, where nothing tells it, by a plugin asked)
        const opened = openedAs(name, text, path, await kindOfFile(name, text));
        const asText = textsOf(opened);
        if (asText) texts.push(...asText);
        else openTab(opened);
      } catch (e) {
        setNotice(`${name} could not be read: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (texts.length) openTexts(texts, into);
  };
  // Closing with unsaved changes: the tabs that hold them, and whether
  // each can be saved (lib/doc/savers).
  const unsavedOf = (p: { kind: "tab"; id: string } | { kind: "window" }): string[] =>
    p.kind === "tab"
      ? [p.id]
      : Object.values(stateRef.current.tabsById)
          .filter((t) => t.meta.dirty && officeIdOf(t) == null)
          .map((t) => t.meta.id);
  const savable = (p: { kind: "tab"; id: string } | { kind: "window" }) => unsavedOf(p).every((id) => saverOf(id));
  // Each saved in turn - its tab brought forward, so that it is seen which
  // is being saved - and then closed; kept open if one is not saved.
  const saveThenClose = async (p: { kind: "tab"; id: string } | { kind: "window" }) => {
    setPendingClose(null);
    for (const id of unsavedOf(p)) {
      dispatch({ type: "SELECT_TAB", id });
      if (!(await saverOf(id)?.())) return;
    }
    if (p.kind === "tab") closeTab(p.id);
    else void getCurrentWindow().destroy();
  };
  const openFiles = async (files: File[]) => {
    const into = stateRef.current.activeId;
    const texts: OpenedText[] = [];
    for (const f of files) {
      const workspace = workspaceOfFile(new Uint8Array(await f.arrayBuffer()));
      const opened = workspace != null ? openedAs(f.name, workspace, undefined, MENO_KINDS.workspace) : openedAs(f.name, await f.text());
      const asText = textsOf(opened);
      if (asText) texts.push(...asText);
      else openTab(opened);
    }
    if (texts.length) openTexts(texts, into);
  };
  // (the key listened for once; what it does is this render's)
  const pickRef = useRef(pickFiles);
  pickRef.current = pickFiles;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!openIntent(e)) return;
      e.preventDefault();
      void pickRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Closing the window - its own button, Alt+F4 - asks first when a tab
  // holds unsaved changes (a structure from a document has none: its
  // document has them already). The listener reads the tabs through a
  // ref, so it is registered once and still sees the latest ones.
  const tabsRef = useRef(state.tabsById);
  tabsRef.current = state.tabsById;
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let gone = false;
    getCurrentWindow()
      .onCloseRequested((e) => {
        if (Object.values(tabsRef.current).some((t) => t.meta.dirty && officeIdOf(t) == null)) {
          e.preventDefault();
          setPendingClose({ kind: "window" });
        }
      })
      .then((u) => (gone ? u() : (unlisten = u)))
      // Outside Tauri - the browser dev server - there is no window to watch.
      .catch(() => {});
    return () => {
      gone = true;
      unlisten?.();
    };
  }, []);

  // Structures from Office documents (Windows, a double-click on one): each
  // opens in a tab of its own - or brings its tab forward if it is open -
  // and the tab closes when the document is done with it. (Listened for
  // once; what it does is this render's, as the tabs are now.)
  const office = useRef<{
    openTab: (o: Opened) => boolean;
    closeTab: (id: string) => void;
    leaveIfOnlyForOffice: (closing?: string) => void;
  } | null>(null);
  useEffect(() => {
    const openTab = (o: Opened) => office.current!.openTab(o);
    const closeTab = (id: string) => office.current!.closeTab(id);
    const leaveIfOnlyForOffice = (closing?: string) => office.current!.leaveIfOnlyForOffice(closing);
    const tabOf = (officeId: number) =>
      Object.values(stateRef.current.tabsById).find((t) => officeIdOf(t) === officeId);
    const open = async () => {
      for (const s of await takeOfficeStructures()) {
        const held = tabOf(s.id);
        if (held) {
          dispatch({ type: "SELECT_TAB", id: held.meta.id });
          continue;
        }
        const label = s.name ? `${s.name} - Office` : "Structure from Office";
        // (Meno's own record, read as what it is)
        const data = { payload: s.record, kind: MENO_KINDS.record.id, officeId: s.id };
        if (!openTab({ kind: "structure", label, data })) void letOfficeGo(s.id);
      }
    };
    void open(); // (any asked for before the page was up)
    const stop = watchOffice(
      () => void open(),
      (officeId) => {
        const held = tabOf(officeId);
        if (!held) return;
        closeTab(held.meta.id);
        leaveIfOnlyForOffice(held.meta.id);
      },
      () => leaveIfOnlyForOffice(),
    );
    // (Office also starts a Meno only to have an object's picture, and may
    // be done with it before the page is up: looked at once Office has had
    // time to ask for one)
    const idle = window.setTimeout(
      () =>
        void officeInUse().then((inUse) => {
          if (!inUse) leaveIfOnlyForOffice();
        }),
      OFFICE_GRACE_MS,
    );
    return () => {
      window.clearTimeout(idle);
      stop();
    };
  }, []);

  // A Meno Windows started for a document (a double-click on a structure
  // while Meno was not running, or Office wanting its picture) goes again
  // when the document is done with it, unless something else has been
  // opened in it meanwhile.
  const leaveIfOnlyForOffice = (closing?: string) => {
    void startedForOffice().then((forOffice) => {
      if (!forOffice) return;
      const left = Object.values(stateRef.current.tabsById).filter(
        (t) => t.meta.id !== closing && !isBlankTab(t),
      );
      if (!left.length) void getCurrentWindow().close();
    });
  };
  office.current = { openTab, closeTab, leaveIfOnlyForOffice };

  const ctl: TabsController = {
    tabOrder: state.tabOrder,
    tabsById: Object.fromEntries(
      Object.entries(state.tabsById).map(([k, v]) => [k, (v as any).meta])
    ),
    activeId: state.activeId,
    reorder: (order) => dispatch({ type: "REORDER", order }),
    select: (id) => dispatch({ type: "SELECT_TAB", id }),
    close: (id) => {
      // a structure from a document: its changes are in the document already
      const officeId = officeIdOf(state.tabsById[id]);
      if (officeId != null) {
        void letOfficeGo(officeId);
        closeTab(id);
        leaveIfOnlyForOffice(id);
      } else if (state.tabsById[id]?.meta.dirty) setPendingClose({ kind: "tab", id });
      else closeTab(id);
    },
    // "+": a canvas, the page everything else is opened from
    add: () => {
      if (!canOpenKind(state, "structure")) {
        setNotice(TOO_MANY_CANVASES);
        return;
      }
      dispatch({ type: "ADD_TAB", tab: viewRegistry.structure.create("Structure Canvas") });
    },
    openFiles: pickFiles,
    newText: () => {
      openTexts([{ name: "", text: "" }], state.activeId);
    },
    openByKind: async (kind: TabKind, opts?: { label?: string }) => {
      // There is one Settings tab: asking again brings it to the front.
      if (kind === "settings") {
        const open = state.tabOrder.find(
          (id) => state.tabsById[id]?.content.kind === "settings"
        );
        if (open) {
          dispatch({ type: "SELECT_TAB", id: open });
          return;
        }
      }
      if (!canOpenKind(state, kind)) {
        setNotice(TOO_MANY_CANVASES);
        return;
      }
      const entry: ViewEntry = viewRegistry[kind] ?? viewRegistry.structure;
      const label = opts?.label ?? "New Tab";
      const tab = entry.create(label);
      dispatch({ type: "ADD_TAB", tab });
    },
  };

  const resolveView = useCallback(
    (kind: string): ViewEntry | Promise<ViewEntry> => {
      if (kind in viewRegistry) return viewRegistry[kind];
      return viewRegistry.structure;
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

  return (
    <div className="h-screen w-screen flex flex-col relative">
      <TopBar ctl={ctl} />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept={OPENABLE.join(",")}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          // (the same file can be picked again)
          e.target.value = "";
          void openFiles(files);
        }}
      />
      <AnimatePresence>
      {pendingClose && (
        <ConfirmDiscard
          key="confirm-discard"
          title={
            pendingClose.kind === "tab"
              ? `Close "${state.tabsById[pendingClose.id]?.meta.label ?? "this tab"}"?`
              : "Close Meno?"
          }
          message={
            pendingClose.kind === "tab"
              ? "Its changes have not been saved. Closing it throws them away."
              : "Some tabs have changes that have not been saved. Closing the window throws them away."
          }
          discardLabel="Close without saving"
          onCancel={() => setPendingClose(null)}
          onDiscard={() => {
            const p = pendingClose;
            setPendingClose(null);
            if (p.kind === "tab") closeTab(p.id);
            // destroy, not close: close would only ask again.
            else void getCurrentWindow().destroy();
          }}
          onSave={savable(pendingClose) ? () => void saveThenClose(pendingClose) : undefined}
        />
      )}
      </AnimatePresence>
      <AnimatePresence>
      {notice && (
        <motion.div
          key="notice"
          {...RISE}
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
        </motion.div>
      )}
      </AnimatePresence>
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
      <NetworkToasts
        onOpen={() => {
          showSettingsSection("network");
          void ctl.openByKind?.("settings", { label: "Settings" });
        }}
      />
      <ConsentDialog />
      <UpdateNotice />
      <Deck
        order={state.mountOrder}
        tabs={state.tabsById}
        activeId={state.activeId}
        resolveView={resolveView}
        patchData={patchData}
        getDocument={getDocument}
        renameTab={(id, label) => dispatch({ type: "RENAME_TAB", id, label })}
      />
    </div>
  );
}
