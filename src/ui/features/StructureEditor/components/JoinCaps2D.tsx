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

export default function JoinCaps2D({
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
    const out: LBond[] = [];
    for (const b of model.bonds) {
      const i1 = idToIndex.get(b.a as number);
      const i2 = idToIndex.get(b.b as number);
      if (i1 == null || i2 == null) continue;
      const stereo = (b as any).stereo ?? ("none" as const);
      const order: 1 | 2 | 3 = b.order as 1 | 2 | 3;
      out.push({ a1: i1, a2: i2, order, stereo });
    }
    return out;
  }, [model.bonds, atoms, moveDrag.active, moveDrag.atomId]);

  const opts: LayoutOptions = useMemo(
    () => acsWorldOptions(atoms, bonds, { ...options, units: "world" }),
    [atoms, bonds, options]
  );
  const layout = useMemo(
    () => layoutMolecule(atoms, bonds, opts, zoom),
    [atoms, bonds, opts, zoom]
  );

  // Determine if we should suppress only the moving atom's cap (for deg>=2)
  const movingId = moveDrag.active ? moveDrag.atomId : null;
  const movingDeg = useMemo(() => {
    if (movingId == null) return 0;
    return model.bonds.reduce(
      (acc, b) => acc + (b.a === movingId || b.b === movingId ? 1 : 0),
      0
    );
  }, [model.bonds, movingId]);
  const movingPos = useMemo(() => {
    if (movingId == null) return null as { x: number; y: number } | null;
    const a = atoms.find((aa) => aa.id === movingId);
    return a ? { x: a.x, y: a.y } : null;
  }, [atoms, movingId]);

  return (
    <group>
      {(layout as any).fills
        ?.filter((c: any) => {
          if (movingId == null || movingDeg < 2 || !movingPos) return true;
          // Skip only the cap at the moving atom itself; keep neighbor caps
          const dx = c.c.x - movingPos.x;
          const dy = c.c.y - movingPos.y;
          return Math.hypot(dx, dy) > 1e-6;
        })
        .map((c: any, i: number) => (
          <mesh key={`cap-${i}`} position={[c.c.x, c.c.y, 0]} renderOrder={9}>
            <circleGeometry args={[c.r, 24]} />
            <meshBasicMaterial
              color="black"
              transparent
              opacity={1}
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
        ))}
    </group>
  );
}
