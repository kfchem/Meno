import { useRef, useEffect } from "react";
import { useSpring } from "motion/react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

type Vec3 = { x: number; y: number; z: number };

export default function MotionBond({ start, end }: { start: Vec3; end: Vec3 }) {
  const ref = useRef<THREE.Mesh>(null);

  const springStart = {
    x: useSpring(start.x, { stiffness: 100, damping: 20, mass: 0.5 }),
    y: useSpring(start.y, { stiffness: 100, damping: 20, mass: 0.5 }),
    z: useSpring(start.z, { stiffness: 100, damping: 20, mass: 0.5 }),
  };

  const springEnd = {
    x: useSpring(end.x, { stiffness: 100, damping: 20, mass: 0.5 }),
    y: useSpring(end.y, { stiffness: 100, damping: 20, mass: 0.5 }),
    z: useSpring(end.z, { stiffness: 100, damping: 20, mass: 0.5 }),
  };

  useEffect(() => {
    springStart.x.set(start.x);
    springStart.y.set(start.y);
    springStart.z.set(start.z);
    springEnd.x.set(end.x);
    springEnd.y.set(end.y);
    springEnd.z.set(end.z);
  }, [
    start.x,
    start.y,
    start.z,
    end.x,
    end.y,
    end.z,
    springStart.x,
    springStart.y,
    springStart.z,
    springEnd.x,
    springEnd.y,
    springEnd.z,
  ]);

  useFrame(() => {
    if (ref.current) {
      const a = new THREE.Vector3(
        springStart.x.get(),
        springStart.y.get(),
        springStart.z.get()
      );
      const b = new THREE.Vector3(
        springEnd.x.get(),
        springEnd.y.get(),
        springEnd.z.get()
      );

      const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
      const dir = new THREE.Vector3().subVectors(b, a).normalize();
      const len = a.distanceTo(b);
      const q = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        dir
      );

      ref.current.position.copy(mid);
      ref.current.setRotationFromQuaternion(q);
      ref.current.scale.set(1, len, 1);
    }
  });

  return (
    <mesh ref={ref}>
      <cylinderGeometry args={[0.1, 0.1, 1, 8]} />
      <meshStandardMaterial color="black" />
    </mesh>
  );
}
