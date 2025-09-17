import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useEditor } from "../store";
import { COLORS, ALPHA } from "../../../theme/colors";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";

export default function AtomsHoverRings2D() {
  // World-scaling mode: no camera dependency needed
  const { model, hovered } = useEditor();
  const inst = useRef<THREE.InstancedMesh>(null!);
  const mat = useRef<THREE.MeshBasicMaterial>(null!);
  const tmpM = useMemo(() => new THREE.Matrix4(), []);
  const countCap = Math.max(model.atoms.length, 1);
  // Visual ratios w.r.t. baseline bond length L=NOMINAL_BOND_LENGTH (world units)
  const RING_RADIUS_RATIO = 0.26; // outer radius ≈ 0.26 * L (slightly smaller than before)
  const targetOpacity = ALPHA.highlight;
  // Animated state
  const scaleRef = useRef(0); // current scale (world)
  const opacityRef = useRef(0);
  const anim = useRef<{
    mode: "idle" | "in" | "out";
    t: number;
    id: number | null;
    startScale: number;
  }>({ mode: "idle", t: 0, id: null, startScale: 0 });
  const DUR_IN = 0.12; // slightly faster
  const DUR_OUT = 0.12;
  const BACK = 1.25; // stronger back overshoot for bounce
  const easeOutBack = (u: number, s = BACK) => {
    const c1 = s,
      c3 = c1 + 1;
    const x = u - 1;
    return 1 + c3 * x * x * x + c1 * x * x;
  };
  const easeInBack = (u: number, s = BACK) => {
    const c1 = s,
      c3 = c1 + 1;
    return c3 * u * u * u - c1 * u * u;
  };
  const easeOutCubic = (u: number) => 1 - Math.pow(1 - u, 3);
  const easeInCubic = (u: number) => u * u * u;

  // Removed avgBondLength computation, using NOMINAL_BOND_LENGTH directly
  // const avgBondLength = useMemo(() => { ... }, [model.atoms, model.bonds]);

  useEffect(() => {
    if (!inst.current) return;
    const atoms = model.atoms;
    inst.current.count = atoms.length;
    for (let i = 0; i < atoms.length; i++) {
      const a = atoms[i];
      tmpM.makeScale(0, 0, 1).setPosition(a.x, a.y, -0.02);
      inst.current.setMatrixAt(i, tmpM);
    }
    inst.current.instanceMatrix.needsUpdate = true;
  }, [model.atoms, tmpM]);

  // Animate size (with bounce) and fade in/out; ratio to structure (world units)
  useFrame((_, dt) => {
    const m = inst.current;
    if (!m) return;
    const atoms = model.atoms;
    const idNow = hovered.atomId;
    const L = NOMINAL_BOND_LENGTH;
    const targetScale = RING_RADIUS_RATIO * L;

    // Start animations on state change
    if (idNow != null && anim.current.id !== idNow) {
      anim.current = {
        mode: "in",
        t: 0,
        id: idNow,
        startScale: Math.min(scaleRef.current || 0, targetScale),
      };
    } else if (
      idNow == null &&
      anim.current.id != null &&
      anim.current.mode !== "out"
    ) {
      anim.current = {
        mode: "out",
        t: 0,
        id: anim.current.id,
        startScale: scaleRef.current || targetScale,
      };
    }

    // Advance animation
    if (anim.current.mode === "in") {
      anim.current.t += dt;
      const u = Math.min(1, anim.current.t / DUR_IN);
      scaleRef.current = targetScale * easeOutBack(u);
      opacityRef.current = targetOpacity * easeOutCubic(u);
      if (u >= 1) {
        // Stay fully shown while hovered remains
        if (hovered.atomId == null) {
          anim.current.mode = "out";
          anim.current.t = 0;
          anim.current.startScale = scaleRef.current;
        }
      }
    } else if (anim.current.mode === "out") {
      anim.current.t += dt;
      const u = Math.min(1, anim.current.t / DUR_OUT);
      // bounce on out: small upward before settling to 0
      const sNorm = Math.max(0, 1 - easeInBack(u));
      scaleRef.current = anim.current.startScale * sNorm;
      opacityRef.current = targetOpacity * (1 - easeInCubic(u));
      if (u >= 1) {
        anim.current = { mode: "idle", t: 0, id: null, startScale: 0 };
        scaleRef.current = 0;
        opacityRef.current = 0;
      }
    } else {
      // idle
      scaleRef.current = 0;
      opacityRef.current = 0;
      anim.current.id = null;
    }

    // Write transforms: only for active id (in/out), others zero
    for (let i = 0; i < atoms.length; i++) {
      const a = atoms[i];
      const active =
        anim.current.id === a.id &&
        opacityRef.current > 0.01 &&
        scaleRef.current > 0.0001;
      const s = active ? scaleRef.current : 0;
      tmpM.makeScale(s, s, 1).setPosition(a.x, a.y, -0.02);
      m.setMatrixAt(i, tmpM);
    }
    m.instanceMatrix.needsUpdate = true;
    if (mat.current) mat.current.opacity = opacityRef.current;
  });

  return (
    <instancedMesh
      ref={inst}
      key={countCap}
      args={[undefined as any, undefined as any, countCap]}
    >
      <circleGeometry args={[1, 64]} />
      <meshBasicMaterial
        ref={mat}
        color={COLORS.highlight}
        transparent
        opacity={0}
        depthTest={true}
        depthWrite={false}
        toneMapped={false}
      />
    </instancedMesh>
  );
}
