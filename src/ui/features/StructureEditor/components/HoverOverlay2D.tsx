import * as THREE from "three";
import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEditor } from "../store";
import { COLORS, ALPHA } from "../../../theme/colors";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { lineHalfOf, type BondReach } from "../../../../lib/chem/layout2d";
import { useDrawnLayout } from "./drawnLayoutContext";
import { bandAround } from "./hoverBand";

/** The highlight's width once it has come in, over THICKNESS_RATIO's. */
const SETTLED = 1.35;

export default function HoverOverlay2D() {
  const { model, hovered, hoverPulse } = useEditor();
  const drawn = useDrawnLayout();
  const invalidate = useThree((s) => s.invalidate);
  const mesh = useRef<THREE.Mesh>(null!);
  const mat = useRef<THREE.MeshBasicMaterial>(null!);
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

  useFrame((_, dt) => {
    if (!mesh.current) return;
    const hb = hovered.bondId;
    const b = hb ? model.bonds.find((x) => x.id === hb) : undefined;
    const a1 = b ? model.atoms.find((a) => a.id === b.a) : undefined;
    const a2 = b ? model.atoms.find((a) => a.id === b.b) : undefined;
    const L = NOMINAL_BOND_LENGTH;
    const targetWorld = THICKNESS_RATIO * L;
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
        const s = 1.0 + (SETTLED - 1.0) * (1 - Math.pow(1 - k, 2)); // strong overshoot
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
    // How far the bond's drawing reaches off its line at each end, as the
    // drawing measures it: the band follows that, so neither a wedge's broad
    // end nor a double bond's second line stands out past it, and it can sit
    // behind the drawing all the same.
    const bondId = hb ?? anim.current.id;
    const bond = bondId != null ? model.bonds.find((x) => x.id === bondId) : undefined;
    const lineHalf = lineHalfOf(drawn.opts, drawn.zoom);
    let reach: BondReach = { left1: lineHalf, right1: lineHalf, left2: lineHalf, right2: lineHalf };
    if (bond) {
      const i1 = drawn.atoms.findIndex((a) => a.id === bond.a);
      const i2 = drawn.atoms.findIndex((a) => a.id === bond.b);
      const k = drawn.bonds.findIndex((b) => b.a1 === i1 && b.a2 === i2);
      if (k >= 0 && drawn.layout.reach[k]) reach = drawn.layout.reach[k];
    }
    // the band beyond the drawing: what a plain bond's band leaves either side
    // of its line once settled
    const settledHalf = (targetWorld * SETTLED) / 2;
    const margin = Math.max(0, settledHalf - lineHalf);
    // Slightly extend beyond endpoints
    const EXT_RATIO = 0.04; // extend 5% of L on each side
    const ext = EXT_RATIO * L;
    const outline = bandAround(
      { x: seg.x1, y: seg.y1 },
      { x: seg.x2, y: seg.y2 },
      reach,
      margin,
      wRef.current / 2,
      ext,
      wRef.current / (targetWorld * SETTLED),
    );
    // Behind the drawing: depth-tested behind its lines, and drawn before the
    // shapes and caps that draw over it (Wedges2D, JoinCaps2D)
    mesh.current.position.set(0, 0, -0.02);
    mesh.current.quaternion.identity();
    const newGeom = new THREE.ShapeGeometry(
      new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, p.y))),
    );
    const old = mesh.current.geometry as THREE.BufferGeometry | undefined;
    mesh.current.geometry = newGeom;
    old?.dispose?.();
    mesh.current.visible = true;
    if (mat.current) mat.current.opacity = oRef.current;
    // Keep the highlight animating under on-demand rendering.
    if (anim.current.mode !== "idle") invalidate();
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
