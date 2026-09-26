import { Canvas } from "@react-three/fiber";
import { useEditor, EditorProvider } from "./store";
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
} from "./components";
import {
  ArrowDownTrayIcon,
  ArrowsPointingInIcon,
  ExclamationTriangleIcon,
  FolderOpenIcon,
  PhotoIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useEffect } from "react";
import { saveIntent } from "../../../lib/doc/shortcuts";
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
}: {
  active: boolean;
  tabId: string;
  initialPayload?: string;
  initialFilename?: string;
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
  const alert = importError ?? files.error;
  const dismissAlert = importError ? dismissImportError : files.dismissError;

  return (
    <div
      className="w-full h-full relative"
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
      </div>
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
          <Labels2D />
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
  return (
    <EditorProvider tabId={tabId} document={document}>
      <StructureCanvasContent
        active={active}
        tabId={tabId}
        initialPayload={initialPayload}
        initialFilename={initialFilename}
      />
    </EditorProvider>
  );
}
