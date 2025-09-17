import * as THREE from "three";
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEditor } from "../store";
import { COLORS, ALPHA } from "../../../theme/colors";
import { ACS_RATIOS, NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";

export default function ExtendPreview2D() {
  const { model, extend } = useEditor();
  const { camera } = useThree();
  const thin = useRef<THREE.Mesh>(null!);
  const thick = useRef<THREE.Mesh>(null!);
  const dotA = useRef<THREE.Mesh>(null!);
  const dotAOutline = useRef<THREE.Mesh>(null!);
  const dotB = useRef<THREE.Mesh>(null!);
  const q = useMemo(() => new THREE.Quaternion(), []);
  // Animated orientation (angle-only) with spring-bounce; length stays constant (L)
  const curAngRef = useRef(0);
  const angVelRef = useRef(0);
  const lastActive = useRef(false);
  const lastAtomId = useRef<number | null>(null);
  const lastModeRef = useRef<"snap" | "free">("snap");
  const transRef = useRef<{
    active: boolean;
    t: number;
    dur: number;
    startAng: number;
    startLen: number;
  }>({ active: false, t: 0, dur: 0.18, startAng: 0, startLen: 0 });

  useFrame((_, dtRaw) => {
    const base =
      extend.atomId != null
        ? model.atoms.find((a) => a.id === extend.atomId)
        : undefined;
    const ptr = extend.pointer;
    if (!extend.active || !base || !thin.current || !thick.current || !ptr) {
      if (thin.current) thin.current.visible = false;
      if (thick.current) thick.current.visible = false;
      if (dotA.current) dotA.current.visible = false;
      if (dotB.current) dotB.current.visible = false;
      angVelRef.current = 0;
      lastActive.current = false;
      transRef.current.active = false;
      transRef.current.t = 0;
      return;
    }
    const justActivated = !lastActive.current || lastAtomId.current !== base.id;
    const L = NOMINAL_BOND_LENGTH;
    const dx = ptr.x - base.x;
    const dy = ptr.y - base.y;
    const len = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);
    const step = Math.PI / 6; // 30°
    // Snap angle strictly to nearest 30° multiple (no neighbor-based selection here)
    const snapAng = Math.round(ang / step) * step;
    const zoom = (camera as any)?.zoom || 1;
    // Match Bonds2D thickness exactly: max(lineWidthWorld, minPx/zoom)
    const lineWidthWorld = L * ACS_RATIOS.lineWidth;
    const thickWorld = Math.max(
      lineWidthWorld,
      (ACS_RATIOS.minLinePx || 1) / Math.max(zoom, 1e-6)
    );

    // thin line (base to pointer) — rectangular, not rounded
    // place behind bonds (bonds at z=0)
    const thinW = thickWorld; // same thickness as real bond
    q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), ang);
    // Place thin highlight clearly behind the thick preview (thick is at z=-0.03)
    thin.current.position.set(base.x + dx * 0.5, base.y + dy * 0.5, -0.04);
    thin.current.quaternion.copy(q);
    thin.current.scale.set(Math.max(len, 1e-6), thinW, 1);
    thin.current.visible = true;

    // Detect snap->free switch and kick transition
    if (
      extend.mode === "free" &&
      lastModeRef.current === "snap" &&
      !transRef.current.active
    ) {
      transRef.current.active = true;
      transRef.current.t = 0;
      transRef.current.startAng = curAngRef.current;
      transRef.current.startLen = L;
    }

    // Free mode rendering (with optional one-shot transition)
    if (extend.mode === "free") {
      const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
      if (transRef.current.active) {
        const dt = Math.min(Math.max(dtRaw || 0.016, 0.001), 0.05);
        transRef.current.t = Math.min(
          1,
          transRef.current.t + dt / Math.max(1e-3, transRef.current.dur)
        );
        const s = easeOutCubic(transRef.current.t);
        // shortest angle blend
        const wrapDelta = (from: number, to: number) => {
          let d = to - from;
          d = ((d + Math.PI) % (2 * Math.PI)) - Math.PI;
          return d;
        };
        const angBlend =
          transRef.current.startAng +
          wrapDelta(transRef.current.startAng, ang) * s;
        const lenBlend =
          transRef.current.startLen + (len - transRef.current.startLen) * s;
        q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), angBlend);
        const bx = Math.cos(angBlend) * (lenBlend * 0.5);
        const by = Math.sin(angBlend) * (lenBlend * 0.5);
        thick.current.position.set(base.x + bx, base.y + by, -0.03);
        thick.current.quaternion.copy(q);
        thick.current.scale.set(Math.max(lenBlend, 1e-6), thickWorld, 1);
        thick.current.visible = true;
        if (transRef.current.t >= 1) {
          transRef.current.active = false;
        }
      } else {
        // steady free (no snap, no bounce)
        q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), ang);
        thick.current.position.set(base.x + dx * 0.5, base.y + dy * 0.5, -0.03);
        thick.current.quaternion.copy(q);
        thick.current.scale.set(Math.max(len, 1e-6), thickWorld, 1);
        thick.current.visible = true;
      }
      lastActive.current = true;
      lastAtomId.current = base.id;
      // keep spring state benign while free
      curAngRef.current = ang;
      angVelRef.current = 0;
    } else {
      // Angle-only spring (length fixed: L)
      const dt = Math.min(Math.max(dtRaw || 0.016, 0.001), 0.05);
      // Initialize orientation on first activation or atom switch
      if (justActivated) {
        curAngRef.current = snapAng;
        angVelRef.current = 0;
      }
      // Snappier with minimal bounce
      const k = 800; // stiffness (higher = faster response)
      const zeta = 0.5; // damping ratio (<1 => slight bounce)
      const c = 2 * Math.sqrt(k) * zeta;
      // shortest signed angle delta in [-pi, pi]
      const wrapPi = (a: number) => {
        const t = (a + Math.PI) % (2 * Math.PI);
        return t < 0 ? t + 2 * Math.PI - Math.PI : t - Math.PI;
      };
      const err = wrapPi(curAngRef.current - snapAng);
      const angAcc = -k * err - c * angVelRef.current;
      angVelRef.current += angAcc * dt;
      curAngRef.current += angVelRef.current * dt;

      // Apply transform with constant length L
      const curAng = curAngRef.current;
      const nx = Math.cos(curAng),
        ny = Math.sin(curAng);
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), curAng);
      thick.current.position.set(
        base.x + L * nx * 0.5,
        base.y + L * ny * 0.5,
        -0.03
      );
      thick.current.quaternion.copy(q);
      thick.current.scale.set(L, thickWorld, 1);
      thick.current.visible = true;
      lastActive.current = true;
      lastAtomId.current = base.id;
    }

    // joint dot at the base side (match half thickness as radius)
    const rWorld = thickWorld * 0.5;
    if (dotA.current) {
      // Place base joint dot behind bonds and match highlight style
      dotA.current.position.set(base.x, base.y, -0.035);
      dotA.current.scale.set(rWorld, rWorld, 1);
      dotA.current.visible = true;
      if (dotAOutline.current) {
        dotAOutline.current.visible = false;
      }
    }
    // hide far-end dot to avoid confusion
    if (dotB.current) {
      dotB.current.visible = false;
    }
    // remember mode for next frame
    lastModeRef.current = extend.mode;
  });

  return (
    <group>
      <mesh ref={thin} visible={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          color={COLORS.highlight}
          transparent
          opacity={ALPHA.highlight}
          depthWrite={false}
          depthTest={true}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={thick} visible={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          color={COLORS.bond}
          transparent={false}
          toneMapped={false}
        />
      </mesh>
      {/* joint dots */}
      <mesh ref={dotA} visible={false}>
        <circleGeometry args={[1, 32]} />
        <meshBasicMaterial
          color={COLORS.bond}
          transparent={false}
          toneMapped={false}
          depthTest={true}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={dotAOutline} visible={false}>
        <ringGeometry args={[0.9, 1, 48]} />
        <meshBasicMaterial
          color={COLORS.highlight}
          transparent
          opacity={ALPHA.highlight}
          depthTest={true}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={dotB} visible={false}>
        <circleGeometry args={[1, 32]} />
        <meshBasicMaterial
          color={COLORS.highlight}
          transparent
          opacity={0.3}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
