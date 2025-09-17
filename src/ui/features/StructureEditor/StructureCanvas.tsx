import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { NOMINAL_BOND_LENGTH } from "../../../lib/chem/acs";
import { useEditor, useEditorStore, EditorProvider } from "./store";
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
} from "./components";
import AromaticCircles2D from "./components/AromaticCircles2D";
import Wedges2D from "./components/Wedges2D";
import Labels2D from "./components/Labels2D";
import LabelEditor2D from "./components/LabelEditor2D";
// ExportSvg2D UI removed from overlay; functionality remains available in component file
import { ArrowsPointingInIcon } from "@heroicons/react/24/outline";
import {
  detectFormat,
  readMoleculesFromText,
  moleculesToEditorModel,
  buildEditorModelFromRXN,
} from "../../../utils/importers";
import HoverOverlay2D from "./components/HoverOverlay2D";

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
  const { addAtom, addBond, connectAtoms, addArrow } = useEditor();
  const fitNonce = useEditor((s) => s.fitNonce);
  const requestFit = useEditor((s) => s.requestFit);
  const store = useEditorStore();

  // Rebuild model via addAtom/addBond for parity with hand-drawn
  const replayReplace = (mdl: { atoms: any[]; bonds: any[] }) => {
    const st = store.getState();
    // Pause auto-fit during batch add
    try {
      st.beginAutoFitSuspend();
    } catch {}
    // Clear current model first to mimic zero-base open (also resets nextId)
    st.replaceModel({ atoms: [], bonds: [] });
    const idMap = new Map<number, number>();
    // 1) atoms
    for (const a of mdl.atoms) {
      const nid = st.addAtom(a.x, a.y, a.el ?? "C", a.r ?? 0.9);
      idMap.set(a.id, nid);
    }
    // 2) bonds
    for (const b of mdl.bonds) {
      const a1 = idMap.get(b.a);
      const a2 = idMap.get(b.b);
      if (a1 == null || a2 == null) continue;
      const nbid = st.addBond(a1, a2, (b.order as any) ?? 1);
      // apply stereo/double props if provided
      try {
        if (b.stereo && b.stereo !== "none") st.setBondStereo(nbid, b.stereo);
      } catch {}
      try {
        const orient = (b as any).stereoOrient;
        if (orient) st.setBondStereoOrient(nbid, orient);
      } catch {}
      try {
        const dm = (b as any).doubleMode;
        if (dm) st.setBondDoubleMode(nbid, dm);
      } catch {}
    }
    // Trigger fit then resume auto-fit (previous behavior)
    try {
      st.requestFit();
    } catch {}
    try {
      st.endAutoFitSuspend();
    } catch {}
  };

  const replayAppend = (mdl: { atoms: any[]; bonds: any[] }) => {
    const st = store.getState();
    try {
      st.beginAutoFitSuspend();
    } catch {}
    const idMap = new Map<number, number>();
    for (const a of mdl.atoms) {
      const nid = st.addAtom(a.x, a.y, a.el ?? "C", a.r ?? 0.9);
      idMap.set(a.id, nid);
    }
    for (const b of mdl.bonds) {
      const a1 = idMap.get(b.a);
      const a2 = idMap.get(b.b);
      if (a1 == null || a2 == null) continue; // safety: skip if endpoints not in appended block
      const nbid = st.addBond(a1, a2, (b.order as any) ?? 1);
      try {
        if (b.stereo && b.stereo !== "none") st.setBondStereo(nbid, b.stereo);
      } catch {}
      try {
        const orient = (b as any).stereoOrient;
        if (orient) st.setBondStereoOrient(nbid, orient);
      } catch {}
      try {
        const dm = (b as any).doubleMode;
        if (dm) st.setBondDoubleMode(nbid, dm);
      } catch {}
    }
    try {
      st.requestFit();
    } catch {}
    try {
      st.endAutoFitSuspend();
    } catch {}
  };

  // If initial payload is provided, replace once on mount
  useEffect(() => {
    (async () => {
      if (!initialPayload) return;
      try {
        const fmt = detectFormat(initialFilename || "", initialPayload) || "";
        if (fmt === "rxn") {
          // RXN: build model and arrow via helper
          const built = buildEditorModelFromRXN(initialPayload);
          // Apply model first, then add arrow
          replayReplace(built.model as any);
          if (built.arrow) {
            const cx = (built.arrow.x1 + built.arrow.x2) / 2;
            const cy = (built.arrow.y1 + built.arrow.y2) / 2;
            const len = Math.hypot(
              built.arrow.x2 - built.arrow.x1,
              built.arrow.y2 - built.arrow.y1
            );
            try {
              addArrow(cx, cy, 0, len);
            } catch {}
          }
        } else {
          const mols = readMoleculesFromText(initialPayload, fmt);
          if (!mols.length) return;
          const { model, centroid } = moleculesToEditorModel(mols);
          const shifted = {
            atoms: model.atoms.map((a) => ({
              ...a,
              x: a.x - centroid.x,
              y: a.y - centroid.y,
            })),
            bonds: model.bonds,
          };
          replayReplace(shifted as any);
        }
      } catch (e) {
        console.warn("initial payload import failed", e);
      }
    })();
    // run once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const camRef = useRef<THREE.OrthographicCamera | null>(null);
  const domRef = useRef<HTMLCanvasElement | null>(null);
  const clickTimerRef = useRef<number | null>(null);

  const clientToWorld = (clientX: number, clientY: number) => {
    if (!camRef.current || !domRef.current)
      return null as { x: number; y: number } | null;
    const rect = domRef.current.getBoundingClientRect();
    const v = new THREE.Vector3(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
      0
    );
    v.unproject(camRef.current);
    return { x: v.x, y: v.y };
  };

  const handleDoubleClick = (e: any) => {
    // Stop propagation to outer graph
    try {
      (e as any).stopPropagation?.();
    } catch {}
    // Cancel single-click scheduling
    if (clickTimerRef.current != null) {
      try {
        window.clearTimeout(clickTimerRef.current);
      } catch {}
      clickTimerRef.current = null;
    }
    if (!camRef.current || !domRef.current) return;
    const stNow = store.getState();
    // Suppress immediately after interactive commit
    const nowMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    if (stNow.suppressDblClickUntil && nowMs < stNow.suppressDblClickUntil)
      return;
    // Ignore while actively extending
    if (stNow.extend.active) return;
    const rect = domRef.current.getBoundingClientRect();
    const ndc = new THREE.Vector3(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -(((e.clientY - rect.top) / rect.height) * 2 - 1),
      0
    );
    ndc.unproject(camRef.current);

    const st = store.getState();
    const atoms = st.model.atoms;
    const bonds = st.model.bonds;

    // Use fixed nominal bond length (world units)
    const id2 = new Map<number, { x: number; y: number }>();
    for (const a of atoms) id2.set(a.id, { x: a.x, y: a.y });
    const L = NOMINAL_BOND_LENGTH;

    // If an atom is hovered, extend a single bond from that atom.
    const hoveredAtomId = st.hovered.atomId;
    if (hoveredAtomId != null) {
      const base = atoms.find((a) => a.id === hoveredAtomId);
      if (base) {
        // Angle utilities
        const TAU = Math.PI * 2;
        const angNorm = (a: number) => ((a % TAU) + TAU) % TAU;
        const angDist = (a: number, b: number) => {
          const d = Math.abs(angNorm(a) - angNorm(b));
          return d > Math.PI ? TAU - d : d;
        };

        // Collect neighbor angles around base atom
        const nbrAngles: number[] = [];
        for (const b of bonds) {
          if (b.a === base.id || b.b === base.id) {
            const otherId = b.a === base.id ? b.b : b.a;
            const p = id2.get(otherId);
            if (!p) continue;
            const ang = Math.atan2(p.y - base.y, p.x - base.x);
            nbrAngles.push(ang);
          }
        }
        const clickDx = ndc.x - base.x;
        const clickDy = ndc.y - base.y;
        const clickLen = Math.hypot(clickDx, clickDy);
        const clickAng = Math.atan2(clickDy, clickDx);

        let placeAngle = 0; // default: to the right
        if (nbrAngles.length === 0) {
          // No neighbors: align to pointer direction if available
          placeAngle = clickLen > 1e-6 ? clickAng : 0;
        } else {
          // Try 120° scheme; otherwise fallback to largest gap center
          const MIN_SEP = (110 * Math.PI) / 180; // require >=110° separation from all neighbors
          const cand: number[] = [];
          for (const a of nbrAngles) {
            cand.push(angNorm(a + (2 * Math.PI) / 3));
            cand.push(angNorm(a - (2 * Math.PI) / 3));
          }
          // Evaluate candidates by min distance to neighbors
          type CandEval = { ang: number; minDist: number; clickBias: number };
          const evals: CandEval[] = cand.map((ang) => {
            const md = nbrAngles.reduce(
              (m, a) => Math.min(m, angDist(ang, a)),
              Infinity
            );
            const cb = clickLen > 1e-6 ? angDist(ang, clickAng) : Math.PI; // smaller is better
            return { ang, minDist: md, clickBias: cb };
          });
          const feasible = evals.filter((e) => e.minDist >= MIN_SEP);
          if (feasible.length > 0) {
            // Prefer closest to click direction; tie-break by max clearance
            feasible.sort(
              (p, q) => p.clickBias - q.clickBias || q.minDist - p.minDist
            );
            placeAngle = feasible[0].ang;
          } else {
            // Fallback: largest angular gap center
            const sorted = nbrAngles.map(angNorm).sort((a, b) => a - b);
            let bestGap = -1;
            let bestMid = 0;
            for (let i = 0; i < sorted.length; i++) {
              const a1 = sorted[i];
              const a2 = sorted[(i + 1) % sorted.length];
              const gap = (a2 - a1 + TAU) % TAU || TAU;
              const mid = a1 + gap / 2;
              if (gap > bestGap) {
                bestGap = gap;
                bestMid = mid;
              }
            }
            placeAngle = bestMid;
          }
        }

        // Nudge to avoid overlaps and exact neighbor directions
        const TAU_N = Math.PI * 2;
        const angNorm2 = (a: number) => ((a % TAU_N) + TAU_N) % TAU_N;
        const ANG_EPS = (8 * Math.PI) / 180; // 8° tolerance
        const POS_EPS = Math.max(1e-3, L * 0.02);
        const occupied = nbrAngles.map(angNorm2);
        function angleFree(a: number): boolean {
          const an = angNorm2(a);
          for (const o of occupied) {
            let d = Math.abs(an - o);
            if (d > Math.PI) d = TAU_N - d;
            if (d < ANG_EPS) return false;
          }
          return true;
        }
        function posFree(ax: number, ay: number): boolean {
          for (const pa of atoms) {
            const dxp = ax - pa.x;
            const dyp = ay - pa.y;
            if (Math.hypot(dxp, dyp) < POS_EPS) return false;
          }
          return true;
        }
        // Try original then 30° nudges
        const STEP = Math.PI / 6;
        let bestAng = placeAngle;
        let found = false;
        const tryOrder: number[] = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6];
        for (const k of tryOrder) {
          const a = placeAngle + k * STEP;
          if (!angleFree(a)) continue;
          const tx = base.x + L * Math.cos(a);
          const ty = base.y + L * Math.sin(a);
          if (!posFree(tx, ty)) continue;
          bestAng = a;
          found = true;
          break;
        }
        // Robust placement: angle nudges and slight radius tweaks
        const baseAng = found ? bestAng : placeAngle;
        const angleSteps: number[] = [];
        const STEP2 = Math.PI / 6; // 30°
        // primary around baseAng with 30° steps
        for (let k = 0; k <= 6; k++) angleSteps.push(k * STEP2, -k * STEP2);
        // interleaved 15° half-steps for extra options
        const HALF = STEP2 * 0.5;
        for (let k = 1; k <= 6; k++) angleSteps.push(k * HALF, -k * HALF);
        const radii = [1.0, 1.05, 0.95, 1.1, 0.9, 1.15, 0.85];
        let finalPos: { x: number; y: number } | null = null;
        outer: for (const da of angleSteps) {
          const a = baseAng + da;
          for (const rm of radii) {
            const tx = base.x + L * rm * Math.cos(a);
            const ty = base.y + L * rm * Math.sin(a);
            if (posFree(tx, ty)) {
              finalPos = { x: tx, y: ty };
              break outer;
            }
          }
        }
        const nx = finalPos ? finalPos.x : base.x + L * Math.cos(baseAng);
        const ny = finalPos ? finalPos.y : base.y + L * Math.sin(baseAng);
        // If near existing atom, connect instead of creating
        const near = store
          .getState()
          .findAtomNear(nx, ny, NOMINAL_BOND_LENGTH * 0.3, base.id);
        if (near != null) {
          connectAtoms(base.id, near, 1);
        } else {
          const nid = addAtom(nx, ny, "C", 0.9);
          addBond(base.id, nid, 1);
        }
        return;
      }
    }

    // Fallback: add a free single bond centered at click
    const nowMs2 =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    if (stNow.suppressDblClickUntil && nowMs2 < stNow.suppressDblClickUntil)
      return;
    const half = L * 0.5;
    const theta = Math.PI / 6; // +30°
    const dx = half * Math.cos(theta);
    const dy = half * Math.sin(theta);
    const ax = ndc.x - dx;
    const ay = ndc.y - dy;
    const bx = ndc.x + dx;
    const by = ndc.y + dy;
    const idA = addAtom(ax, ay, "C", 0.9);
    const idB = addAtom(bx, by, "C", 0.9);
    addBond(idA, idB, 1);
    // Suppress single-click reservation immediately after a double-click
    try {
      store.getState().suppressDoubleClick(320);
    } catch {}
  };

  // Wrapper: hover and click fallback
  const handleWrapperMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const st = store.getState();
    const p = clientToWorld(e.clientX, e.clientY);
    if (!p) return;
    const id = st.findAtomNear(p.x, p.y, NOMINAL_BOND_LENGTH * 0.3, null);
    if (id != null) st.setHoveredFromId(id);
    else st.clearAtomHover();
  };
  const handleWrapperMouseLeave = () => {
    try {
      store.getState().clearAtomHover();
    } catch {}
  };
  const handleWrapperClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Delay to avoid stealing the first of a double-click
    if (clickTimerRef.current != null) {
      try {
        window.clearTimeout(clickTimerRef.current);
      } catch {}
      clickTimerRef.current = null;
    }
    // Wait longer than browser dblclick threshold
    clickTimerRef.current = window.setTimeout(() => {
      const st = store.getState();
      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      if (st.extend.active || st.moveDrag.active) return;
      if (st.suppressDblClickUntil && now < st.suppressDblClickUntil) return;
      const p = clientToWorld(e.clientX, e.clientY);
      if (!p) return;
      const id = st.findAtomNear(p.x, p.y, NOMINAL_BOND_LENGTH * 0.25, null);
      if (id != null) st.beginLabelEdit(id);
    }, 420) as unknown as number;
  };

  // Drag & Drop import (append)
  const onDropAppend = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (!files || !files.length) return;
    const f = files[0];
    const text = await f.text();
    const fmt = detectFormat(f.name, text) || "";
    if (fmt === "rxn") {
      try {
        const built = buildEditorModelFromRXN(text);
        // compute drop point and shift
        const p = clientToWorld(e.clientX, e.clientY) || { x: 0, y: 0 };
        const dx = p.x - built.centroid.x;
        const dy = p.y - built.centroid.y;
        const shifted = {
          atoms: built.model.atoms.map((a) => ({
            ...a,
            x: a.x + dx,
            y: a.y + dy,
          })),
          bonds: built.model.bonds,
        };
        // Append model first, then arrow
        replayAppend(shifted as any);
        try {
          if (built.arrow) {
            const cx = (built.arrow.x1 + built.arrow.x2) / 2 + dx;
            const cy = (built.arrow.y1 + built.arrow.y2) / 2 + dy;
            const len = Math.hypot(
              built.arrow.x2 - built.arrow.x1,
              built.arrow.y2 - built.arrow.y1
            );
            addArrow(cx, cy, 0, len);
          }
        } catch {}
      } catch (err) {
        console.warn("append import failed", err);
      }
      return;
    }

    const mols = readMoleculesFromText(text, fmt);
    if (!mols.length) return;
    const { model, centroid } = moleculesToEditorModel(mols);
    // Place at drop point by shifting to world drop position
    const p = clientToWorld(e.clientX, e.clientY) || { x: 0, y: 0 };
    const dx = p.x - centroid.x;
    const dy = p.y - centroid.y;
    const shifted = {
      atoms: model.atoms.map((a) => ({ ...a, x: a.x + dx, y: a.y + dy })),
      bonds: model.bonds,
    };
    try {
      replayAppend(shifted as any);
    } catch (err) {
      console.warn("append import failed", err);
    }
  };

  // Open (replace) via hidden input
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const onPickFiles = async (files: FileList) => {
    if (!files.length) return;
    const f = files[0];
    const text = await f.text();
    const fmt = detectFormat(f.name, text) || "";
    if (fmt === "rxn") {
      try {
        const built = buildEditorModelFromRXN(text);
        // Replace model, then add arrow
        replayReplace(built.model as any);
        if (built.arrow) {
          const cx = (built.arrow.x1 + built.arrow.x2) / 2;
          const cy = (built.arrow.y1 + built.arrow.y2) / 2;
          const len = Math.hypot(
            built.arrow.x2 - built.arrow.x1,
            built.arrow.y2 - built.arrow.y1
          );
          try {
            addArrow(cx, cy, 0, len);
          } catch {}
        }
      } catch (err) {
        console.warn("replace import failed", err);
      }
      return;
    }

    const mols = readMoleculesFromText(text, fmt);
    if (!mols.length) return;
    const { model, centroid } = moleculesToEditorModel(mols);
    const shifted = {
      atoms: model.atoms.map((a) => ({
        ...a,
        x: a.x - centroid.x,
        y: a.y - centroid.y,
      })),
      bonds: model.bonds,
    };
    try {
      replayReplace(shifted as any);
    } catch (err) {
      console.warn("replace import failed", err);
    }
  };

  // No special global mount-time payload handling

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      const st = store.getState();
      if (st.labelEdit.active) return;
      // Ignore when an input field is focused
      const t = ev.target as Element | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          (t as HTMLElement).isContentEditable)
      ) {
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store]);

  // No global listeners for extension in simple mode

  return (
    <div
      className="w-full h-full relative"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropAppend}
      onMouseDownCapture={(e) => {
        // Commit and end label editing on outside click
        const st = store.getState();
        if (!st.labelEdit.active) return;
        const tgt = e.target as Element | null;
        const isInput =
          !!tgt && (tgt.tagName === "INPUT" || !!tgt.closest("input"));
        if (!isInput) {
          try {
            st.commitLabelEdit();
          } catch {}
          try {
            st.suppressDoubleClick(320);
          } catch {}
          if (clickTimerRef.current != null) {
            try {
              window.clearTimeout(clickTimerRef.current);
            } catch {}
            clickTimerRef.current = null;
          }
        }
      }}
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
        onCreated={(state) => {
          try {
            state.gl.setClearColor?.("#ffffff", 1);
            state.gl.clear?.();
          } catch {}
          const canvas = state.gl.domElement as HTMLCanvasElement;
          const onLost = (e: Event) => e.preventDefault();
          const onRestored = () => state.invalidate();
          canvas.addEventListener("webglcontextlost", onLost as any, false);
          canvas.addEventListener(
            "webglcontextrestored",
            onRestored as any,
            false
          );
          camRef.current = state.camera as THREE.OrthographicCamera;
          domRef.current = canvas;

          // Ensure the WebGL renderer uses the same pixelRatio and enable
          // antialiasing-related settings. This helps on displays reporting
          // devicePixelRatio=1 where aliasing can be more noticeable.
          try {
            const DPR =
              typeof window !== "undefined"
                ? Math.max(window.devicePixelRatio || 1, 1.5)
                : 1.5;
            // @ts-ignore - three internals
            state.gl.setPixelRatio?.(DPR);
            // For canvas 2D fallback or composited canvases, ensure smoothing is enabled
            try {
              const ctx = canvas.getContext("2d");
              if (ctx) {
                // @ts-ignore
                ctx.imageSmoothingEnabled = true;
                // Some browsers expose prefixed names
                // @ts-ignore
                ctx.webkitImageSmoothingEnabled = true;
                // @ts-ignore
                ctx.mozImageSmoothingEnabled = true;
              }
            } catch {}
          } catch {}
        }}
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
