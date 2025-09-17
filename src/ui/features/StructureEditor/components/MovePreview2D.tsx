import * as THREE from "three";
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEditor } from "../store";
import { COLORS, ALPHA } from "../../../theme/colors";
import { ACS_RATIOS, NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";

// Thin highlights from each neighbor atom of the moving atom to the current cursor,
// mirroring the thin preview used in ExtendPreview2D.
export default function MovePreview2D() {
  const { model, moveDrag } = useEditor();
  const { camera } = useThree();
  const inst = useRef<THREE.InstancedMesh>(null!);
  const cursorDot = useRef<THREE.Mesh>(null!);
  const cursorDotOutline = useRef<THREE.Mesh>(null!);
  const tmpM = useMemo(() => new THREE.Matrix4(), []);
  const tmpQ = useMemo(() => new THREE.Quaternion(), []);
  const countCap = Math.max(model.bonds.length, 1);

  useFrame(() => {
    const m = inst.current;
    if (!cursorDot.current) return;
    if (!m) return;
    // Hide by default
    m.count = 0;
    m.visible = false;
    cursorDot.current.visible = false;
    if (cursorDotOutline.current) cursorDotOutline.current.visible = false;
    if (!moveDrag.active || moveDrag.atomId == null || !moveDrag.pointer) {
      m.instanceMatrix.needsUpdate = true;
      return;
    }
    const moving = model.atoms.find((x) => x.id === moveDrag.atomId);
    const ptr = moveDrag.pointer;
    if (!moving || !ptr) {
      m.instanceMatrix.needsUpdate = true;
      return;
    }
    // collect neighbor atoms of the moving atom
    const nbrIds: number[] = [];
    for (const b of model.bonds) {
      if (b.a === moving.id) nbrIds.push(b.b);
      else if (b.b === moving.id) nbrIds.push(b.a);
    }
    const deg = nbrIds.length;
    const L = NOMINAL_BOND_LENGTH;
    const zoom = (camera as any)?.zoom || 1;
    const lineWidthWorld = L * ACS_RATIOS.lineWidth;
    const thinW = Math.max(
      lineWidthWorld,
      (ACS_RATIOS.minLinePx || 1) / Math.max(zoom, 1e-6)
    );
    let idx = 0;
    // no instanced dots; only a single cursor dot rendered separately
    // adjust opacity to mitigate overlap darkening
    const n = Math.max(1, nbrIds.length);
    // Match highlight opacity token, scale down per-line to avoid over-darkening when multiple lines overlap
    const baseOpacity = ALPHA.highlight;
    const op = baseOpacity / Math.sqrt(n); // keep perceived brightness roughly stable
    const mat = m.material as THREE.MeshBasicMaterial | undefined;
    if (mat) mat.opacity = Math.max(0.18, Math.min(baseOpacity, op));
    for (const nid of nbrIds) {
      const nAtom = model.atoms.find((a) => a.id === nid);
      if (!nAtom) continue;
      const dx = ptr.x - nAtom.x;
      const dy = ptr.y - nAtom.y;
      const len = Math.hypot(dx, dy);
      if (!(len > 1e-6)) continue;
      tmpQ.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(dy, dx));
      // lines behind bonds (bonds are at z=0)
      tmpM.compose(
        new THREE.Vector3(nAtom.x + dx * 0.5, nAtom.y + dy * 0.5, -0.02),
        tmpQ,
        new THREE.Vector3(Math.max(len, 1e-6), thinW, 1)
      );
      m.setMatrixAt(idx++, tmpM);
      // cursor joint dot for moving atom (only when deg >= 2)
      if (deg >= 2 && cursorDot.current) {
        const rWorld = thinW * 0.5;
        cursorDot.current.position.set(ptr.x, ptr.y, -0.035);
        cursorDot.current.scale.set(rWorld, rWorld, 1);
        cursorDot.current.visible = true;
        if (cursorDotOutline.current) {
          cursorDotOutline.current.visible = false;
        }
      }
    }
    m.count = idx;
    m.instanceMatrix.needsUpdate = true;
    m.visible = idx > 0;
  });

  return (
    <group>
      <instancedMesh
        ref={inst}
        key={"mv-lines-" + countCap}
        args={[undefined as any, undefined as any, countCap]}
        visible={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          color={COLORS.highlight}
          transparent
          opacity={ALPHA.highlight}
          depthWrite={false}
          depthTest={true}
          toneMapped={false}
        />
      </instancedMesh>
      <mesh ref={cursorDot} visible={false}>
        <circleGeometry args={[1, 32]} />
        <meshBasicMaterial
          color={COLORS.highlight}
          transparent
          opacity={ALPHA.highlight}
          depthWrite={false}
          depthTest={true}
          toneMapped={false}
        />
      </mesh>
      {/* outline disabled: we match highlight color/opacity and draw behind bonds */}
      <mesh ref={cursorDotOutline} visible={false}>
        <ringGeometry args={[0.9, 1, 48]} />
        <meshBasicMaterial
          color={COLORS.highlight}
          transparent
          opacity={ALPHA.highlight}
          depthWrite={false}
          depthTest={true}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
