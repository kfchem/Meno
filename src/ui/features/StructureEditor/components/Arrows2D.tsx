import * as THREE from "three";
import { useRef } from "react";
import { useThree } from "@react-three/fiber";
import { useEditor } from "../store";
import ReactionArrow2D from "./ReactionArrow2D";

export default function Arrows2D() {
  const arrows = useEditor((s) => s.arrows);
  const updateArrow = useEditor((s) => s.updateArrow);
  const beginPanHold = useEditor((s) => s.beginPanHold);
  const endPanHold = useEditor((s) => s.endPanHold);
  const { camera, gl } = useThree();
  const canvas = gl.domElement as HTMLCanvasElement;
  const toWorld = (cx: number, cy: number) => {
    const rect = canvas.getBoundingClientRect();
    const v = new THREE.Vector3(
      ((cx - rect.left) / rect.width) * 2 - 1,
      -(((cy - rect.top) / rect.height) * 2 - 1),
      0
    );
    v.unproject(camera as any);
    return { x: v.x, y: v.y };
  };

  const dragRef = useRef<{ id: number; offx: number; offy: number } | null>(
    null
  );

  return (
    <group>
      {arrows.map((a) => {
        const dx = Math.cos(a.angle) * (a.length / 2);
        const dy = Math.sin(a.angle) * (a.length / 2);
        const x1 = a.x - dx;
        const y1 = a.y - dy;
        const x2 = a.x + dx;
        const y2 = a.y + dy;
        return (
          <group
            key={a.id}
            position={[0, 0, 0.02]}
            onPointerDown={(e) => {
              const cx = (e as any).clientX ?? (e as any).nativeEvent?.clientX;
              const cy = (e as any).clientY ?? (e as any).nativeEvent?.clientY;
              const p = toWorld(cx, cy);
              dragRef.current = { id: a.id, offx: a.x - p.x, offy: a.y - p.y };
              const pid =
                (e as any).pointerId ??
                (e as any).nativeEvent?.pointerId ??
                null;
              beginPanHold(pid);
              // capture moves on window for robustness
              const onMove = (ev: PointerEvent) => {
                if (!dragRef.current) return;
                const q = toWorld(ev.clientX, ev.clientY);
                updateArrow(dragRef.current.id, {
                  x: q.x + dragRef.current.offx,
                  y: q.y + dragRef.current.offy,
                });
              };
              const onUp = (ev: PointerEvent) => {
                dragRef.current = null;
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onUp, true);
                try {
                  endPanHold(ev.pointerId);
                } catch {
                  endPanHold(null);
                }
              };
              window.addEventListener("pointermove", onMove);
              window.addEventListener("pointerup", onUp, true);
            }}
          >
            <ReactionArrow2D x1={x1} y1={y1} x2={x2} y2={y2} />
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
          </group>
        );
      })}
    </group>
  );
}
