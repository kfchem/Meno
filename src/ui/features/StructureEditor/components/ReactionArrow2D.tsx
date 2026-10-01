import * as THREE from "three";
import { useEffect, useMemo } from "react";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { resolveStyle } from "../../../../lib/chem/style";
import {
  arrowMeasures,
  arrowOutline,
  type ArrowLook,
} from "../../../../lib/chem/reactionArrow";
import { useDrawingStyle } from "../useDrawingStyle";
import { useDrawnLayout } from "./drawnLayoutContext";

/**
 * A reaction arrow from (x1, y1) to its point at (x2, y2): its line and its
 * head as the drawing style has them, over which `look` sets what this arrow
 * sets for itself - in the bonds' colour unless told otherwise.
 */
export default function ReactionArrow2D({
  x1,
  y1,
  x2,
  y2,
  look,
  color,
  z = 0,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  look?: ArrowLook;
  color?: string;
  z?: number;
}) {
  const style = useDrawingStyle();
  const { opts, zoom } = useDrawnLayout();
  const fill = color ?? opts.bondColor ?? "black";
  const geometry = useMemo(() => {
    const m = arrowMeasures(resolveStyle(style, look), NOMINAL_BOND_LENGTH);
    // no thinner on the screen than a bond is kept, however far out the
    // view is (layout2d's lineHalfOf)
    const least = Math.max(0.5, opts.minLinePx ?? 1) / Math.max(zoom, 1e-6);
    const outline = arrowOutline(
      { x: x1, y: y1 },
      { x: x2, y: y2 },
      { ...m, thickness: Math.max(m.thickness, least) },
    );
    return new THREE.ShapeGeometry(
      new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, p.y))),
    );
  }, [style, look, opts.minLinePx, zoom, x1, y1, x2, y2]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} position={[0, 0, z]}>
      <meshBasicMaterial
        color={fill}
        toneMapped={false}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}
