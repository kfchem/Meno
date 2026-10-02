import { useThree } from "@react-three/fiber";
import { useLayoutEffect } from "react";
import * as THREE from "three";

/** How far the perspective camera stands from the page, in world units (a bond is 1.8). */
export const PAGE_DISTANCE = 60;

/**
 * A perspective camera looking straight at the page, made to keep the
 * orthographic camera's zoom: its field of view is set so that at zoom 1
 * the page (z = 0) has one CSS pixel per world unit, and three.js's zoom
 * narrows the view from there. Head-on, the page is drawn exactly as the
 * orthographic camera draws it; what stands off the page is seen in
 * perspective, as from PAGE_DISTANCE away whatever the zoom.
 */
export default function PageCamera({ distance = PAGE_DISTANCE }: { distance?: number }) {
  const camera = useThree((s) => s.camera);
  const height = useThree((s) => s.size.height);
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(height / (2 * distance)));
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, height, distance, invalidate]);
  return null;
}
