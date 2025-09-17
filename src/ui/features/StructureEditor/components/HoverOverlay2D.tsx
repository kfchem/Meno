import * as THREE from "three";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useEditor } from "../store";
import { COLORS, ALPHA } from "../../../theme/colors";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";

export default function HoverOverlay2D() {
  const { model, hovered, hoverPulse } = useEditor();
  const mesh = useRef<THREE.Mesh>(null!);
  const mat = useRef<THREE.MeshBasicMaterial>(null!);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const wRef = useRef(0);
  const oRef = useRef(0);
  const THICKNESS_RATIO = 0.16;
  const maxOpacity = ALPHA.highlight;
  const DUR_IN = 0.16;
  const DUR_OUT = 0.12;
  const easeOutCubic = (u: number) => 1 - Math.pow(1 - u, 3);
  const easeInCubic = (u: number) => u * u * u;
  const anim = useRef<{
    mode: "idle" | "in" | "out";
    t: number;
    id: number | null;
    startW: number;
    seg: { x1: number; y1: number; x2: number; y2: number } | null;
  }>({ mode: "idle", t: 0, id: null, startW: 0, seg: null });

  // Build a rounded-ends rectangle (capsule when corner = height/2)
  function buildRoundedRect(
    length: number,
    height: number,
    corner: number
  ): THREE.ShapeGeometry {
    const w = Math.max(1e-6, length);
    const h = Math.max(1e-6, height);
    const hw = w * 0.5;
    const hh = h * 0.5;
    const r = Math.min(Math.max(0, corner), hh);
    const s = new THREE.Shape();
    s.moveTo(-hw + r, -hh);
    s.lineTo(hw - r, -hh);
    s.quadraticCurveTo(hw, -hh, hw, -hh + r);
    s.lineTo(hw, hh - r);
    s.quadraticCurveTo(hw, hh, hw - r, hh);
    s.lineTo(-hw + r, hh);
    s.quadraticCurveTo(-hw, hh, -hw, hh - r);
    s.lineTo(-hw, -hh + r);
    s.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
    return new THREE.ShapeGeometry(s, 24);
  }

  useFrame((_, dt) => {
    if (!mesh.current) return;
    const hb = hovered.bondId;
    const b = hb ? model.bonds.find((x) => x.id === hb) : undefined;
    const a1 = b ? model.atoms.find((a) => a.id === b.a) : undefined;
    const a2 = b ? model.atoms.find((a) => a.id === b.b) : undefined;
    const L = NOMINAL_BOND_LENGTH;
    let targetWorld = THICKNESS_RATIO * L;
    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const pulsing =
      hoverPulse.id != null && hb === hoverPulse.id && hoverPulse.until > now;
    const baseTarget = targetWorld;
    let pulseScale = 1.0;
    if (pulsing) pulseScale = 0.75; // start by shrinking clearly

    // Start animation on state changes
    if (hb != null) {
      // Entering or updating hovered bond; restart when pulse nonce changes
      const pulseNonce = hoverPulse.nonce;
      const needRestart =
        anim.current.id !== hb ||
        (pulsing && (anim.current as any)._nonce !== pulseNonce);
      if (needRestart) {
        anim.current = {
          mode: "in",
          t: 0,
          id: hb,
          startW: Math.min(wRef.current || 0, baseTarget * pulseScale),
          seg:
            a1 && a2
              ? { x1: a1.x, y1: a1.y, x2: a2.x, y2: a2.y }
              : anim.current.seg,
        };
        (anim.current as any)._nonce = pulseNonce;
      } else if (a1 && a2) {
        // update last segment while hovered
        anim.current.seg = { x1: a1.x, y1: a1.y, x2: a2.x, y2: a2.y };
      }
    } else if (anim.current.id != null && anim.current.mode !== "out") {
      // start out animation
      anim.current = {
        mode: "out",
        t: 0,
        id: anim.current.id,
        startW: wRef.current || targetWorld,
        seg: anim.current.seg,
      };
    }

    // Animation step
    if (anim.current.mode === "in") {
      anim.current.t += dt;
      const u = Math.min(1, anim.current.t / DUR_IN);
      // Two phases: 0..0.5 shrink->original, 0.5..1 overshoot->land
      const t1 = 0.5;
      if (u < t1) {
        const k = u / t1; // 0..1
        const s = 0.75 + (1.0 - 0.75) * easeOutCubic(k);
        wRef.current = baseTarget * s;
      } else {
        const k = (u - t1) / (1 - t1);
        const s = 1.0 + (1.35 - 1.0) * (1 - Math.pow(1 - k, 2)); // strong overshoot
        wRef.current = baseTarget * s;
      }
      const baseO = maxOpacity * easeOutCubic(u);
      oRef.current = Math.min(1, baseO * (pulsing ? 1.35 : 1.0));
    } else if (anim.current.mode === "out") {
      anim.current.t += dt;
      const u = Math.min(1, anim.current.t / DUR_OUT);
      const sNorm = Math.max(0, 1 - easeInCubic(u));
      wRef.current = (anim.current.startW || targetWorld) * sNorm;
      oRef.current = maxOpacity * (1 - easeInCubic(u));
      if (u >= 1) {
        anim.current = { mode: "idle", t: 0, id: null, startW: 0, seg: null };
      }
    } else {
      wRef.current = 0;
      oRef.current = 0;
    }

    // Choose endpoints
    const seg =
      a1 && a2 ? { x1: a1.x, y1: a1.y, x2: a2.x, y2: a2.y } : anim.current.seg;
    if (!seg || oRef.current < 0.01 || wRef.current < 1e-5) {
      mesh.current.visible = false;
      return;
    }
    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;
    const len = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);
    q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), ang);
    // Slightly extend beyond endpoints
    const EXT_RATIO = 0.04; // extend 5% of L on each side
    const ext = EXT_RATIO * L;
    const cx = (seg.x1 + seg.x2) / 2;
    const cy = (seg.y1 + seg.y2) / 2;
    // Render behind bonds/joins (negative z) as originally designed
    mesh.current.position.set(cx, cy, -0.02);
    mesh.current.quaternion.copy(q);
    // Rebuild geometry per-frame to keep end-caps circular
    const cornerParam = 1.0; // 1 => fully round ends (capsule), 0 => sharp corners
    const desiredCorner = wRef.current * 0.5 * cornerParam;
    const newGeom = buildRoundedRect(
      len + 2 * ext,
      wRef.current,
      desiredCorner
    );
    const old = mesh.current.geometry as THREE.BufferGeometry | undefined;
    mesh.current.geometry = newGeom;
    old?.dispose?.();
    mesh.current.scale.set(1, 1, 1);
    mesh.current.visible = true;
    if (mat.current) mat.current.opacity = oRef.current;
  });

  return (
    <mesh ref={mesh} visible={false}>
      <meshBasicMaterial
        ref={mat}
        color={COLORS.highlight}
        transparent
        opacity={0}
        // Keep depth testing enabled so highlight stays behind bonds
        depthTest={true}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}
