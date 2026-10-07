import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useEditorStore } from "../store";
import { EYE_HEIGHT } from "../utils/page";
import { dollyAt, dollyProjection } from "../utils/rise";

/**
 * While molecules rise out of their drawing, the view sees the page in
 * perspective for a moment, and back - a dolly zoom: the angle opens as
 * the camera draws back, so that the page and the drawing on it stay as
 * they were while what stands up off it is seen in depth (the maintainer's
 * trial, 2026-10-07). The camera stays the orthographic one; only what it
 * projects with changes, set as each frame is drawn - after anything else
 * has set it that frame - and put back once the rise is over.
 */
export default function DollyRise() {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const store = useEditorStore();
  useEffect(() => {
    if (!(camera instanceof THREE.OrthographicCamera)) return;
    let seen = false;
    const before = scene.onBeforeRender;
    scene.onBeforeRender = (...args) => {
      before.apply(scene, args);
      const starts = Object.values(store.getState().rising3d).map((r) => r.start);
      const m = dollyProjection(camera, EYE_HEIGHT, dollyAt(performance.now(), starts));
      if (m) {
        camera.projectionMatrix.copy(m);
        camera.projectionMatrixInverse.copy(m).invert();
        seen = true;
      } else if (seen) {
        camera.updateProjectionMatrix();
        seen = false;
      }
    };
    return () => {
      scene.onBeforeRender = before;
      if (seen) camera.updateProjectionMatrix();
    };
  }, [scene, camera, store]);
  return null;
}
