import * as THREE from "three";
import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEditor } from "../store";
import { COLORS, ALPHA } from "../../../theme/colors";
import {
  ACS_RATIOS,
  NOMINAL_BOND_LENGTH,
} from "../../../../lib/chem/acs";
import { computeMoveSnap } from "../utils/moveSnap";

// Preview for moving an atom without mutating coordinates during drag.
// - Works out where the atom snaps to, springing towards it, and publishes
//   that as the drag's preview: the drawing itself (DrawnLayout) lays the
//   atom out there, bonds, wedges, joins and label alike, so a drag is drawn
//   exactly as the drop will be.
// - Draws only what is not the drawing: thin highlight lines from the
//   neighbours to the pointer, and a dot at the pointer.
export default function MovePreview2D() {
  const { model, moveDrag } = useEditor();
  const setMoveDragPreview = useEditor((s) => s.setMoveDragPreview);
  const { camera, invalidate } = useThree();
  const thinInst = useRef<THREE.InstancedMesh>(null!);
  const cursorDot = useRef<THREE.Mesh>(null!);
  const cursorDotOutline = useRef<THREE.Mesh>(null!);
  // one thin line per neighbour of the dragged atom
  const countCap = Math.max(model.bonds.length, 1);
  // temp transforms
  const tmpM = useRef(new THREE.Matrix4());
  const tmpQ = useRef(new THREE.Quaternion());

  // spring state for snapped angle
  const curAngRef = useRef(0);
  const angVelRef = useRef(0);
  const lastActiveRef = useRef(false);
  const lastAtomIdRef = useRef<number | null>(null);
  // For deg>=2 candidate-based snapping
  const centerRef = useRef<{ x: number; y: number } | null>(null);
  const radiusRef = useRef(NOMINAL_BOND_LENGTH);
  const radVelRef = useRef(0);
  const targetAngRef = useRef(0);
  const targetRRef = useRef(NOMINAL_BOND_LENGTH);
  // Free-mode blend state
  const wasFreeRef = useRef(false);
  const freeStartRef = useRef<{ x: number; y: number } | null>(null);
  const freeT0Ref = useRef(0);
  const FREE_DUR_MS = 180;

  useFrame((_, dtRaw) => {
    // Preview follows the pointer while dragging (on-demand rendering).
    if (moveDrag.active) invalidate();
    const mThin = thinInst.current;
    if (!mThin || !cursorDot.current) return;

    // hide by default
    mThin.count = 0;
    mThin.visible = false;
    cursorDot.current.visible = false;
    if (cursorDotOutline.current) cursorDotOutline.current.visible = false;

    if (!moveDrag.active || moveDrag.atomId == null || !moveDrag.pointer) {
      mThin.instanceMatrix.needsUpdate = true;
      angVelRef.current = 0;
      lastActiveRef.current = false;
      return;
    }

    const moving = model.atoms.find((x) => x.id === moveDrag.atomId);
    const ptr = moveDrag.pointer;
    if (!moving || !ptr) {
      mThin.instanceMatrix.needsUpdate = true;
      return;
    }

    // neighbor ids of moving atom
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

    // opacity for thin highlights; reduce overlap darkening
    const baseOpacity = ALPHA.highlight;
    const op = baseOpacity / Math.sqrt(Math.max(1, deg));
    const matThin = mThin.material as THREE.MeshBasicMaterial | undefined;
    if (matThin) matThin.opacity = Math.max(0.18, Math.min(baseOpacity, op));

    // determine snapping for deg cases
    const justActivated =
      !lastActiveRef.current || lastAtomIdRef.current !== moving.id;
    let pxSnap = ptr.x,
      pySnap = ptr.y;
    const isFree = (moveDrag as any).mode === "free";
    if (deg === 1) {
      // simple: center at neighbor, angle snap + angle spring, fixed radius L
      const nb = model.atoms.find((a) => a.id === nbrIds[0]);
      if (nb) {
        if (justActivated) {
          curAngRef.current = Math.atan2(ptr.y - nb.y, ptr.x - nb.x);
          angVelRef.current = 0;
        }
        const step = Math.PI / 6;
        const ang = Math.atan2(ptr.y - nb.y, ptr.x - nb.x);
        const snapAng = Math.round(ang / step) * step;
        const dt = Math.min(Math.max(dtRaw || 0.016, 0.001), 0.05);
        const k = 800;
        const zeta = 0.5;
        const c = 2 * Math.sqrt(k) * zeta;
        const wrapPi = (a: number) => {
          const t = (a + Math.PI) % (2 * Math.PI);
          return t < 0 ? t + 2 * Math.PI - Math.PI : t - Math.PI;
        };
        const err = wrapPi(curAngRef.current - snapAng);
        const angAcc = -k * err - c * angVelRef.current;
        angVelRef.current += angAcc * dt;
        curAngRef.current += angVelRef.current * dt;
        pxSnap = nb.x + L * Math.cos(curAngRef.current);
        pySnap = nb.y + L * Math.sin(curAngRef.current);
        centerRef.current = { x: nb.x, y: nb.y };
        radiusRef.current = L;
        targetRRef.current = L;
        radVelRef.current = 0;
        targetAngRef.current = curAngRef.current;
      }
    } else if (deg >= 2) {
      // unified snapping: use shared computeMoveSnap to pick target and spring toward it
      const snap = computeMoveSnap(model as any, moving.id, {
        x: ptr.x,
        y: ptr.y,
      });
      if (justActivated) {
        angVelRef.current = 0;
        radVelRef.current = 0;
        if (snap.center) {
          centerRef.current = { x: snap.center.x, y: snap.center.y };
          curAngRef.current = Math.atan2(
            snap.py - snap.center.y,
            snap.px - snap.center.x
          );
          targetAngRef.current = curAngRef.current;
          radiusRef.current = L;
          targetRRef.current = L;
        } else {
          centerRef.current = null;
        }
      } else if (snap.center) {
        const C = snap.center;
        // maintain continuity when center changes
        let worldX = ptr.x,
          worldY = ptr.y;
        if (centerRef.current) {
          const rnow = radiusRef.current > 0 ? radiusRef.current : L;
          worldX = centerRef.current.x + rnow * Math.cos(curAngRef.current);
          worldY = centerRef.current.y + rnow * Math.sin(curAngRef.current);
        }
        centerRef.current = { x: C.x, y: C.y };
        const currR = Math.hypot(worldX - C.x, worldY - C.y);
        radiusRef.current = currR > 1e-12 ? currR : L;
        targetRRef.current = L;
        radVelRef.current *= 0.5;
        curAngRef.current = Math.atan2(
          worldX - C.x === 0 && worldY - C.y === 0 ? 0 : worldY - C.y,
          worldX - C.x
        );
        angVelRef.current *= 0.5;
        targetAngRef.current = Math.atan2(snap.py - C.y, snap.px - C.x);
      }
      // integrate springs and compute snapped endpoint
      const dt = Math.min(Math.max(dtRaw || 0.016, 0.001), 0.05);
      const kA = 1000;
      const zA = 0.4;
      const cA = 2 * Math.sqrt(kA) * zA;
      const wrapPi = (a: number) => {
        const t = (a + Math.PI) % (2 * Math.PI);
        return t < 0 ? t + 2 * Math.PI - Math.PI : t - Math.PI;
      };
      const errA = wrapPi(curAngRef.current - targetAngRef.current);
      const angAcc = -kA * errA - cA * angVelRef.current;
      angVelRef.current += angAcc * dt;
      curAngRef.current += angVelRef.current * dt;
      const kR = 1100;
      const zR = 0.85;
      const cR = 2 * Math.sqrt(kR) * zR;
      const rNow = radiusRef.current > 0 ? radiusRef.current : L;
      const rGoal = targetRRef.current > 0 ? targetRRef.current : L;
      const rErr = rNow - rGoal;
      const radAcc = -kR * rErr - cR * radVelRef.current;
      radVelRef.current += radAcc * dt;
      radiusRef.current = rNow + radVelRef.current * dt;
      if (centerRef.current) {
        pxSnap =
          centerRef.current.x + radiusRef.current * Math.cos(curAngRef.current);
        pySnap =
          centerRef.current.y + radiusRef.current * Math.sin(curAngRef.current);
      }
    }

    // Apply free-mode blend (snap -> free) with a short ease-out
    let pxPrev = pxSnap,
      pyPrev = pySnap;
    if (isFree) {
      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      if (!wasFreeRef.current) {
        freeStartRef.current = { x: pxSnap, y: pySnap };
        freeT0Ref.current = now;
      }
      const t = Math.min(1, (now - freeT0Ref.current) / FREE_DUR_MS);
      const s = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const start = freeStartRef.current ?? { x: pxSnap, y: pySnap };
      pxPrev = start.x + (ptr.x - start.x) * s;
      pyPrev = start.y + (ptr.y - start.y) * s;
      // Once in free, ignore snap center
      centerRef.current = null;
    }
    wasFreeRef.current = isFree;

    // Draw preview lines
    // 1) thin neighbors -> cursor
    if (deg > 0 && mThin) {
      let thinCount = 0;
      for (const id of nbrIds) {
        const nb = model.atoms.find((a) => a.id === id);
        if (!nb) continue;
        const dx = ptr.x - nb.x;
        const dy = ptr.y - nb.y;
        const len = Math.max(1e-6, Math.hypot(dx, dy));
        const ang = Math.atan2(dy, dx);
        tmpQ.current.setFromAxisAngle(new THREE.Vector3(0, 0, 1), ang);
        tmpM.current.compose(
          new THREE.Vector3(nb.x + dx * 0.5, nb.y + dy * 0.5, -0.04),
          tmpQ.current,
          new THREE.Vector3(len, thinW, 1)
        );
        mThin.setMatrixAt(thinCount++, tmpM.current);
      }
      mThin.count = thinCount;
      mThin.visible = thinCount > 0;
      mThin.instanceMatrix.needsUpdate = true;
    }
    // Where the drawing puts the atom: every layer lays it out there.
    if (Number.isFinite(pxPrev) && Number.isFinite(pyPrev)) {
      setMoveDragPreview(pxPrev, pyPrev);
    }

    // cursor dot (deg >= 2)
    if (deg >= 2 && cursorDot.current) {
      const rWorld = thinW * 0.5;
      cursorDot.current.position.set(ptr.x, ptr.y, -0.035);
      cursorDot.current.scale.set(rWorld, rWorld, 1);
      cursorDot.current.visible = true;
      if (cursorDotOutline.current) cursorDotOutline.current.visible = false;
    }

    lastActiveRef.current = true;
    lastAtomIdRef.current = moving.id;
  });

  return (
    <group>
      <instancedMesh
        ref={thinInst}
        key={"mv-lines-" + countCap}
        args={[undefined as any, undefined as any, countCap]}
        frustumCulled={false}
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
      <mesh ref={cursorDot} frustumCulled={false} visible={false}>
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
      <mesh ref={cursorDotOutline} frustumCulled={false} visible={false}>
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
