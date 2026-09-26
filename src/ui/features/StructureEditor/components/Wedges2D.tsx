import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useState } from "react";
import { useEditor } from "../store";
import {
  layoutMolecule,
  type LayoutOptions,
  type Atom as LAtom,
  type Bond as LBond,
} from "../../../../lib/chem/layout2d";
import { polyTriangles } from "./polyTriangles";
import { editorLayoutOptions, layoutBonds } from "../layoutOptions";

export default function Wedges2D({
  options,
}: {
  options?: Partial<LayoutOptions>;
}) {
  const { camera } = useThree();
  const { model, moveDrag } = useEditor();
  const [zoom, setZoom] = useState((camera as THREE.OrthographicCamera).zoom);
  useFrame(() => {
    const z = (camera as THREE.OrthographicCamera).zoom;
    if (z !== zoom) setZoom(z);
  });

  const atoms: LAtom[] = useMemo(
    () => model.atoms.map((a) => ({ id: a.id, x: a.x, y: a.y, el: a.el })),
    [model.atoms]
  );
  const bonds: LBond[] = useMemo(() => {
    const idToIndex = new Map<number, number>();
    atoms.forEach((a, i) => idToIndex.set(a.id, i));
    const movingId = moveDrag.active ? moveDrag.atomId : null;
    const srcBonds =
      movingId != null
        ? model.bonds.filter((b) => b.a !== movingId && b.b !== movingId)
        : model.bonds;
    return layoutBonds(srcBonds, idToIndex);
  }, [model.bonds, atoms, moveDrag.active, moveDrag.atomId]);

  const opts: LayoutOptions = useMemo(
    () => editorLayoutOptions(atoms, bonds, options),
    [atoms, bonds, options]
  );
  const layout = useMemo(
    () => layoutMolecule(atoms, bonds, opts, zoom),
    [atoms, bonds, opts, zoom]
  );

  return (
    <group>
      {layout.polys.map((p, i) => {
        if (p.points.length < 3) return null;
        const g = new THREE.BufferGeometry().setFromPoints(
          p.points.map((pt) => new THREE.Vector3(pt.x, pt.y, 0))
        );
        g.setIndex(polyTriangles(p.points));
        return (
          <mesh
            key={`poly-${i}`}
            geometry={g}
            renderOrder={20}
            // Let BondsPick2D handle pointer events instead of this mesh
            raycast={
              (/* raycaster, intersects */) => {
                /* no-op to disable picking */
              }
            }
          >
            <meshBasicMaterial
              color="black"
              depthTest={false}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        );
      })}
    </group>
  );
}
