import { Canvas } from "@react-three/fiber";
import { useEditor, useEditorStore, EditorProvider } from "./store";
import { useStructureEvents } from "./hooks/useStructureEvents";
import { useCanvasSetup } from "./hooks/useCanvasSetup";
import {
  Atoms2D,
  Bonds2D,
  PanZoom2D,
  FitToContent2D,
  JoinCaps2D,
  BondsPick2D,
  AtomsHoverRings2D,
  ExtendPreview2D,
  MovePreview2D,
  Arrows2D,
  AromaticCircles2D,
  Wedges2D,
  Labels2D,
  LabelEditor2D,
  HoverOverlay2D,
  ChemMarks2D,
  SnapArc2D,
  Selection2D,
} from "./components";
import {
  ArrowDownTrayIcon,
  ArrowsPointingInIcon,
  ExclamationTriangleIcon,
  FolderOpenIcon,
  PhotoIcon,
  SparklesIcon,
  SwatchIcon,
  CodeBracketIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import DocumentStylePanel from "./DocumentStylePanel";
import SmilesPanel from "./SmilesPanel";
import PartMenu, { type MenuTarget } from "./PartMenu";
import { useClipboardActions } from "./clipboardActions";
import {
  chargeStep,
  clipboardIntent,
  isCleanUpKey,
  isDeleteKey,
  isDeselectKey,
  isSelectAllKey,
  saveIntent,
} from "../../../lib/doc/shortcuts";
import { chemWorker, useChem } from "../../../lib/rdkit/worker";
import { useAppSettings } from "../../../lib/settings/appSettings";
import { cleanUp } from "./chem/cleanUp";
import { useChemMarks } from "./chem/useChemMarks";
import { useFileActions } from "./fileActions";
import { CANVAS_DPR } from "./constants";
import { startingZoom } from "./layoutOptions";
import { useDrawingStyle } from "./useDrawingStyle";
import { DrawnLayoutProvider } from "./components/DrawnLayout";
import { useOfficeLink } from "./hooks/useOfficeLink";
import type { DocumentStore } from "../../../lib/doc";
import type { StructureDocument } from "./document";

function StructureCanvasContent({
  active,
  tabId,
  initialPayload,
  initialFilename,
  officeId,
  styleOpen,
  toggleStyle,
}: {
  active: boolean;
  tabId: string;
  initialPayload?: string;
  initialFilename?: string;
  /** The object in a document this canvas was opened from (lib/ole). */
  officeId?: number;
  /** Whether the drawing-style panel is open beside the canvas. */
  styleOpen: boolean;
  toggleStyle: () => void;
}) {
  const fitNonce = useEditor((s) => s.fitNonce);
  const requestFit = useEditor((s) => s.requestFit);

  const {
    camRef,
    domRef,
    fileInputRef,
    handleDoubleClick,
    handleWrapperMouseMove,
    handleWrapperMouseLeave,
    handleWrapperClick,
    onDropAppend,
    onPickFiles,
    openFilePicker,
    importError,
    dismissImportError,
    handleMouseDownCapture,
    clientToWorld,
    pasteTarget,
  } = useStructureEvents(initialPayload, initialFilename);
  useOfficeLink(officeId);

  const onCreated = useCanvasSetup(camRef, domRef);

  // Save and export. Ctrl/Cmd+S belongs to the tab in front, like undo.
  const files = useFileActions();
  const { save, saveAs } = files;
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const intent = saveIntent(e);
      if (!intent) return;
      e.preventDefault();
      void (intent === "save" ? save() : saveAs());
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, save, saveAs]);
  // RDKit: its marks on the structure and R/S on request; and clean-up, by
  // Meno's own layout engine (chem/cleanUp)
  const store = useEditorStore();
  const model = useEditor((s) => s.model);
  const marks = useChemMarks(model, active);
  const chemistry = useAppSettings((s) => s.chemistry);
  const setChemistry = useAppSettings((s) => s.setChemistry);
  const chem = useChem();
  const [chemError, setChemError] = useState<string | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const cleaningNow = useRef(false); // one clean-up at a time, keys included
  const runCleanUp = useCallback(
    (aroundAtom: number | Iterable<number> | null) => {
      if (cleaningNow.current) return;
      cleaningNow.current = true;
      setCleaning(true);
      setChemError(null);
      cleanUp(store, aroundAtom)
        .catch((e: unknown) =>
          setChemError(
            `Clean-up failed: ${e instanceof Error ? e.message : String(e)}`,
          ),
        )
        .finally(() => {
          cleaningNow.current = false;
          setCleaning(false);
        });
    },
    [store],
  );
  // What is under the pointer is what a key acts on: Delete deletes it, and
  // the clean-up key cleans up the structure it is in (everything, when the
  // pointer is on nothing) - unless something is selected: then the keys
  // act on the selection, and the structures it is in.
  const hoveredPart = useCallback((): MenuTarget["kind"] | null => {
    const { hovered } = store.getState();
    return hovered.atomId != null
      ? "atom"
      : hovered.bondId != null
        ? "bond"
        : null;
  }, [store]);
  const structureAt = useCallback(
    (kind: MenuTarget["kind"] | null, id: number | null) => {
      if (kind === "atom") return id;
      const { model: m } = store.getState();
      return m.bonds.find((b) => b.id === id)?.a ?? null;
    },
    [store],
  );
  const deletePart = useCallback(
    (kind: MenuTarget["kind"], id: number) => {
      const st = store.getState();
      if (st.labelEdit.active || st.moveDrag.active || st.extend.active) return;
      if (kind === "atom") st.deleteAtom(id);
      else st.deleteBond(id);
    },
    [store],
  );
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  // Copy, cut and paste, by the keys and from the menu
  const clip = useClipboardActions(store, setChemError);
  const chargeAtom = useCallback(
    (id: number, step: 1 | -1) => {
      const st = store.getState();
      if (st.labelEdit.active || st.moveDrag.active || st.extend.active) return;
      st.stepCharge(id, step);
    },
    [store],
  );
  const radicalAtom = useCallback(
    (id: number) => {
      const st = store.getState();
      if (st.labelEdit.active || st.moveDrag.active || st.extend.active) return;
      st.toggleRadical(id);
    },
    [store],
  );
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const st = store.getState();
      const { hovered, sel } = st;
      const kind = hoveredPart();
      const id = kind === "atom" ? hovered.atomId : hovered.bondId;
      const selected = sel.atoms.size > 0 || sel.bonds.size > 0;
      const busy = st.labelEdit.active || st.moveDrag.active || st.extend.active;
      if (isCleanUpKey(e)) {
        e.preventDefault();
        runCleanUp(selected ? sel.atoms : structureAt(kind, id));
      } else if (isDeleteKey(e) && selected) {
        e.preventDefault();
        if (!busy) st.deleteSelection();
      } else if (isDeleteKey(e) && kind && id != null) {
        e.preventDefault();
        deletePart(kind, id);
      } else if (chargeStep(e) && kind === "atom" && id != null) {
        e.preventDefault();
        chargeAtom(id, chargeStep(e) as 1 | -1);
      } else if (clipboardIntent(e)) {
        e.preventDefault();
        const what = clipboardIntent(e);
        if (what === "copy") void clip.copy();
        else if (what === "cut") void clip.cut();
        else void clip.paste(pasteTarget());
      } else if (isSelectAllKey(e) && !busy) {
        e.preventDefault();
        st.selectAll();
      } else if (isDeselectKey(e) && selected && !busy && !menu) {
        // (Esc with the menu open closes the menu only)
        st.clearSel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, store, runCleanUp, hoveredPart, structureAt, deletePart, chargeAtom, menu, clip, pasteTarget]);
  // The same, from the mouse alone: a menu at the pointer on a right-click.
  const closeMenu = useCallback(() => setMenu(null), []);
  useEffect(() => setMenu(null), [model]); // what it was about may be gone
  // A right-drag moves the view, so the menu waits for the button to come
  // up without having travelled. macOS asks for the menu as the button goes
  // down, Windows as it comes up: either way it opens only then.
  const rightPress = useRef<{
    x: number;
    y: number;
    down: boolean;
    moved: boolean;
    pending: MenuTarget | null;
  } | null>(null);
  const onRightDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 2) {
      rightPress.current = null; // a Ctrl-click on a Mac starts afresh
      return;
    }
    rightPress.current = {
      x: e.clientX,
      y: e.clientY,
      down: true,
      moved: false,
      pending: null,
    };
  };
  const onRightMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = rightPress.current;
    if (!r?.down || r.moved) return;
    if (Math.hypot(e.clientX - r.x, e.clientY - r.y) > 4) r.moved = true;
  };
  const onRightUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = rightPress.current;
    if (e.button !== 2 || !r) return;
    r.down = false;
    if (r.pending && !r.moved) setMenu(r.pending);
    r.pending = null;
  };
  const openMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    // A card's text field keeps the system's own menu - cut, copy, paste.
    if (e.target !== domRef.current) return;
    e.preventDefault(); // no browser menu over the drawing
    const { hovered } = store.getState();
    const kind = hoveredPart();
    const id = kind === "atom" ? hovered.atomId : hovered.bondId;
    // on something selected, or on nothing with a selection: the
    // selection's menu; on nothing else, the canvas's (paste, select all)
    const { sel } = store.getState();
    const part = kind && id != null;
    const selected = sel.atoms.size > 0 || sel.bonds.size > 0;
    const onSelected =
      part &&
      (kind === "atom" ? sel.atoms.has(id) : sel.bonds.has(id));
    const box = e.currentTarget.getBoundingClientRect();
    const target: MenuTarget = {
      kind: part ? kind : null,
      id: part ? id : null,
      selection: !selected ? "none" : onSelected || !part ? "here" : "elsewhere",
      at: clientToWorld(e.clientX, e.clientY) ?? pasteTarget(),
      x: e.clientX - box.left,
      y: e.clientY - box.top,
      within: { width: box.width, height: box.height },
    };
    const r = rightPress.current;
    if (r?.down) r.pending = target; // macOS: open on the way up
    else if (!r?.moved) setMenu(target); // Windows, or a Ctrl-click on a Mac
  };
  const toggleStereoLabels = () => {
    const stereoLabels = !chemistry.stereoLabels;
    setChemistry({ ...chemistry, stereoLabels });
    if (!stereoLabels) return;
    // asked for: RDKit set up now, if it has not been
    setChemError(null);
    chemWorker().catch((e: unknown) => {
      setChemistry({ ...useAppSettings.getState().chemistry, stereoLabels: false });
      setChemError(
        `R and S cannot be shown: ${e instanceof Error ? e.message : String(e)}`,
      );
    });
  };

  const alert = importError ?? files.error ?? chemError;
  const dismissAlert = importError
    ? dismissImportError
    : files.error
      ? files.dismissError
      : () => setChemError(null);
  const ownStyle = useEditor((s) => s.docStyle != null);
  // Where the view starts, before there is anything to fit
  const style = useDrawingStyle();
  const [startZoom] = useState(() => startingZoom(style));
  // SMILES in and out, by RDKit, in a card over the canvas's corner
  const [smilesOpen, setSmilesOpen] = useState(false);

  return (
    <div
      className="flex-1 min-w-0 h-full relative"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropAppend}
      onMouseDownCapture={handleMouseDownCapture}
      onMouseMove={handleWrapperMouseMove}
      onMouseLeave={handleWrapperMouseLeave}
      onClick={handleWrapperClick}
      onContextMenu={openMenu}
      onPointerDownCapture={onRightDown}
      onPointerMoveCapture={onRightMove}
      onPointerUpCapture={onRightUp}
    >
      {/* Hidden file input for Open (replace) */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept={[".mol", ".sdf", ".rxn", ".xyz"].join(",")}
        onChange={(e) => {
          if (e.target.files) onPickFiles(e.target.files);
          // Allow picking the same file again.
          e.target.value = "";
        }}
      />
      {/* Import error */}
      {alert && (
        <div
          role="alert"
          className="absolute top-3 left-1/2 -translate-x-1/2 z-50 max-w-[90%] flex items-start gap-2 rounded-md border border-gh-line bg-white/95 shadow-sm px-3 py-2 text-xs text-gh-black"
        >
          <ExclamationTriangleIcon className="h-4 w-4 shrink-0 text-accel-accent" />
          <span className="break-words">{alert}</span>
          <button
            aria-label="Dismiss"
            title="Dismiss"
            onClick={(e) => {
              e.stopPropagation();
              dismissAlert();
            }}
            className="h-4 w-4 shrink-0 rounded-full hover:bg-gh-line"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      )}
      {/* Fit / Open buttons */}
      <div className="absolute left-3 bottom-3 z-50 flex gap-2">
        <button
          aria-label="Fit to content"
          title="Fit to content"
          onClick={() => requestFit()}
          className="h-9 w-9 rounded-full border border-gh-line bg-white/90 hover:bg-gray-100 shadow-sm flex items-center justify-center"
        >
          <ArrowsPointingInIcon className="h-5 w-5 text-gh-black" />
        </button>
        <button
          aria-label="Open structure file"
          title="Open structure file (replaces the canvas)"
          onClick={(e) => {
            e.stopPropagation();
            openFilePicker();
          }}
          className="h-9 w-9 rounded-full border border-gh-line bg-white/90 hover:bg-gray-100 shadow-sm flex items-center justify-center"
        >
          <FolderOpenIcon className="h-5 w-5 text-gh-black" />
        </button>
        <button
          aria-label="Save structure"
          title="Save (Ctrl/Cmd+S; with Shift, Save As)"
          onClick={(e) => {
            e.stopPropagation();
            void (e.shiftKey ? saveAs() : save());
          }}
          className="h-9 w-9 rounded-full border border-gh-line bg-white/90 hover:bg-gray-100 shadow-sm flex items-center justify-center"
        >
          <ArrowDownTrayIcon className="h-5 w-5 text-gh-black" />
        </button>
        <button
          aria-label="Export as SVG"
          title="Export the drawing as an SVG picture"
          onClick={(e) => {
            e.stopPropagation();
            void files.exportSvg();
          }}
          className="h-9 w-9 rounded-full border border-gh-line bg-white/90 hover:bg-gray-100 shadow-sm flex items-center justify-center"
        >
          <PhotoIcon className="h-5 w-5 text-gh-black" />
        </button>
        <button
          aria-label="Drawing style"
          aria-pressed={styleOpen}
          title={
            ownStyle
              ? "Drawing style (this document has its own)"
              : "Drawing style"
          }
          onClick={(e) => {
            e.stopPropagation();
            toggleStyle();
          }}
          className={
            "relative h-9 w-9 rounded-full border shadow-sm flex items-center justify-center " +
            (styleOpen
              ? "border-accel-base bg-accel-lightbase"
              : "border-gh-line bg-white/90 hover:bg-gray-100")
          }
        >
          <SwatchIcon className="h-5 w-5 text-gh-black" />
          {ownStyle && (
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-accel-base" />
          )}
        </button>
        <button
          aria-label="SMILES"
          aria-pressed={smilesOpen}
          title="SMILES in and out"
          onClick={(e) => {
            e.stopPropagation();
            setSmilesOpen((v) => !v);
          }}
          className={
            "h-9 w-9 rounded-full border shadow-sm flex items-center justify-center " +
            (smilesOpen
              ? "border-accel-base bg-accel-lightbase"
              : "border-gh-line bg-white/90 hover:bg-gray-100")
          }
        >
          <CodeBracketIcon className="h-5 w-5 text-gh-black" />
        </button>
        <button
          aria-label="Clean up"
          title="Clean up: even bonds and angles, over where it is drawn (Ctrl/Cmd+Shift+K; with the pointer on a structure, just that one)"
          disabled={cleaning || model.bonds.length === 0}
          onClick={(e) => {
            e.stopPropagation();
            runCleanUp(null);
          }}
          className="h-9 w-9 rounded-full border border-gh-line bg-white/90 hover:bg-gray-100 shadow-sm flex items-center justify-center disabled:opacity-40 disabled:hover:bg-white/90"
        >
          <SparklesIcon className="h-5 w-5 text-gh-black" />
        </button>
        <button
          aria-label="Show R and S"
          aria-pressed={chemistry.stereoLabels}
          title="R and S at stereocentres, E and Z at double bonds"
          onClick={(e) => {
            e.stopPropagation();
            toggleStereoLabels();
          }}
          className={
            "h-9 w-9 rounded-full border shadow-sm flex items-center justify-center text-[11px] font-semibold text-gh-black " +
            (chemistry.stereoLabels
              ? "border-accel-base bg-accel-lightbase"
              : "border-gh-line bg-white/90 hover:bg-gray-100")
          }
        >
          <span>
            <i>R</i>/<i>S</i>
          </span>
        </button>
      </div>
      {active &&
        (chem.state === "setting-up" || chem.state === "starting") && (
          <div
            role="status"
            className="absolute right-3 bottom-3 z-50 rounded-full border border-gh-line bg-white/95 shadow-sm px-3 py-1.5 text-xs text-gh-gray"
          >
            {chem.state === "setting-up"
              ? "Setting up RDKit…"
              : "Starting RDKit…"}
          </div>
        )}
      {smilesOpen && <SmilesPanel onClose={() => setSmilesOpen(false)} />}
      {menu && (
        <PartMenu
          target={menu}
          onClose={closeMenu}
          onDelete={() => {
            if (menu.selection === "here") store.getState().deleteSelection();
            else if (menu.kind && menu.id != null) deletePart(menu.kind, menu.id);
          }}
          onCleanUp={() =>
            runCleanUp(
              menu.selection === "here"
                ? store.getState().sel.atoms
                : structureAt(menu.kind, menu.id),
            )
          }
          onSelectStructure={() => {
            const at = structureAt(menu.kind, menu.id);
            if (at != null) store.getState().selectStructure(at);
          }}
          onTurnOver={(axis) => store.getState().turnSelectionOver(axis)}
          onCharge={(step) => {
            if (menu.kind === "atom" && menu.id != null) chargeAtom(menu.id, step);
          }}
          onRadical={() => {
            if (menu.kind === "atom" && menu.id != null) radicalAtom(menu.id);
          }}
          radical={!!model.atoms.find((a) => a.id === menu.id)?.radical}
          clipboard={{
            onCut: () => void clip.cut(),
            onCopy: () => void clip.copy(),
            onCopySmiles: () => void clip.copySmiles(),
            onPaste: () => void clip.paste(menu.at),
            onSelectAll: () => store.getState().selectAll(),
          }}
        />
      )}
      <Canvas
        key={tabId}
        orthographic
        camera={{ position: [0, 0, 10], zoom: startZoom }}
        // Render on demand: interactions, store changes and the animation
        // layers request frames (see PanZoom2D and the preview components)
        // instead of redrawing continuously while nothing changes.
        frameloop={active ? "demand" : "never"}
        dpr={CANVAS_DPR}
        onDoubleClick={handleDoubleClick}
        gl={{
          antialias: true,
          alpha: false,
          depth: true,
          stencil: false,
          powerPreference: "high-performance",
        }}
        onCreated={onCreated}
      >
        <ambientLight intensity={0.8} />
        <color attach="background" args={["#ffffff"]} />
        <FitToContent2D trigger={fitNonce} />
        {/* The drawing, laid out once for every layer below to draw from */}
        <DrawnLayoutProvider>
          {/* Bonds */}
          <Bonds2D />
          <Atoms2D />
          {/* Bond picking */}
          <BondsPick2D />
          {/* Join caps */}
          <JoinCaps2D />
          {/* Shapes and labels */}
          <AromaticCircles2D />
          <Wedges2D />
          {/* Atom hover rings */}
          <AtomsHoverRings2D />
          {/* what is selected, the box or lasso selecting, the handle turning it */}
          <Selection2D />
          {/* A label's font is read before it is drawn: the rest of the
              drawing does not wait for it, nor go if it cannot be read. */}
          <Suspense fallback={null}>
            <Labels2D />
          </Suspense>
          {/* RDKit's marks: valence problems, R/S and E/Z */}
          <ChemMarks2D marks={marks} />
          {/* Label editor */}
          <LabelEditor2D />
          {/* Hover overlay */}
          <ExtendPreview2D />
          {/* The 120-degree arc while a bond snaps to it */}
          <SnapArc2D />
          {/* Move preview */}
          <MovePreview2D />
          <HoverOverlay2D />
          {/* Free arrows (no semantics) */}
          <Arrows2D />
        </DrawnLayoutProvider>
        <PanZoom2D />
      </Canvas>
    </div>
  );
}

export default function StructureCanvas({
  tabId,
  initialPayload,
  initialFilename,
  officeId,
  active = true,
  document,
}: {
  tabId: string;
  initialPayload?: string;
  initialFilename?: string;
  /** The object in a document it was opened from, when it was (lib/ole). */
  officeId?: number;
  /** False while the owning tab is hidden: pauses the render loop. */
  active?: boolean;
  /** The tab's document; omitted for canvases embedded in other views. */
  document?: DocumentStore<StructureDocument>;
}) {
  // The document's drawing style opens in a panel beside the canvas rather
  // than over it, so the drawing stays in view while it changes.
  const [styleOpen, setStyleOpen] = useState(false);
  return (
    <EditorProvider tabId={tabId} document={document}>
      <div className="w-full h-full flex">
        <StructureCanvasContent
          active={active}
          tabId={tabId}
          initialPayload={initialPayload}
          initialFilename={initialFilename}
          officeId={officeId}
          styleOpen={styleOpen}
          toggleStyle={() => setStyleOpen((v) => !v)}
        />
        {styleOpen && (
          <DocumentStylePanel onClose={() => setStyleOpen(false)} />
        )}
      </div>
    </EditorProvider>
  );
}
