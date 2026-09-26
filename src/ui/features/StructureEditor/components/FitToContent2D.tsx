import * as THREE from "three";
import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { useEditor } from "../store";
import {
  layoutMolecule,
  type Atom as LAtom,
  type Bond as LBond,
} from "../../../../lib/chem/layout2d";
import { editorLayoutOptions, layoutBonds } from "../layoutOptions";

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
    // What the drawing reaches, not where the atoms are: a label hangs off
    // its atom - the H of an OH, the 2 of an NH2 - and fitting to the atoms
    // alone cuts it off at the edge. The layout already works this out.
    const index = new Map<number, number>();
    const la: LAtom[] = atoms.map((a, i) => {
      index.set(a.id, i);
      return { id: a.id, x: a.x, y: a.y, el: a.el };
    });
    const lb: LBond[] = layoutBonds(model.bonds, index);
    // The layout's sizes are in world units here, so they do not depend on
    // the zoom: one pass is enough, and there is no bounds-needs-zoom-needs-
    // bounds to untangle.
    const opts = editorLayoutOptions(la, lb);
    const bounds = layoutMolecule(la, lb, opts, cam.zoom || 1).bounds;
    const minX = bounds.min.x;
    const minY = bounds.min.y;
    const maxX = bounds.max.x;
    const maxY = bounds.max.y;
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
    model.atoms,
    model.bonds,
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
