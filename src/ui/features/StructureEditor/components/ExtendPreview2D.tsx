import * as THREE from "three";
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEditor } from "../store";
import { COLORS, ALPHA } from "../../../theme/colors";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { useDrawnLayout } from "./drawnLayoutContext";

// Preview for drawing a new bond out of an atom.
// - Works out where the new atom goes, springing to the snapped angle, and
//   publishes that as the gesture's preview: the drawing itself (DrawnLayout)
//   lays out the new bond and atom there, joined to the rest as they will be
//   once dropped.
// - Draws only what is not the drawing: a thin highlight line to the pointer.
export default function ExtendPreview2D() {
  const { model, extend } = useEditor();
  const setExtendPreview = useEditor((s) => s.setExtendPreview);
  const { camera, invalidate } = useThree();
  // The drawing's own line, in world units.
  const lineWidthWorld = useDrawnLayout().opts.lineWidthPx;
  const thin = useRef<THREE.Mesh>(null!);
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
    // Angle smoothing runs while the gesture is active (on-demand rendering).
    if (extend.active) invalidate();
    const base =
      extend.atomId != null
        ? model.atoms.find((a) => a.id === extend.atomId)
        : undefined;
    const ptr = extend.pointer;
    if (!extend.active || !base || !thin.current || !ptr) {
      if (thin.current) thin.current.visible = false;
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
    const thickWorld = Math.max(lineWidthWorld, 1 / Math.max(zoom, 1e-6));

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

    // Where the new atom goes this frame
    let end = { x: ptr.x, y: ptr.y };
    // Free mode (with optional one-shot transition)
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
        end = {
          x: base.x + Math.cos(angBlend) * lenBlend,
          y: base.y + Math.sin(angBlend) * lenBlend,
        };
        if (transRef.current.t >= 1) {
          transRef.current.active = false;
        }
      } else {
        // steady free (no snap, no bounce)
        end = { x: ptr.x, y: ptr.y };
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

      // constant length L
      const curAng = curAngRef.current;
      end = {
        x: base.x + L * Math.cos(curAng),
        y: base.y + L * Math.sin(curAng),
      };
      lastActive.current = true;
      lastAtomId.current = base.id;
    }

    // The drawing lays the new bond out there.
    if (Number.isFinite(end.x) && Number.isFinite(end.y)) {
      setExtendPreview(end.x, end.y);
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
    </group>
  );
}
