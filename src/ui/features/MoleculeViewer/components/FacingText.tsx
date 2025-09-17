import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";

function RoundedRectShape(width: number, height: number, radius: number) {
  const shape = new THREE.Shape();
  const w = width / 2;
  const h = height / 2;
  shape.moveTo(-w + radius, -h);
  shape.lineTo(w - radius, -h);
  shape.quadraticCurveTo(w, -h, w, -h + radius);
  shape.lineTo(w, h - radius);
  shape.quadraticCurveTo(w, h, w - radius, h);
  shape.lineTo(-w + radius, h);
  shape.quadraticCurveTo(-w, h, -w, h - radius);
  shape.lineTo(-w, -h + radius);
  shape.quadraticCurveTo(-w, -h, -w + radius, -h);
  return shape;
}

export default function FacingText({
  position,
  text,
}: {
  position: [number, number, number];
  text: string;
}) {
  const ref = useRef<THREE.Group>(null);
  const { camera } = useThree();

  const width = text.length * 0.1 + 0.2;
  const height = 0.3;
  const radius = 0.1;

  const shape = useMemo(
    () => RoundedRectShape(width, height, radius),
    [width, height]
  );
  const geometry = useMemo(() => new THREE.ShapeGeometry(shape), [shape]);

  useFrame(() => {
    if (ref.current) {
      ref.current.lookAt(camera.position);
    }
  });

  return (
    <group ref={ref} position={position}>
      <mesh geometry={geometry} renderOrder={998}>
        <meshBasicMaterial
          color="white"
          transparent
          opacity={0.8}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
      <Text
        fontSize={0.18}
        color="black"
        anchorX="center"
        anchorY="middle"
        renderOrder={999}
        material-depthTest={false}
        material-depthWrite={false}
      >
        {text}
      </Text>
    </group>
  );
}
