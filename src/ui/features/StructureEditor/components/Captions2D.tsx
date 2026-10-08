import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { captionPlace, captionSet, type CaptionSet } from "../../../../lib/chem/captions";
import { labelSetOf } from "../../../../lib/chem/layout2d";
import { COLORS } from "../../../theme/colors";
import { TAU, follow } from "../../../theme/motion";
import { MOV_PX } from "../constants";
import { useEditor, useEditorStore } from "../store";
import type { Caption } from "../store/types";
import { pageAt } from "../utils/page";
import { useDrawnLayout } from "./drawnLayoutContext";
import { Texts2D } from "./Labels2D";

/** How far round its words a caption is taken hold of, and lit as the pointer is on it, in ems. */
const MARGIN = 0.3;
/** How strongly the light behind a caption under the pointer shows. */
const LIT = 0.16;

/** A caption as it is set, and the room it takes. */
type Laid = { c: Caption } & CaptionSet;

/**
 * The words on the page (lib/chem/captions), set as the drawing sets its
 * labels: each lit from behind while the pointer is on it - as what is under
 * the pointer is - dragged to move it, put down near an arrow to go over it
 * or under it, and written anew by a double-click (CaptionEditor2D). The
 * one being written is not drawn: its box stands in its place.
 */
export default function Captions2D() {
  const captions = useEditor((s) => s.captions);
  const editing = useEditor((s) => s.captionEdit?.id ?? null);
  const { opts } = useDrawnLayout();
  const laid = useMemo<Laid[]>(() => {
    const set = labelSetOf(opts);
    return captions.filter((c) => c.id !== editing).map((c) => ({ c, ...captionSet(c.text, c.x, c.y, opts.fontPx, set) }));
  }, [captions, editing, opts]);
  const texts = useMemo(() => laid.flatMap((l) => l.items), [laid]);
  return (
    <group>
      <Texts2D texts={texts} />
      {laid.map((l) => (
        <CaptionHold key={l.c.id} laid={l} />
      ))}
    </group>
  );
}

/** Where a caption is taken hold of: the room round its words, lit while the pointer is on it. */
function CaptionHold({ laid }: { laid: Laid }) {
  const { c, halfW, halfH } = laid;
  const store = useEditorStore();
  const hovered = useEditor((s) => s.hoveredCaption === c.id);
  const { opts } = useDrawnLayout();
  const { camera, gl, invalidate } = useThree();
  const margin = MARGIN * opts.fontPx;
  const light = useRef<THREE.MeshBasicMaterial>(null);
  // gone from under the pointer without the pointer leaving it - its box
  // standing in its place while it is written anew: no longer under it
  useEffect(
    () => () => {
      const s = store.getState();
      if (s.hoveredCaption === c.id) s.setHoveredCaption(null);
    },
    [store, c.id],
  );
  useFrame((_, dt) => {
    const m = light.current;
    if (!m) return;
    const to = hovered ? LIT : 0;
    if (Math.abs(m.opacity - to) < 1e-3) {
      m.opacity = to;
      return;
    }
    m.opacity = follow(m.opacity, to, Math.min(dt, 1 / 20), TAU.quick);
    invalidate();
  });
  const toWorld = (cx: number, cy: number) => {
    const rect = gl.domElement.getBoundingClientRect();
    const p = pageAt(((cx - rect.left) / rect.width) * 2 - 1, -(((cy - rect.top) / rect.height) * 2 - 1), camera);
    return { x: p.x, y: p.y };
  };
  return (
    <group
      // (over an arrow's hit area, where they meet: a press there is the words')
      position={[c.x, c.y, 0.04]}
      onPointerOver={() => store.getState().setHoveredCaption(c.id)}
      onPointerOut={() => store.getState().setHoveredCaption(null)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        store.getState().setCaptionEdit({ id: c.id, at: { x: c.x, y: c.y } });
      }}
      onPointerDown={(e) => {
        // a right press is the menu's, or the view's to move
        if (e.nativeEvent.button !== 0) return;
        // (one press, one thing moved: not the arrow under the words as well)
        e.stopPropagation();
        const sx = e.nativeEvent.clientX;
        const sy = e.nativeEvent.clientY;
        const at = toWorld(sx, sy);
        const off = { x: c.x - at.x, y: c.y - at.y };
        const gesture = `move-${performance.now()}`;
        let moved = false;
        const st = store.getState();
        st.beginPanHold(e.nativeEvent.pointerId);
        const onMove = (ev: PointerEvent) => {
          if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < MOV_PX) return;
          moved = true;
          const q = toWorld(ev.clientX, ev.clientY);
          // (taken from an arrow as it is moved: put down near one, it goes over it again)
          store.getState().updateCaption(c.id, { x: q.x + off.x, y: q.y + off.y, arrow: null }, gesture);
        };
        const onUp = (ev: PointerEvent) => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp, true);
          const s = store.getState();
          s.endPanHold(ev.pointerId);
          if (!moved) return;
          const q = toWorld(ev.clientX, ev.clientY);
          const set = labelSetOf(opts);
          const others = s.captions
            .filter((o) => o.id !== c.id)
            .map((o) => {
              const r = captionSet(o.text, o.x, o.y, opts.fontPx, set);
              return { ...o, halfW: r.halfW, halfH: r.halfH };
            });
          const placed = captionPlace({ x: q.x + off.x, y: q.y + off.y }, { w: halfW, h: halfH }, s.arrows, opts.fontPx, others);
          s.updateCaption(c.id, { x: placed.x, y: placed.y, arrow: placed.arrow ?? null }, gesture);
          // (the button coming up here is no click on empty space)
          s.suppressDoubleClick(200);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp, true);
      }}
    >
      <mesh renderOrder={5}>
        <planeGeometry args={[2 * (halfW + margin), 2 * (halfH + margin)]} />
        <meshBasicMaterial ref={light} color={COLORS.highlight} transparent opacity={0} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}
