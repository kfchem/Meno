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
import { isCleanUpKey, saveIntent } from "../../../lib/doc/shortcuts";
import { chemWorker, useChem } from "../../../lib/rdkit/worker";
import { useAppSettings } from "../../../lib/settings/appSettings";
import { cleanUp } from "./chem/cleanUp";
import { useChemMarks } from "./chem/useChemMarks";
import { useFileActions } from "./fileActions";
import { CANVAS_DPR } from "./constants";
import { DrawnLayoutProvider } from "./components/DrawnLayout";
import type { DocumentStore } from "../../../lib/doc";
import type { StructureDocument } from "./document";

function StructureCanvasContent({
  active,
  tabId,
  initialPayload,
  initialFilename,
  styleOpen,
  toggleStyle,
}: {
  active: boolean;
  tabId: string;
  initialPayload?: string;
  initialFilename?: string;
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
  } = useStructureEvents(initialPayload, initialFilename);

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
  // RDKit: its marks on the structure, R/S on request, and clean-up
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
    (aroundAtom: number | null) => {
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
  // With the pointer on a structure, the key cleans up just that one.
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isCleanUpKey(e)) return;
      e.preventDefault();
      const { hovered, model: m } = store.getState();
      const bond =
        hovered.bondId != null
          ? m.bonds.find((b) => b.id === hovered.bondId)
          : undefined;
      runCleanUp(hovered.atomId ?? bond?.a ?? null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, store, runCleanUp]);
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
      <Canvas
        key={tabId}
        orthographic
        camera={{ position: [0, 0, 10], zoom: 4 }}
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
  active = true,
  document,
}: {
  tabId: string;
  initialPayload?: string;
  initialFilename?: string;
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
