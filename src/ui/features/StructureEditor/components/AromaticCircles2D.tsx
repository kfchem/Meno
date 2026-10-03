import * as THREE from "three";
import * as React from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useState, useEffect } from "react";
import { useEditor } from "../store";
import {
  circlePoints,
  layoutMolecule,
  type LayoutOptions,
} from "../../../../lib/chem/layout2d";
import CapJoinLine from "./CapJoinLine";
import { editorLayoutOptions } from "../layoutOptions";
import { useDrawingStyle } from "../useDrawingStyle";
import { useDrawnLayout } from "./drawnLayoutContext";

export default function AromaticCircles2D() {
  const { camera, invalidate } = useThree();
  const style = useDrawingStyle();
  const { toggleAromatic, toggleRing, aromaticEnabled, aromaticRings } =
    useEditor();
  // the rings' circles come with the rest of the drawing
  const { atoms, bonds, opts, layout, zoom } = useDrawnLayout();
  const [now, setNow] = useState(0);
  useFrame(() => {
    // `now` only drives the hover ring's expand animation (~780 ms). Updating
    // it on every frame re-rendered this component continuously, which would
    // defeat on-demand rendering.
    if (hoverStart != null && performance.now() - hoverStart < 780) {
      setNow(performance.now());
      invalidate();
    }
  });

  // hover-preview ring after 500ms over ring center; enabled state is stored per-ring in store
  const [hoverCenter, setHoverCenter] = useState<{
    x: number;
    y: number;
    r: number;
  } | null>(null);
  const [hoverStart, setHoverStart] = useState<number | null>(null);

  // Separate preview layout to discover ring centers even when enabled=false
  const prevOpts: LayoutOptions = useMemo(
    () =>
      editorLayoutOptions(style, { aromaticCircle: true }),
    [style]
  );
  const previewLayout = useMemo(
    () => layoutMolecule(atoms, bonds, prevOpts, zoom),
    [atoms, bonds, prevOpts, zoom]
  );

  // Detect approximate ring centers to use as hover targets
  const previewCenters = useMemo(() => {
    const cs: Array<{ x: number; y: number; r: number; key?: string }> = [];
    const circles = (previewLayout as any)?.circles as
      | Array<
          { c: { x: number; y: number }; r: number; key?: string } | undefined
        >
      | undefined;
    if (circles && circles.length > 0) {
      for (const c of circles)
        if (c) cs.push({ x: c.c.x, y: c.c.y, r: c.r, key: (c as any).key });
    }
    return cs;
  }, [previewLayout]);

  const { gl } = useThree();

  // keep latest hover state in refs to avoid stale closures in DOM handlers
  const hoverCenterRef = useRef<typeof hoverCenter>(null);
  const hoverStartRef = useRef<number | null>(null);
  const pendingToggleRef = useRef(false);
  useEffect(() => {
    hoverCenterRef.current = hoverCenter;
  }, [hoverCenter]);
  useEffect(() => {
    hoverStartRef.current = hoverStart;
  }, [hoverStart]);

  // DOM event listeners on the canvas element; no raycast needed
  React.useEffect(() => {
    const el = gl.domElement as HTMLElement;
    if (!el) return;
    // a ring's circle within 40 px of the pointer, the nearest
    const circleAt = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const cw = el.clientWidth || 1;
      const ch = el.clientHeight || 1;
      let found: { x: number; y: number; r: number; key?: string } | null = null;
      let minD = Infinity;
      for (const c of previewCenters) {
        const v = new THREE.Vector3(c.x, c.y, 0).project(camera as THREE.Camera);
        const d = Math.hypot(cx - ((v.x + 1) / 2) * cw, cy - ((-v.y + 1) / 2) * ch);
        if (d < 40 && d < minD) {
          found = { x: c.x, y: c.y, r: c.r, key: c.key };
          minD = d;
        }
      }
      return found;
    };
    const dwelt = () => {
      const hs = hoverStartRef.current;
      return hs != null && performance.now() - hs >= 500;
    };
    const onMove = (e: PointerEvent) => {
      const found = circleAt(e);
      if (found) {
        // (the hover as it is now, not as it was when these were set up:
        // a move over the same circle does not start its wait again)
        const was = hoverCenterRef.current;
        const changed = !was || Math.hypot(was.x - found.x, was.y - found.y) > 1e-6;
        if (changed) setHoverStart(performance.now());
        setHoverCenter(found);
      } else {
        setHoverCenter(null);
        setHoverStart(null);
      }
    };
    const onClick = (e: MouseEvent) => {
      // recompute hit at click time
      const found = circleAt(e);
      if ((pendingToggleRef.current && found) || (found && dwelt())) {
        if (found?.key) toggleRing(found.key);
        else toggleAromatic();
        pendingToggleRef.current = false;
        e.stopPropagation();
        e.preventDefault();
      }
    };
    const onPointerDownCapture = (e: PointerEvent) => {
      if (circleAt(e) && dwelt()) {
        pendingToggleRef.current = true; // mark for click to handle once
        e.stopPropagation();
        e.preventDefault();
      }
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("click", onClick);
    // capture to precede React handlers that might consume click for other tools
    el.addEventListener("pointerdown", onPointerDownCapture, {
      capture: true,
    } as any);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("click", onClick);
      el.removeEventListener("pointerdown", onPointerDownCapture, {
        capture: true,
      } as any);
    };
  }, [gl, previewCenters, camera, toggleRing, toggleAromatic]);

  return (
    <group>
      {(layout as any).circles?.map((c: any, i: number) => {
        // (an ellipse, for a ring seen in perspective)
        const pts: [number, number, number][] = circlePoints(c).map((p) => [p.x, p.y, 0]);
        const lw =
          opts.units === "world"
            ? opts.lineWidthPx * Math.max(zoom, 1e-6)
            : opts.lineWidthPx;
        return (
          <CapJoinLine
            key={`circ-${i}`}
            points={pts}
            color={opts.bondColor ?? "black"}
            lineWidth={lw}
            cap="butt"
            join="miter"
            miterLimit={2}
            depthTest={false}
            depthWrite={false}
            renderOrder={25}
          />
        );
      })}
      {/* hover preview ring (gray) with radial expand animation */}
      {hoverCenter &&
        hoverStart != null &&
        (() => {
          const dt = now - hoverStart; // ms since hover
          const ready = dt >= 500;
          if (!ready) return null;
          const t = Math.min(1, (dt - 500) / 220);
          const ease = 1 - Math.pow(1 - t, 3);
          const targetR = hoverCenter.r * 0.5; // match layout default scaling
          const thicknessWorld = Math.max(
            prevOpts.lineWidthPx / Math.max(zoom, 1e-6),
            targetR * 0.06
          );
          const minOuter = Math.max(thicknessWorld * 1.2, targetR * 0.12);
          const outer = Math.max(minOuter, targetR * ease);
          const inner = Math.max(0, outer - thicknessWorld);
          // Hide preview if the ring is already enabled
          const alreadyOn = (hoverCenter as any).key
            ? !!aromaticRings[(hoverCenter as any).key]
            : aromaticEnabled;
          if (alreadyOn) return null;
          return (
            <mesh position={[hoverCenter.x, hoverCenter.y, 0]} renderOrder={24}>
              <ringGeometry args={[inner, outer, 64]} />
              <meshBasicMaterial
                color="#999"
                transparent
                opacity={0.85}
                depthTest={false}
                depthWrite={false}
              />
            </mesh>
          );
        })()}
    </group>
  );
}
