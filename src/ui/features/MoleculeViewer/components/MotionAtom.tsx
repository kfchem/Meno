import { useEffect, useRef } from "react";
import { useSpring } from "motion/react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import FacingText from "./FacingText";
import { Atom } from "../../../../utils/structureParsers";
import { getColor, getVdwRadius } from "../../../../utils/atomUtils";

export default function MotionAtom({
  atom,
  mode,
  label,
  selected = false,
  onClick,
}: {
  atom: Atom;
  mode: "ball" | "vdw";
  label?: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  const base = getVdwRadius(atom.element);
  const defaultScale = mode === "ball" ? base * 0.2 : base;

  const springConfig = { stiffness: 100, damping: 20, mass: 0.5 };
  const x = useSpring(atom.x, springConfig);
  const y = useSpring(atom.y, springConfig);
  const z = useSpring(atom.z, springConfig);

  const scale = useSpring(defaultScale, { stiffness: 150, damping: 15 });

  const highlightConfig = { stiffness: 200, damping: 5, mass: 0.25 };
  const highlightScale = useSpring(
    selected ? defaultScale * 1.6 : 0,
    highlightConfig
  );

  const meshRef = useRef<THREE.Mesh>(null);
  const highlightRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    x.set(atom.x);
    y.set(atom.y);
    z.set(atom.z);
    scale.set(defaultScale);
    highlightScale.set(selected ? defaultScale * 1.6 : 0);
  }, [atom, defaultScale, selected, x, y, z, scale, highlightScale]);

  useFrame(() => {
    const px = x.get(),
      py = y.get(),
      pz = z.get();
    const s = scale.get();
    if (meshRef.current) {
      meshRef.current.position.set(px, py, pz);
      meshRef.current.scale.setScalar(s);
    }
    if (highlightRef.current) {
      highlightRef.current.position.set(px, py, pz);
      highlightRef.current.scale.setScalar(highlightScale.get());
    }
    if (groupRef.current) {
      groupRef.current.position.set(px, py, pz);
    }
  });

  return (
    <>
      <mesh
        ref={meshRef}
        onClick={onClick}
        onPointerOver={() => scale.set(defaultScale * 1.1)}
        onPointerOut={() => scale.set(defaultScale)}
        onPointerDown={() => scale.set(defaultScale * 0.9)}
        onPointerUp={() => scale.set(defaultScale)}
      >
        <sphereGeometry args={[1.0, 32, 32]} />
        <meshStandardMaterial color={getColor(atom.element)} />
      </mesh>

      {selected && (
        <mesh ref={highlightRef}>
          <sphereGeometry args={[1.0, 32, 32]} />
          <meshStandardMaterial color="yellow" transparent opacity={0.3} />
        </mesh>
      )}

      {label && mode === "ball" && (
        <group ref={groupRef}>
          <FacingText position={[0, 0, 0]} text={String(label)} />
        </group>
      )}
    </>
  );
}
