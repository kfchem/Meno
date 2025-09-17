import * as THREE from "three";
import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { useEditor } from "../store";

export default function FitToContent2D({
  paddingPx = 48,
  trigger = 0,
}: {
  paddingPx?: number;
  trigger?: number;
}) {
  const { model, autoFitSuspended } = useEditor();
  const { camera, size, invalidate } = useThree();
  // Only auto-fit when content appears (0 -> >0) or when trigger changes.
  const lastCountRef = useRef(0);
  const lastTriggerRef = useRef(trigger);
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera;
    if (autoFitSuspended) return; // skip while suspended
    const atoms = model.atoms;
    const count = atoms.length;

    const triggerChanged = trigger !== lastTriggerRef.current;
    const appeared = lastCountRef.current === 0 && count > 0;
    if (!appeared && !triggerChanged) {
      // Skip refit to avoid resetting user zoom/pan (e.g., on double click add)
      lastCountRef.current = count;
      lastTriggerRef.current = trigger;
      return;
    }
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const a of atoms) {
      if (a.x < minX) minX = a.x;
      if (a.y < minY) minY = a.y;
      if (a.x > maxX) maxX = a.x;
      if (a.y > maxY) maxY = a.y;
    }
    if (!isFinite(minX)) return;
    const spanX = Math.max(maxX - minX, 1e-3);
    const spanY = Math.max(maxY - minY, 1e-3);
    const w = size.width;
    const h = size.height;
    const pad = Math.max(0, Math.min(paddingPx, Math.min(w, h) * 0.45));
    const zx = (w - 2 * pad) / spanX;
    const zy = (h - 2 * pad) / spanY;
    const z = Math.max(0.01, Math.min(zx, zy));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    cam.zoom = z;
    cam.updateProjectionMatrix();
    cam.position.set(cx, cy, cam.position.z);
    invalidate();
    lastCountRef.current = count;
    lastTriggerRef.current = trigger;
    // size changes should also refit
  }, [
    model.atoms.length,
    camera,
    size.width,
    size.height,
    invalidate,
    paddingPx,
    trigger,
    autoFitSuspended,
  ]);
  return null;
}
