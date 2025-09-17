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
import { acsWorldOptions } from "../../../../lib/chem/acs";

export default function Wedges2D({
  options,
}: {
  options?: Partial<LayoutOptions>;
}) {
  const { camera } = useThree();
  const { model } = useEditor();
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
    const out: LBond[] = [];
    for (const b of model.bonds) {
      const i1 = idToIndex.get(b.a as number);
      const i2 = idToIndex.get(b.b as number);
      if (i1 == null || i2 == null) continue;
      const stereo = (b as any).stereo ?? ("none" as const);
      const order: 1 | 2 | 3 = b.order as 1 | 2 | 3;
      const doubleMode = (b as any).doubleMode ?? "auto";
      const stereoOrient = (b as any).stereoOrient ?? ("principle" as const);
      out.push({
        a1: i1,
        a2: i2,
        order,
        stereo,
        doubleMode,
        stereoOrient,
      } as any);
    }
    return out;
  }, [model.bonds, atoms]);

  const opts: LayoutOptions = useMemo(
    () => acsWorldOptions(atoms, bonds, { ...options, units: "world" }),
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
        (g as any).setIndex([0, 1, 2]);
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
