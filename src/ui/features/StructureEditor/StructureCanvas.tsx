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
// ExportSvg2D UI removed from overlay; functionality remains available in component file
import { ArrowsPointingInIcon } from "@heroicons/react/24/outline";

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
    handleMouseDownCapture,
  } = useStructureEvents(initialPayload, initialFilename);

  const onCreated = useCanvasSetup(camRef, domRef);

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
        onChange={(e) => e.target.files && onPickFiles(e.target.files)}
      />
      {/* Fit button */}
      <div className="absolute left-3 bottom-3 z-50">
        <button
          aria-label="Fit to content"
          title="Fit to content"
          onClick={() => requestFit()}
          className="h-9 w-9 rounded-full border border-gh-line bg-white/90 hover:bg-gray-100 shadow-sm flex items-center justify-center"
        >
          <ArrowsPointingInIcon className="h-5 w-5 text-gh-black" />
        </button>
      </div>
      <Canvas
        key={tabId}
        orthographic
        camera={{ position: [0, 0, 10], zoom: 4 }}
        frameloop={active ? "always" : "never"}
        // Force a minimum DPR to improve antialiasing on 100% (1x) displays
        // Keep upper bound to allow high-DPI devices to use native scaling
        dpr={
          typeof window !== "undefined"
            ? Math.max(window.devicePixelRatio || 1, 2)
            : 2
        }
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
        <PanZoom2D />
      </Canvas>
    </div>
  );
}

export default function StructureCanvas({
  tabId,
  initialPayload,
  initialFilename,
}: {
  tabId: string;
  initialPayload?: string;
  initialFilename?: string;
}) {
  return (
    <EditorProvider tabId={tabId}>
      <StructureCanvasContent
        active={true}
        tabId={tabId}
        initialPayload={initialPayload}
        initialFilename={initialFilename}
      />
    </EditorProvider>
  );
}
