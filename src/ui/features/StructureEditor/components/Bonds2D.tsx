import * as THREE from "three";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEditor } from "../store";
import {
  layoutMolecule,
  type LayoutOptions,
} from "../../../../lib/chem/layout2d";
import { acsWorldOptions, NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";

export function Bonds2D({ options }: { options?: Partial<LayoutOptions> }) {
  const { camera } = useThree();
  const ortho = camera as THREE.OrthographicCamera;
  const [zoomVal, setZoomVal] = useState<number>(ortho.zoom || 1);
  useFrame(() => {
    const z = (camera as THREE.OrthographicCamera).zoom || 1;
    if (z !== zoomVal) setZoomVal(z);
  });
  const { model, aromaticEnabled, aromaticRings, moveDrag } = useEditor();
  const inst = useRef<THREE.InstancedMesh>(null!);
  const tmpM = useMemo(() => new THREE.Matrix4(), []);
  const tmpQ = useMemo(() => new THREE.Quaternion(), []);
  // Capacity: allow up to 3 segments per bond (triple-bond worst case)
  const countCap = Math.max(model.bonds.length * 3, 1);

  useEffect(() => {
    const m = inst.current;
    if (!m) return;
    // Use live camera zoom to avoid a one-frame lag right after fit/replace
    const zNow = (camera as THREE.OrthographicCamera).zoom || 1;
    const atomsL = model.atoms.map((a) => ({
      id: a.id,
      x: a.x,
      y: a.y,
      el: a.el,
    }));
    const idToIndex = new Map<number, number>();
    for (let i = 0; i < model.atoms.length; i++)
      idToIndex.set(model.atoms[i].id, i);
    // If moving, hide only bonds attached to the moving atom from the base rendering.
    const movingId = moveDrag.active ? moveDrag.atomId : null;
    const srcBonds =
      movingId != null
        ? model.bonds.filter((b) => b.a !== movingId && b.b !== movingId)
        : model.bonds;
    const bondsL = srcBonds
      .map((b) => {
        const i1 = idToIndex.get(b.a);
        const i2 = idToIndex.get(b.b);
        if (i1 == null || i2 == null) return null;
        return {
          a1: i1,
          a2: i2,
          order: b.order as 1 | 2 | 3,
          stereo: (b.stereo ?? "none") as "up" | "down" | "wavy" | "none",
          doubleMode: (b as any).doubleMode ?? "auto",
          stereoOrient: (b as any).stereoOrient ?? ("principle" as const),
        };
      })
      .filter(Boolean) as any;
    const keys = Object.keys(aromaticRings || {}).filter(
      (k) => aromaticRings[k]
    );
    const aromaticCircle =
      keys.length > 0
        ? { enabled: new Set(keys) }
        : aromaticEnabled
        ? true
        : false;
    const opts: LayoutOptions = acsWorldOptions(atomsL, bondsL, {
      ...options,
      units: "world",
      // Guarantee a minimum on-screen thickness from layout side to avoid 0px widths at extreme zoom states
      minLinePx: 1.25,
      aromaticCircle,
    });
    // Use live zoom for layout as well to avoid a lag between layout widthPx and thickness conversion
    const layout = layoutMolecule(atomsL, bondsL, opts, zNow);
    const segs = layout.lines;
    m.count = segs.length;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      const dx = s.x2 - s.x1,
        dy = s.y2 - s.y1;
      const len = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      // Compute thickness using the latest camera zoom, and clamp to a small world minimum
      const thickWorldRaw = s.widthPx / Math.max(zNow, 1e-6);
      const MIN_WORLD_THICK = Math.max(1e-3, NOMINAL_BOND_LENGTH * 0.02); // ~2% of nominal bond length
      const thickWorld = Math.max(thickWorldRaw, MIN_WORLD_THICK);
      tmpQ.setFromAxisAngle(new THREE.Vector3(0, 0, 1), ang);
      tmpM.compose(
        new THREE.Vector3((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, 0),
        tmpQ,
        new THREE.Vector3(len, thickWorld, 1)
      );
      m.setMatrixAt(i, tmpM);
    }
    m.instanceMatrix.needsUpdate = true;
  }, [
    model.atoms,
    model.bonds,
    options,
    zoomVal,
    aromaticEnabled,
    aromaticRings,
    moveDrag.active,
    moveDrag.atomId,
  ]);

  return (
    <instancedMesh
      ref={inst}
      key={countCap}
      args={[undefined as any, undefined as any, countCap]}
      frustumCulled={false}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        color="black"
        vertexColors={false}
        toneMapped={false}
      />
    </instancedMesh>
  );
}
