import { useDrawnLayout } from "./drawnLayoutContext";

/**
 * The round caps where bonds meet and where they end, from the shared layout.
 * An atom being dragged is laid out where it is being dragged to, so its caps
 * go with it.
 */
export default function JoinCaps2D() {
  const { layout, opts } = useDrawnLayout();
  return (
    <group>
      {layout.fills.map((c, i) => (
        <mesh key={`cap-${i}`} position={[c.c.x, c.c.y, 0]} renderOrder={9}>
          <circleGeometry args={[c.r, 24]} />
          <meshBasicMaterial
            color={opts.bondColor ?? "black"}
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
