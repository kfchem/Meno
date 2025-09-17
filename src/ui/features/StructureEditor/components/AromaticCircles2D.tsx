import * as THREE from "three";
import * as React from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useState, useEffect } from "react";
import { useEditor } from "../store";
import {
  layoutMolecule,
  type LayoutOptions,
  type Atom as LAtom,
  type Bond as LBond,
} from "../../../../lib/chem/layout2d";
import { acsWorldOptions } from "../../../../lib/chem/acs";
import CapJoinLine from "./CapJoinLine";

export default function AromaticCircles2D({
  options,
}: {
  options?: Partial<LayoutOptions>;
}) {
  const { camera } = useThree();
  const { model, aromaticEnabled, aromaticRings, toggleAromatic, toggleRing } =
    useEditor();
  const [zoom, setZoom] = useState((camera as THREE.OrthographicCamera).zoom);
  const [now, setNow] = useState(0);
  useFrame(() => {
    const z = (camera as THREE.OrthographicCamera).zoom;
    if (z !== zoom) setZoom(z);
    setNow(performance.now());
  });

  const atoms: LAtom[] = useMemo(
    () => model.atoms.map((a) => ({ id: a.id, x: a.x, y: a.y, el: a.el })),
    [model.atoms]
  );
  const bonds: LBond[] = useMemo(() => {
    const idToIndex = new Map<number, number>();
    atoms.forEach((a, i) => idToIndex.set(a.id, i));
    const out: LBond[] = [];
    for (const b of model.bonds) {
      const i1 = idToIndex.get(b.a as number);
      const i2 = idToIndex.get(b.b as number);
      if (i1 == null || i2 == null) continue;
      const stereo = (b as any).stereo ?? ("none" as const);
      const order: 1 | 2 | 3 = b.order as 1 | 2 | 3;
      out.push({ a1: i1, a2: i2, order, stereo });
    }
    return out;
  }, [model.bonds, atoms]);

  // hover-preview ring after 500ms over ring center; enabled state is stored per-ring in store
  const [hoverCenter, setHoverCenter] = useState<{
    x: number;
    y: number;
    r: number;
  } | null>(null);
  const [hoverStart, setHoverStart] = useState<number | null>(null);

  const opts: LayoutOptions = useMemo(() => {
    const keys = Object.keys(aromaticRings || {}).filter(
      (k) => aromaticRings[k]
    );
    const enabled =
      keys.length > 0
        ? { enabled: new Set(keys) }
        : aromaticEnabled
        ? true
        : false;
    return acsWorldOptions(atoms, bonds, {
      ...options,
      units: "world",
      aromaticCircle: enabled,
    });
  }, [atoms, bonds, options, aromaticEnabled, aromaticRings]);

  const layout = useMemo(
    () => layoutMolecule(atoms, bonds, opts, zoom),
    [atoms, bonds, opts, zoom]
  );
  // Separate preview layout to discover ring centers even when enabled=false
  const prevOpts: LayoutOptions = useMemo(
    () =>
      acsWorldOptions(atoms, bonds, {
        ...options,
        units: "world",
        aromaticCircle: true,
      }),
    [atoms, bonds, options]
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

  // project world->screen helper
  const { gl } = useThree();
  const projectToScreen = (p: { x: number; y: number }) => {
    const v = new THREE.Vector3(p.x, p.y, 0).project(camera as THREE.Camera);
    const el = gl.domElement as HTMLCanvasElement;
    const cw = el?.clientWidth || 1;
    const ch = el?.clientHeight || 1;
    return {
      x: ((v.x + 1) / 2) * cw,
      y: ((-v.y + 1) / 2) * ch,
    };
  };

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
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      let found: { x: number; y: number; r: number; key?: string } | null =
        null;
      let minD = Infinity;
      for (const c of previewCenters) {
        const s = projectToScreen(c);
        const dx = cx - s.x;
        const dy = cy - s.y;
        const d = Math.hypot(dx, dy);
        if (d < 40 && d < minD) {
          found = { x: c.x, y: c.y, r: c.r, key: c.key };
          minD = d;
        }
      }
      if (found) {
        const changed =
          !hoverCenter ||
          Math.hypot(hoverCenter.x - found.x, hoverCenter.y - found.y) > 1e-6;
        if (changed) setHoverStart(performance.now());
        setHoverCenter(found);
      } else {
        setHoverCenter(null);
        setHoverStart(null);
      }
    };
    const onClick = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      // recompute hit at click time
      let found: { x: number; y: number; r: number; key?: string } | null =
        null;
      let minD = Infinity;
      for (const c of previewCenters) {
        const s = projectToScreen(c);
        const dx = cx - s.x;
        const dy = cy - s.y;
        const d = Math.hypot(dx, dy);
        if (d < 40 && d < minD) {
          found = { x: c.x, y: c.y, r: c.r, key: c.key };
          minD = d;
        }
      }
      const hs = hoverStartRef.current;
      const dwellOk = hs != null && performance.now() - hs >= 500;
      if ((pendingToggleRef.current && found) || (found && dwellOk)) {
        if (found?.key) toggleRing(found.key);
        else toggleAromatic();
        pendingToggleRef.current = false;
        e.stopPropagation();
        e.preventDefault();
      }
    };
    const onPointerDownCapture = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      let found: { x: number; y: number; r: number; key?: string } | null =
        null;
      let minD = Infinity;
      for (const c of previewCenters) {
        const s = projectToScreen(c);
        const dx = cx - s.x;
        const dy = cy - s.y;
        const d = Math.hypot(dx, dy);
        if (d < 40 && d < minD) {
          found = { x: c.x, y: c.y, r: c.r, key: c.key };
          minD = d;
        }
      }
      const hs = hoverStartRef.current;
      const dwellOk = hs != null && performance.now() - hs >= 500;
      if (found && dwellOk) {
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
  }, [gl, previewCenters, camera]);

  return (
    <group>
      {(layout as any).circles?.map((c: any, i: number) => {
        const N = 64;
        const pts: [number, number, number][] = [];
        for (let k = 0; k <= N; k++) {
          const t = (k / N) * Math.PI * 2;
          pts.push([c.c.x + Math.cos(t) * c.r, c.c.y + Math.sin(t) * c.r, 0]);
        }
        const lw =
          opts.units === "world"
            ? opts.lineWidthPx * Math.max(zoom, 1e-6)
            : opts.lineWidthPx;
        return (
          <CapJoinLine
            key={`circ-${i}`}
            points={pts}
            color="black"
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
