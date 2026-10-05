import * as THREE from "three";
import { pageAt } from "../utils/page";
import { useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { arrowEnds, reshapedArrow } from "../../../../lib/chem/reactionScheme";
import { COLORS } from "../../../theme/colors";
import { FREE_MS } from "../constants";
import { useEditor, useEditorStore } from "../store";
import ReactionArrow2D from "./ReactionArrow2D";
import { TAU, follow } from "../../../theme/motion";

/** An end handle's radius on the screen, in pixels, and how far round it a press takes it. */
const HANDLE_PX = 6;
const HANDLE_HIT = 2;
/** The steps an end's direction snaps to, in degrees: a bond's. */
const SNAP_STEP = 15;
/** The shortest an arrow is drawn out to, in bonds. */
const MIN_LENGTH = 0.5;

type Pointerish = { button?: number; clientX: number; clientY: number; pointerId?: number };
const native = (e: unknown): Pointerish => ((e as { nativeEvent?: Pointerish }).nativeEvent ?? (e as Pointerish));

/**
 * The reaction arrows: each dragged to move it, the one under the pointer
 * the one a right-click's menu is for. That one shows a handle at either
 * end: dragged, the end goes where the pointer goes, the other staying put -
 * its direction in steps of 15 degrees, as a bond's, until the pointer
 * pauses, and then freely.
 */
export default function Arrows2D() {
  const arrows = useEditor((s) => s.arrows);
  const hoveredArrow = useEditor((s) => s.hoveredArrow);
  const store = useEditorStore();
  const { camera, gl, invalidate } = useThree();
  const canvas = gl.domElement as HTMLCanvasElement;
  const toWorld = (cx: number, cy: number) => {
    const rect = canvas.getBoundingClientRect();
    const v = new THREE.Vector3(
      ((cx - rect.left) / rect.width) * 2 - 1,
      -(((cy - rect.top) / rect.height) * 2 - 1),
      0
    );
    const p = pageAt(v.x, v.y, camera);
    return { x: p.x, y: p.y };
  };
  // the arrow whose end is being drawn out: its handles stay while it is
  const [reshaping, setReshaping] = useState<number | null>(null);
  const handles = useRef<THREE.Group[]>([]);
  // how far each arrow's handles are in view: they grow in as it is hovered
  // and shrink out as it is left, rather than appear and vanish
  const handleLevel = useRef(new Map<number, number>());
  const [, setFrame] = useState(0);
  // the handles the same size on the screen at any zoom
  useFrame((_, dt) => {
    let moving = false;
    const d = Math.min(dt, 1 / 20);
    for (const a of arrows) {
      const to = hoveredArrow === a.id || reshaping === a.id ? 1 : 0;
      const was = handleLevel.current.get(a.id) ?? 0;
      if (was === to) continue;
      const n = follow(was, to, d, TAU.quick);
      const next = Math.abs(n - to) < 0.01 ? to : n;
      if (next === 0) handleLevel.current.delete(a.id);
      else handleLevel.current.set(a.id, next);
      moving = true;
    }
    const k = HANDLE_PX / Math.max((camera as THREE.OrthographicCamera).zoom, 1e-6);
    for (const h of handles.current) {
      if (!h) continue;
      const level = (h.userData.level as number) ?? 1;
      h.scale.setScalar(k * (0.6 + 0.4 * level));
      h.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
        if (m && m.userData.seen) m.opacity = level;
      });
    }
    if (moving) {
      setFrame((f) => f + 1);
      invalidate();
    }
  });

  /** A press on the arrow: it follows the pointer, as one step. */
  const startMove = (id: number, e: unknown) => {
    const ev = native(e);
    // a right press is the menu's, or the view's to move
    if ((ev.button ?? 0) !== 0) return;
    const a = store.getState().arrows.find((x) => x.id === id);
    if (!a) return;
    const p = toWorld(ev.clientX, ev.clientY);
    const off = { x: a.x - p.x, y: a.y - p.y };
    const gesture = `move-${performance.now()}`;
    store.getState().beginPanHold(ev.pointerId ?? null);
    const onMove = (m: PointerEvent) => {
      const q = toWorld(m.clientX, m.clientY);
      store.getState().updateArrow(id, { x: q.x + off.x, y: q.y + off.y }, gesture);
    };
    const onUp = (u: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
      store.getState().endPanHold(u.pointerId);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, true);
  };

  /** A press on an end's handle: that end follows the pointer, the other stays. */
  const startReshape = (id: number, end: "head" | "tail", e: { stopPropagation: () => void }) => {
    const ev = native(e);
    if ((ev.button ?? 0) !== 0) return;
    e.stopPropagation();
    const a = store.getState().arrows.find((x) => x.id === id);
    if (!a) return;
    const { from, to } = arrowEnds(a);
    const fixed = end === "head" ? from : to;
    const gesture = `reshape-${performance.now()}`;
    let free = false;
    let pause: number | null = null;
    let last = toWorld(ev.clientX, ev.clientY);
    setReshaping(id);
    store.getState().beginPanHold(ev.pointerId ?? null);
    const apply = () => {
      const shape = reshapedArrow(end, fixed, last, {
        step: free ? undefined : (SNAP_STEP * Math.PI) / 180,
        minLength: MIN_LENGTH * NOMINAL_BOND_LENGTH,
      });
      store.getState().updateArrow(id, shape, gesture);
    };
    const onMove = (m: PointerEvent) => {
      last = toWorld(m.clientX, m.clientY);
      apply();
      // (a pause lets go of the steps, as a bond's does)
      if (pause != null) window.clearTimeout(pause);
      pause = window.setTimeout(() => {
        free = true;
        apply();
      }, FREE_MS);
    };
    const onUp = (u: PointerEvent) => {
      if (pause != null) window.clearTimeout(pause);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
      store.getState().endPanHold(u.pointerId);
      setReshaping(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, true);
  };

  handles.current = [];
  return (
    <group>
      {arrows.map((a) => {
        const { from, to } = arrowEnds(a);
        const level = handleLevel.current.get(a.id) ?? 0;
        const shown = level > 0;
        return (
          <group
            key={a.id}
            position={[0, 0, 0.02]}
            // (the arrow under the pointer is the one a right-click's menu is for)
            onPointerOver={() => store.getState().setHoveredArrow(a.id)}
            onPointerOut={() => store.getState().setHoveredArrow(null)}
            onPointerDown={(e) => startMove(a.id, e)}
          >
            <ReactionArrow2D x1={from.x} y1={from.y} x2={to.x} y2={to.y} look={a.look} />
            {/* invisible thicker hit area to ease dragging */}
            <mesh position={[a.x, a.y, 0.015]} rotation={[0, 0, a.angle]}>
              <boxGeometry args={[a.length + 0.8, 0.8, 0.001]} />
              <meshBasicMaterial
                transparent
                opacity={0}
                depthTest={false}
                depthWrite={false}
              />
            </mesh>
            {shown &&
              ([
                ["tail", from],
                ["head", to],
              ] as const).map(([end, at]) => (
                <group
                  key={end}
                  ref={(g) => {
                    if (g) handles.current.push(g);
                  }}
                  userData={{ level }}
                  position={[at.x, at.y, 0.006]}
                  onPointerDown={(e) => startReshape(a.id, end, e)}
                >
                  {/* (what a press takes, wider than what is seen) */}
                  <mesh>
                    <circleGeometry args={[HANDLE_HIT, 24]} />
                    <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                  </mesh>
                  <mesh renderOrder={41}>
                    <circleGeometry args={[1, 24]} />
                    <meshBasicMaterial color="#ffffff" depthTest={false} toneMapped={false} transparent opacity={level} userData={{ seen: true }} />
                  </mesh>
                  <mesh renderOrder={42}>
                    <ringGeometry args={[0.68, 1, 24]} />
                    <meshBasicMaterial color={COLORS.highlight} depthTest={false} toneMapped={false} transparent opacity={level} userData={{ seen: true }} />
                  </mesh>
                </group>
              ))}
          </group>
        );
      })}
    </group>
  );
}
