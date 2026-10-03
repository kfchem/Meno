import * as THREE from "three";
import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { useEditor } from "../store";
import {
  layoutMolecule,
  type Atom as LAtom,
  type Bond as LBond,
} from "../../../../lib/chem/layout2d";
import { editorLayoutOptions, layoutBonds, maxFitZoom } from "../layoutOptions";
import { useDrawingStyle } from "../useDrawingStyle";
import { chemistry } from "../../../../lib/chem/molecule";
import { STYLE_3D } from "../../../../lib/chem/style3d";
import { solidOf, standingHeight } from "../utils/molecule3d";
import { PAGE_DISTANCE } from "./PageCamera";

export default function FitToContent2D({
  paddingPx = 48,
  trigger = 0,
}: {
  paddingPx?: number;
  trigger?: number;
}) {
  const { model, autoFitSuspended } = useEditor();
  const molecules3d = useEditor((s) => s.molecules3d);
  const style = useDrawingStyle();
  const { camera, size, invalidate } = useThree();
  // Fit only when asked (the trigger): opening, adding or dropping a
  // structure asks, and so does the fit button. Drawing never does - the
  // first bond on an empty canvas is drawn where it was put, at the zoom
  // the canvas opened at, and the view stays.
  const lastTriggerRef = useRef(trigger);
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    if (autoFitSuspended) return; // skip while suspended
    const atoms = model.atoms;
    if (trigger === lastTriggerRef.current) return;
    if (atoms.length === 0 && molecules3d.length === 0) {
      lastTriggerRef.current = trigger;
      return;
    }
    // What the drawing reaches, not where the atoms are: a label hangs off
    // its atom - the H of an OH, the 2 of an NH2 - and fitting to the atoms
    // alone cuts it off at the edge. The layout already works this out.
    const index = new Map<number, number>();
    const la: LAtom[] = atoms.map((a, i) => {
      index.set(a.id, i);
      return { id: a.id, x: a.x, y: a.y, el: a.el, ...chemistry(a) };
    });
    const lb: LBond[] = layoutBonds(model.bonds, index);
    // The layout's sizes are in world units here, so they do not depend on
    // the zoom: one pass is enough, and there is no bounds-needs-zoom-needs-
    // bounds to untangle.
    const opts = editorLayoutOptions(style);
    const bounds = atoms.length
      ? layoutMolecule(la, lb, opts, cam.zoom || 1).bounds
      : { min: { x: Infinity, y: Infinity }, max: { x: -Infinity, y: -Infinity } };
    let minX = bounds.min.x;
    let minY = bounds.min.y;
    let maxX = bounds.max.x;
    let maxY = bounds.max.y;
    // and the molecules in 3D, however they are turned: as far as each
    // reaches, seen from where its near side stands
    for (const m of molecules3d) {
      const s = solidOf(m, STYLE_3D);
      const r = s.reach * (PAGE_DISTANCE / (PAGE_DISTANCE - standingHeight(s) - s.reach));
      minX = Math.min(minX, m.at.x - r);
      maxX = Math.max(maxX, m.at.x + r);
      minY = Math.min(minY, m.at.y - r);
      maxY = Math.max(maxY, m.at.y + r);
    }
    if (!isFinite(minX)) return;
    const spanX = Math.max(maxX - minX, 1e-3);
    const spanY = Math.max(maxY - minY, 1e-3);
    const w = size.width;
    const h = size.height;
    const pad = Math.max(0, Math.min(paddingPx, Math.min(w, h) * 0.45));
    const zx = (w - 2 * pad) / spanX;
    const zy = (h - 2 * pad) / spanY;
    const z = Math.max(0.01, Math.min(zx, zy, maxFitZoom(style)));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    cam.zoom = z;
    cam.updateProjectionMatrix();
    cam.position.set(cx, cy, cam.position.z);
    invalidate();
    lastTriggerRef.current = trigger;
    // size changes should also refit
  }, [
    model.atoms,
    model.bonds,
    molecules3d,
    style,
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
