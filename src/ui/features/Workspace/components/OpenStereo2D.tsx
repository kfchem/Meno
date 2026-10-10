import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { COLORS } from "../../../theme/colors";
import { useEditor } from "../store";

/** The rings' size, as a bond's length, and how long they take to come and go. */
const RING = 0.32;
const WIDTH = 0.045;
const TAU = 0.06;

/**
 * The stereocentres and double bonds a structure is drawn without a
 * configuration of, ringed while Meno asks what to make of them (Ask3D):
 * each centre, and each double bond at its middle. They fade in and out.
 */
export default function OpenStereo2D({ atoms, bonds }: { atoms: number[]; bonds: number[] }) {
  const model = useEditor((s) => s.model);
  const invalidate = useThree((s) => s.invalidate);
  const group = useRef<THREE.Group>(null!);
  const level = useRef(0);
  const shown = atoms.length + bonds.length > 0;
  useEffect(() => invalidate(), [shown, atoms, bonds, invalidate]);
  useFrame((_, dt) => {
    const to = shown ? 1 : 0;
    const v = to + (level.current - to) * Math.exp(-Math.min(dt, 1 / 30) / TAU);
    level.current = Math.abs(v - to) < 0.005 ? to : v;
    group.current.children.forEach((c) => {
      ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.9 * level.current;
    });
    group.current.visible = level.current > 0;
    if (level.current !== to) invalidate();
  });
  const byId = new Map(model.atoms.map((a) => [a.id, a]));
  const at = [
    ...atoms.map((id) => byId.get(id)).filter((a): a is NonNullable<typeof a> => !!a).map((a) => ({ x: a.x, y: a.y })),
    ...bonds
      .map((id) => model.bonds.find((b) => b.id === id))
      .map((b) => b && byId.get(b.a) && byId.get(b.b) && { x: (byId.get(b.a)!.x + byId.get(b.b)!.x) / 2, y: (byId.get(b.a)!.y + byId.get(b.b)!.y) / 2 })
      .filter((p): p is { x: number; y: number } => !!p),
  ];
  const r = RING * NOMINAL_BOND_LENGTH;
  const w = WIDTH * NOMINAL_BOND_LENGTH;
  return (
    <group ref={group} renderOrder={6}>
      {at.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, 0]} renderOrder={6}>
          <ringGeometry args={[r - w, r, 48]} />
          <meshBasicMaterial color={COLORS.attention} transparent opacity={0} depthTest={false} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}
