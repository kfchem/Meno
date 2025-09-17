import React from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { NOMINAL_BOND_LENGTH, ACS_RATIOS } from "../../../../lib/chem/acs";

export default function ReactionArrow2D({
  x1,
  y1,
  x2,
  y2,
  color = "black",
  z = 0,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color?: string;
  z?: number;
}) {
  const ref = React.useRef<THREE.Mesh | null>(null);

  useFrame(() => {
    if (!ref.current) return;
  });

  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const angle = Math.atan2(dy, dx);

  const shaftWidth = Math.max(1e-3, NOMINAL_BOND_LENGTH * ACS_RATIOS.lineWidth);
  const headLen = Math.min(len * 0.25, NOMINAL_BOND_LENGTH * 0.8);
  const headWidth = shaftWidth * 6;

  return (
    <group position={[x1, y1, z]} rotation={[0, 0, angle]}>
      <mesh position={[Math.max((len - headLen) / 2, 0), 0, 0]}>
        <boxGeometry args={[Math.max(len - headLen, 0), shaftWidth, 0.01]} />
        <meshBasicMaterial
          color={color}
          toneMapped={false}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[len - headLen, 0, 0.01]}>
        <shapeGeometry
          args={[
            (() => {
              const s = new THREE.Shape();
              const hw = headWidth / 2;
              const hl = headLen;
              s.moveTo(0, -hw);
              s.lineTo(0, hw);
              s.lineTo(hl, 0);
              s.closePath();
              return s;
            })(),
          ]}
        />
        <meshBasicMaterial
          color={color}
          toneMapped={false}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
