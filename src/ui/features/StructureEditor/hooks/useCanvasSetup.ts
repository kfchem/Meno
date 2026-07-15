import * as THREE from "three";
import { useCallback } from "react";
import { RootState } from "@react-three/fiber";

export function useCanvasSetup(
  camRef: React.MutableRefObject<THREE.OrthographicCamera | null>,
  domRef: React.MutableRefObject<HTMLCanvasElement | null>,
) {
  return useCallback(
    (state: RootState) => {
      try {
        if (state.gl.setClearColor) state.gl.setClearColor("#ffffff", 1);
        if (state.gl.clear) state.gl.clear();
      } catch {}
      const canvas = state.gl.domElement as HTMLCanvasElement;
      const onLost = (e: Event) => e.preventDefault();
      const onRestored = () => state.invalidate();
      canvas.addEventListener("webglcontextlost", onLost as any, false);
      canvas.addEventListener("webglcontextrestored", onRestored as any, false);
      camRef.current = state.camera as THREE.OrthographicCamera;
      domRef.current = canvas;

      // Ensure the WebGL renderer uses the same pixelRatio and enable
      // antialiasing-related settings. This helps on displays reporting
      // devicePixelRatio=1 where aliasing can be more noticeable.
      try {
        const DPR =
          typeof window !== "undefined"
            ? Math.max(window.devicePixelRatio || 1, 1.5)
            : 1.5;
        if (state.gl.setPixelRatio) state.gl.setPixelRatio(DPR);
        // For canvas 2D fallback or composited canvases, ensure smoothing is enabled
        try {
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.imageSmoothingEnabled = true;
            // Some browsers expose prefixed names
            // @ts-expect-error - vendor-prefixed, not in lib.dom types
            ctx.webkitImageSmoothingEnabled = true;
            // @ts-expect-error - vendor-prefixed, not in lib.dom types
            ctx.mozImageSmoothingEnabled = true;
          }
        } catch {}
      } catch {}
    },
    [camRef, domRef],
  );
}
