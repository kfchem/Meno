import * as THREE from "three";
import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { useEditor, useEditorStore } from "../store";
import {
  layoutMolecule,
  type Atom as LAtom,
  type Bond as LBond,
} from "../../../../lib/chem/layout2d";
import { editorLayoutOptions, layoutBonds, maxFitZoom } from "../layoutOptions";
import { useDrawingStyle } from "../useDrawingStyle";
import { chemistry } from "../../../../lib/chem/molecule";
import { STYLE_3D } from "../../../../lib/chem/style3d";
import { lookOf, poseOf, seenBounds, solidOf } from "../utils/molecule3d";
import { PAGE_DISTANCE } from "./PageCamera";
import { setViewGoal } from "./viewGoal";

export default function FitToContent2D({
  paddingPx = 48,
  trigger = 0,
}: {
  paddingPx?: number;
  trigger?: number;
}) {
  const { model, autoFitSuspended } = useEditor();
  const molecules3d = useEditor((s) => s.molecules3d);
  const store = useEditorStore();
  const style = useDrawingStyle();
  const { camera, size, invalidate } = useThree();
  // Fit only when asked (the trigger): opening, adding or dropping a
  // structure asks, and so does the fit button. Drawing never does - the
  // first bond on an empty canvas is drawn where it was put, at the zoom
  // the canvas opened at, and the view stays.
  const lastTriggerRef = useRef(trigger);
  // What a canvas holds as its view first comes up - a file it was opened
  // with, read before the view was there to ask for a fit - is shown whole:
  // on its middle, at the zoom the canvas opens at or as far out as it
  // needs, never further in. (Molecules in 3D stand beside a drawing, where
  // the opening zoom alone may not reach.)
  const opened = useRef(false);
  // (the first fit, of a canvas that has shown nothing yet, is where its
  // view starts; after that a fit goes there)
  const fitted = useRef(false);
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    if (autoFitSuspended) return; // skip while suspended
    const atoms = model.atoms;
    const first = !opened.current;
    opened.current = true;
    if (first && atoms.length === 0 && molecules3d.length === 0) return;
    if (!first && trigger === lastTriggerRef.current) return;
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
    // and the molecules in 3D, as each is turned and shown now, seen from
    // where the camera stands: first from straight above each, then - as
    // one off to the side is seen further out, in perspective - from where
    // that first fit put the camera
    const { turns3d, frames3d } = store.getState();
    const poses = molecules3d.map((m) =>
      poseOf(m, solidOf(m, STYLE_3D), lookOf(m, STYLE_3D), turns3d[m.id], frames3d[m.id]),
    );
    const w = size.width;
    const h = size.height;
    const pad = Math.max(0, Math.min(paddingPx, Math.min(w, h) * 0.45));
    const fitFrom = (eye?: { x: number; y: number }) => {
      let minX = bounds.min.x;
      let minY = bounds.min.y;
      let maxX = bounds.max.x;
      let maxY = bounds.max.y;
      for (const pose of poses) {
        const b = seenBounds(pose, PAGE_DISTANCE, eye);
        minX = Math.min(minX, b.minX);
        maxX = Math.max(maxX, b.maxX);
        minY = Math.min(minY, b.minY);
        maxY = Math.max(maxY, b.maxY);
      }
      const zx = (w - 2 * pad) / Math.max(maxX - minX, 1e-3);
      const zy = (h - 2 * pad) / Math.max(maxY - minY, 1e-3);
      return { zoom: Math.max(0.01, Math.min(zx, zy, maxFitZoom(style))), cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
    };
    let seen = fitFrom();
    if (!isFinite(seen.cx)) return;
    if (poses.length) seen = fitFrom({ x: seen.cx, y: seen.cy });
    const fit = seen.zoom;
    const z = first ? Math.min(fit, cam.zoom || fit) : fit;
    const cx = seen.cx;
    const cy = seen.cy;
    if (fitted.current) {
      setViewGoal(cam, { zoom: z, x: cx, y: cy });
    } else {
      cam.zoom = z;
      cam.updateProjectionMatrix();
      cam.position.set(cx, cy, cam.position.z);
      fitted.current = true;
    }
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
    store,
  ]);
  return null;
}
