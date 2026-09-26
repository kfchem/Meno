import * as THREE from "three";
import { useEffect, useMemo } from "react";
import { polyTriangles } from "./polyTriangles";
import { useDrawnLayout } from "./drawnLayoutContext";

/**
 * The drawing's filled shapes, from the shared layout: wedges, bold bonds,
 * hashes cut as trapezoids, arrowheads, and the mitres where lines meet. All
 * of them in one mesh, rebuilt when the layout changes - which is every frame
 * of a drag - with the old geometry let go each time.
 */
export default function Wedges2D() {
  const { layout } = useDrawnLayout();
  const geometry = useMemo(() => {
    const positions: number[] = [];
    for (const p of layout.polys) {
      if (p.points.length < 3) continue;
      for (const i of polyTriangles(p.points)) {
        positions.push(p.points[i].x, p.points[i].y, 0);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return g;
  }, [layout]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh
      geometry={geometry}
      renderOrder={20}
      frustumCulled={false}
      // Let BondsPick2D handle pointer events instead of this mesh
      raycast={() => {}}
    >
      <meshBasicMaterial
        color="black"
        depthTest={false}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
