import { useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useEditor, useEditorStore } from "../store";

export function PanZoom2D() {
  const { camera, gl, invalidate } = useThree();
  const dom = gl.domElement as HTMLCanvasElement;
  const { extend } = useEditor();
  const fitNonce = useEditor((s) => s.fitNonce);
  const store = useEditorStore();
  const extendRef = useRef(extend.active);
  // Keep pan-hold state in a ref to avoid stale closures during event sequence
  const panHoldRef = useRef(false);
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const lastDownAt = useRef(0);
  const dblHold = useRef<{ active: boolean; id: number | null }>({
    active: false,
    id: null,
  });
  const maybe = useRef<{
    active: boolean;
    x: number;
    y: number;
    id: number | null;
  }>({ active: false, x: 0, y: 0, id: null });
  const pos = useRef(
    new THREE.Vector2((camera as any).position.x, (camera as any).position.y)
  );
  const vel = useRef(new THREE.Vector2(0, 0));
  const zVel = useRef(0);
  const anchor = useRef({ cx: 0, cy: 0 });
  // camera is OrthographicCamera in r3f Canvas when orthographic prop is set
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      // disable pan during bond extension or on a double-click down
      if (extendRef.current) return;
      // Block pan initiation while panHold is active (e.g., dblclick direction gesture)
      if (panHoldRef.current) return;
      const btn = (e as any).button;
      const now =
        e.timeStamp ||
        (typeof performance !== "undefined" ? performance.now() : Date.now());
      const within120 = now - (lastDownAt.current || 0) <= 120;
      lastDownAt.current = now;
      // Treat as double-click-hold only when two downs occur within 120ms
      if (btn === 0 && within120) {
        dblHold.current = { active: true, id: e.pointerId };
        return;
      }
      dragging.current = false;
      maybe.current = {
        active: true,
        x: e.clientX,
        y: e.clientY,
        id: e.pointerId,
      };
      last.current.x = e.clientX;
      last.current.y = e.clientY;
      vel.current.set(0, 0);
    };
    const onMove = (e: PointerEvent) => {
      if (extendRef.current) {
        // If we enter extend mode, cancel any pending drag
        maybe.current.active = false;
        dragging.current = false;
        return;
      }
      // Skip pan while panHold is active
      if (panHoldRef.current) return;
      if (dblHold.current.active) return;
      if (!dragging.current) {
        if (!maybe.current.active) return;
        const dx0 = e.clientX - maybe.current.x;
        const dy0 = e.clientY - maybe.current.y;
        const dist2 = dx0 * dx0 + dy0 * dy0;
        const THRESH2 = 3 * 3; // 3px threshold
        if (dist2 < THRESH2) return;
        // Engage dragging now
        dragging.current = true;
        try {
          dom.setPointerCapture(maybe.current.id ?? e.pointerId);
        } catch {}
      }
      const cz = (camera as any).zoom || 1;
      const dx = (e.clientX - last.current.x) / cz;
      const dy = (e.clientY - last.current.y) / cz;
      pos.current.x -= dx;
      pos.current.y += dy;
      vel.current.set(-dx, dy);
      last.current.x = e.clientX;
      last.current.y = e.clientY;
      invalidate();
    };
    const onUp = (e: PointerEvent) => {
      dragging.current = false;
      maybe.current.active = false;
      if (
        dblHold.current.active &&
        (dblHold.current.id === null || dblHold.current.id === e.pointerId)
      ) {
        dblHold.current = { active: false, id: null };
      }
      try {
        dom.releasePointerCapture(e.pointerId);
      } catch {}
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // lower sensitivity (was 0.001)
      const SENS = 0.00025;
      zVel.current += -e.deltaY * SENS; // accumulate in log-zoom space
      // clamp to avoid spikes from large wheel deltas
      zVel.current = Math.max(-0.12, Math.min(0.12, zVel.current));
      const rect = dom.getBoundingClientRect();
      anchor.current.cx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      anchor.current.cy = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      invalidate();
    };

    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerup", onUp);
    dom.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointermove", onMove);
      dom.removeEventListener("pointerup", onUp);
      dom.removeEventListener("wheel", onWheel);
    };
  }, [camera, gl, invalidate, dom, extend.active]);

  // When camera is updated externally (e.g., FitToContent2D), mirror it internally to avoid overrides
  useEffect(() => {
    const cam = camera as any;
    pos.current.set(cam.position.x, cam.position.y);
    vel.current.set(0, 0);
    zVel.current = 0;
    // Force a render on the next frame
    try {
      invalidate();
    } catch {}
  }, [camera, fitNonce, invalidate]);

  // If extension starts while dragging, cancel panning immediately
  useEffect(() => {
    // Keep a synchronous ref via zustand subscribe to avoid event timing issues
    const unsub = store.subscribe((s) => {
      extendRef.current = s.extend.active;
      if (s.extend.active) dragging.current = false;
    });
    return () => unsub();
  }, [store]);

  // Subscribe to panHold changes to keep ref in sync (used by DOM listeners)
  useEffect(() => {
    const unsub = store.subscribe((s) => {
      panHoldRef.current = !!s.panHold.active;
    });
    return () => unsub();
  }, [store]);

  useFrame((_, dt) => {
    const cam = camera as any;
    // inertial pan
    if (!dragging.current) {
      const panFriction = Math.exp(-4 * dt);
      vel.current.multiplyScalar(panFriction);
      if (vel.current.lengthSq() > 1e-8) {
        pos.current.add(vel.current);
      }
    }
    cam.position.x = pos.current.x;
    cam.position.y = pos.current.y;

    // inertial zoom with anchor
    const MIN_ZOOM = 1;
    const MAX_ZOOM = 300;
    if (Math.abs(zVel.current) > 1e-5) {
      const old = cam.zoom || 1;
      let next = old * Math.exp(zVel.current);
      next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
      // Keep cursor-anchored world point stable using unproject
      const cx = anchor.current.cx;
      const cy = anchor.current.cy;
      const v = new THREE.Vector3(cx, cy, 0);
      const before = v.clone().unproject(cam);
      cam.zoom = next;
      cam.updateProjectionMatrix?.();
      const after = v.clone().unproject(cam);
      cam.position.x += before.x - after.x;
      cam.position.y += before.y - after.y;
      pos.current.set(cam.position.x, cam.position.y);
      // stronger friction for smoother stop (was -6)
      const zoomFriction = Math.exp(-10 * dt);
      zVel.current *= zoomFriction;
      invalidate();
    }
  });
  return null;
}
