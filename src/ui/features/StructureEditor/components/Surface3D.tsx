import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { Grid } from "../../../../lib/calc/results";
import type { Mesh, Vec3 } from "../utils/isosurface";
import { surfaceOf } from "../utils/surfaces";

/** How far a surface is seen through - its opacity - and how quickly it comes and goes, in seconds. */
const OPACITY = 0.6;
const FADE_TAU = 0.08;

function geometryOf(m: Mesh): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(m.positions, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(m.normals, 3));
  return g;
}

/**
 * A grid's surface, in its molecule (lib/calc/results `Grid`): where its
 * values come to `iso` - and a two-signed grid's, where they come to its
 * negative too - in the two colours of the 3D style, seen through. Worked
 * out off the main thread (../utils/surfaces); a new value's surface takes
 * the old one's place when it is ready, the last value asked for winning.
 * It fades in, and out as its grid is let go.
 */
export default function Surface3D({
  grid,
  centre,
  iso,
  plus,
  minus,
  renderOrder,
}: {
  /** The grid; none, its surface fading out. */
  grid: Grid | null;
  /** Its molecule's centre in the frame it belongs to, in ångströms: what the molecule is drawn about. */
  centre: Vec3;
  iso: number;
  plus: string;
  minus: string;
  renderOrder: number;
}) {
  const { invalidate } = useThree();
  const [meshes, setMeshes] = useState<{ plus: THREE.BufferGeometry; minus: THREE.BufferGeometry | null } | null>(null);
  const level = useRef(0);
  const plusMat = useRef<THREE.MeshStandardMaterial>(null);
  const minusMat = useRef<THREE.MeshStandardMaterial>(null);
  // one surface worked out at a time: the value last asked for, once the
  // one under way is done - a slider dragged asks for many - and none for
  // a grid no longer shown
  const mounted = useRef(true);
  const busy = useRef(false);
  const wanted = useRef<{ grid: Grid; centre: Vec3; iso: number } | null>(null);
  const showing = useRef<Grid | null>(grid);
  showing.current = grid;
  const [cx, cy, cz] = centre;
  const pump = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    while (mounted.current && wanted.current) {
      const want = wanted.current;
      wanted.current = null;
      try {
        const m = await surfaceOf(want.grid, want.centre, want.iso);
        if (!mounted.current || showing.current !== want.grid) continue;
        setMeshes((was) => {
          was?.plus.dispose();
          was?.minus?.dispose();
          return { plus: geometryOf(m.plus), minus: m.minus ? geometryOf(m.minus) : null };
        });
        invalidate();
      } catch {
        // (a grid the worker could not take: nothing shown)
      }
    }
    busy.current = false;
  }, [invalidate]);

  useEffect(() => {
    if (!grid) return;
    wanted.current = { grid, centre: [cx, cy, cz], iso };
    void pump();
  }, [grid, cx, cy, cz, iso, pump]);

  // (let go when it leaves)
  useEffect(
    () => () => {
      mounted.current = false;
      setMeshes((was) => {
        was?.plus.dispose();
        was?.minus?.dispose();
        return null;
      });
    },
    [],
  );

  useFrame((_, dt) => {
    const to = grid && meshes ? OPACITY : 0;
    const v = to + (level.current - to) * Math.exp(-Math.min(dt, 1 / 30) / FADE_TAU);
    level.current = Math.abs(v - to) < 0.005 ? to : v;
    for (const mat of [plusMat.current, minusMat.current]) {
      if (mat) {
        mat.opacity = level.current;
        mat.visible = level.current > 0.005;
      }
    }
    if (level.current !== to) invalidate();
    else if (to === 0 && meshes && !grid) {
      setMeshes((was) => {
        was?.plus.dispose();
        was?.minus?.dispose();
        return null;
      });
    }
  });

  if (!meshes) return null;
  return (
    <group>
      <mesh geometry={meshes.plus} renderOrder={renderOrder} frustumCulled={false} raycast={() => {}}>
        <meshStandardMaterial
          ref={plusMat}
          color={plus}
          transparent
          opacity={0}
          depthWrite={false}
          side={THREE.DoubleSide}
          roughness={0.55}
          metalness={0}
        />
      </mesh>
      {meshes.minus && (
        <mesh geometry={meshes.minus} renderOrder={renderOrder} frustumCulled={false} raycast={() => {}}>
          <meshStandardMaterial
            ref={minusMat}
            color={minus}
            transparent
            opacity={0}
            depthWrite={false}
            side={THREE.DoubleSide}
            roughness={0.55}
            metalness={0}
          />
        </mesh>
      )}
    </group>
  );
}
