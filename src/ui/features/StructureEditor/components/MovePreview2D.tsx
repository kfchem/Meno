import * as THREE from "three";
import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEditor } from "../store";
import { COLORS, ALPHA } from "../../../theme/colors";
import {
  ACS_RATIOS,
  NOMINAL_BOND_LENGTH,
  acsWorldOptions,
} from "../../../../lib/chem/acs";
import {
  buildBondPrimitives,
  type LayoutOptions,
  type Atom as LAtom,
  type Bond as LBond,
} from "../../../../lib/chem/layout2d";
import { computeMoveSnap } from "../utils/moveSnap";

// Preview for moving an atom without mutating coordinates during drag.
// - Thin highlight lines (neighbor -> cursor) keep existing look.
// - Thick snapped preview (neighbor -> snapped endpoint) mirrors Extend behavior.
export default function MovePreview2D() {
  const { model, moveDrag } = useEditor();
  const { camera } = useThree();
  const thinInst = useRef<THREE.InstancedMesh>(null!);
  const thickInst = useRef<THREE.InstancedMesh>(null!);
  // Stereo preview helpers
  const hashInst = useRef<THREE.InstancedMesh>(null!); // hashed wedge segments ('down')
  const wedgeSolidGeo = useRef<THREE.BufferGeometry>(null!); // triangle geometry ('up')
  const wedgeSolidMesh = useRef<THREE.Mesh>(null!);
  const joinDot = useRef<THREE.Mesh>(null!);
  const cursorDot = useRef<THREE.Mesh>(null!);
  const cursorDotOutline = useRef<THREE.Mesh>(null!);
  // Allow headroom for multi-bonds (up to triple => 3 segments)
  const countCap = Math.max(model.bonds.length * 3, 1);
  const hashCap = Math.max(model.bonds.length * 8, 8);
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
    const mThin = thinInst.current;
    const mThick = thickInst.current;
    const mHash = hashInst.current;
    if (!mThin || !cursorDot.current) return;

    // hide by default
    mThin.count = 0;
    mThin.visible = false;
    if (mThick) {
      mThick.count = 0;
      mThick.visible = false;
    }
    if (mHash) {
      mHash.count = 0;
      mHash.visible = false;
    }
    if (wedgeSolidMesh.current) wedgeSolidMesh.current.visible = false;
    cursorDot.current.visible = false;
    if (joinDot.current) joinDot.current.visible = false;
    if (cursorDotOutline.current) cursorDotOutline.current.visible = false;

    if (!moveDrag.active || moveDrag.atomId == null || !moveDrag.pointer) {
      mThin.instanceMatrix.needsUpdate = true;
      if (mThick) mThick.instanceMatrix.needsUpdate = true;
      if (mHash) mHash.instanceMatrix.needsUpdate = true;
      angVelRef.current = 0;
      lastActiveRef.current = false;
      return;
    }

    const moving = model.atoms.find((x) => x.id === moveDrag.atomId);
    const ptr = moveDrag.pointer;
    if (!moving || !ptr) {
      mThin.instanceMatrix.needsUpdate = true;
      if (mThick) mThick.instanceMatrix.needsUpdate = true;
      if (mHash) mHash.instanceMatrix.needsUpdate = true;
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
    const thickW = thinW;

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
    // 2) thick preview from layout at snapped position: reflects multi-bonds and hashed wedges
    if (
      deg > 0 &&
      mThick &&
      Number.isFinite(pxPrev) &&
      Number.isFinite(pyPrev)
    ) {
      // Build atoms (with the moving atom temporarily at the snapped endpoint)
      const movingId = moving.id;
      const atomsL: LAtom[] = model.atoms.map((a) =>
        a.id === movingId
          ? { id: a.id, x: pxPrev, y: pyPrev, el: a.el }
          : { id: a.id, x: a.x, y: a.y, el: a.el }
      );
      const idToIndex = new Map<number, number>();
      atomsL.forEach((a, i) => idToIndex.set(a.id, i));
      // All bonds (for correct degree/adjacency) in layout indices
      const bondsAll: LBond[] = model.bonds.map((b) => ({
        a1: idToIndex.get(b.a as number)!,
        a2: idToIndex.get(b.b as number)!,
        order: (b.order as 1 | 2 | 3) ?? 1,
        stereo: (b.stereo ?? "none") as "up" | "down" | "wavy" | "none",
        doubleMode: (b as any).doubleMode ?? "auto",
        stereoOrient: (b as any).stereoOrient ?? ("principle" as const),
      }));
      // Only bonds attached to the moving atom (in layout indices)
      const mi = idToIndex.get(movingId)!;
      const bondsAttach = bondsAll.filter((b) => b.a1 === mi || b.a2 === mi);
      // Degree map (full molecule) for wedge base selection parity
      const degMap = new Map<number, number>();
      for (const b of bondsAll) {
        degMap.set(b.a1, (degMap.get(b.a1) || 0) + 1);
        degMap.set(b.a2, (degMap.get(b.a2) || 0) + 1);
      }
      // Adjacency (for double bond auto offset sign)
      const adj = new Map<number, number[]>();
      for (const b of bondsAll) {
        adj.set(b.a1, [...(adj.get(b.a1) || []), b.a2]);
        adj.set(b.a2, [...(adj.get(b.a2) || []), b.a1]);
      }
      // Build primitives for attached bonds only, but with full deg info
      const zNow = (camera as any)?.zoom || 1;
      const opts: LayoutOptions = acsWorldOptions(
        atomsL as any,
        bondsAttach as any,
        { units: "world", minLinePx: 1.25 }
      );
      type LineSeg = {
        x1: number;
        y1: number;
        x2: number;
        y2: number;
        widthPx: number;
      };
      type Poly = { points: { x: number; y: number }[] };
      const outLines: LineSeg[] = [];
      const outPolys: Poly[] = [];
      for (const b of bondsAttach) {
        // Compute autoSgn for double bonds (mimic layout2d.ts logic)
        let autoSgn: number | undefined = undefined;
        if (
          b.order === 2 &&
          (b.doubleMode === undefined || b.doubleMode === "auto")
        ) {
          const p1 = { x: atomsL[b.a1].x, y: atomsL[b.a1].y };
          const p2 = { x: atomsL[b.a2].x, y: atomsL[b.a2].y };
          const axis = { x: p2.x - p1.x, y: p2.y - p1.y };
          const L0 = Math.hypot(axis.x, axis.y);
          const dir =
            L0 > 1e-9 ? { x: axis.x / L0, y: axis.y / L0 } : { x: 1, y: 0 };
          const n = { x: -dir.y, y: dir.x };
          const neigh1 = (adj.get(b.a1) || []).filter((x) => x !== b.a2);
          const neigh2 = (adj.get(b.a2) || []).filter((x) => x !== b.a1);
          const EPS = Math.max(1e-4, L0 * 0.06);
          let plus = 0,
            minus = 0;
          for (const o of neigh1) {
            const v = { x: atomsL[o].x - p1.x, y: atomsL[o].y - p1.y };
            const s = v.x * n.x + v.y * n.y;
            if (s > EPS) plus++;
            else if (s < -EPS) minus++;
          }
          for (const o of neigh2) {
            const v = { x: atomsL[o].x - p2.x, y: atomsL[o].y - p2.y };
            const s = v.x * n.x + v.y * n.y;
            if (s > EPS) plus++;
            else if (s < -EPS) minus++;
          }
          if (plus === minus) autoSgn = undefined;
          else autoSgn = plus > minus ? +1 : -1;
        }
        const prim = buildBondPrimitives(
          atomsL as any,
          b as any,
          opts,
          zNow,
          degMap,
          /*inRing*/ false,
          autoSgn
        );
        outLines.push(...prim.lines);
        outPolys.push(...prim.polys);
      }
      // Render lines (multi-bonds + hashed wedges) with thickness in world units
      let thickCount = 0;
      for (let i = 0; i < outLines.length; i++) {
        const s = outLines[i];
        const dx = s.x2 - s.x1,
          dy = s.y2 - s.y1;
        const len = Math.max(1e-6, Math.hypot(dx, dy));
        const ang = Math.atan2(dy, dx);
        const thickWorldRaw = s.widthPx / Math.max(zNow, 1e-6);
        const MIN_WORLD_THICK = Math.max(1e-3, NOMINAL_BOND_LENGTH * 0.02);
        const thickWorld = Math.max(thickWorldRaw, MIN_WORLD_THICK);
        tmpQ.current.setFromAxisAngle(new THREE.Vector3(0, 0, 1), ang);
        tmpM.current.compose(
          new THREE.Vector3((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, -0.03),
          tmpQ.current,
          new THREE.Vector3(len, thickWorld, 1)
        );
        mThick.setMatrixAt(thickCount++, tmpM.current);
      }
      mThick.count = thickCount;
      mThick.visible = thickCount > 0;
      mThick.instanceMatrix.needsUpdate = true;
      // Render solid wedges (polygons)
      if (wedgeSolidGeo.current && wedgeSolidMesh.current) {
        const triPositions: number[] = [];
        for (const p of outPolys) {
          if (!p.points || p.points.length < 3) continue;
          const [p0, p1, p2] = p.points;
          triPositions.push(
            p0.x,
            p0.y,
            -0.031,
            p1.x,
            p1.y,
            -0.031,
            p2.x,
            p2.y,
            -0.031
          );
        }
        if (triPositions.length > 0) {
          const arr = new Float32Array(triPositions);
          wedgeSolidGeo.current.setAttribute(
            "position",
            new THREE.BufferAttribute(arr, 3)
          );
          const triCount = arr.length / 9;
          const index = new Uint32Array(triCount * 3);
          for (let i = 0; i < triCount; i++) {
            index[i * 3 + 0] = i * 3 + 0;
            index[i * 3 + 1] = i * 3 + 1;
            index[i * 3 + 2] = i * 3 + 2;
          }
          wedgeSolidGeo.current.setIndex(new THREE.BufferAttribute(index, 1));
          wedgeSolidGeo.current.computeVertexNormals();
          wedgeSolidGeo.current.computeBoundingSphere();
          wedgeSolidMesh.current.visible = true;
        } else {
          wedgeSolidGeo.current.setIndex(null);
          wedgeSolidMesh.current.visible = false;
        }
      }
    }

    // joint dot at snapped endpoint for deg >= 2 (replaces hidden base join caps)
    if (deg >= 2 && joinDot.current) {
      const rWorld = thickW * 0.5;
      joinDot.current.position.set(pxPrev, pyPrev, -0.035);
      joinDot.current.scale.set(rWorld, rWorld, 1);
      joinDot.current.visible = true;
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
      <instancedMesh
        ref={thickInst}
        key={"mv-thick-" + countCap}
        args={[undefined as any, undefined as any, countCap]}
        visible={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          color={COLORS.bond}
          transparent={false}
          toneMapped={false}
        />
      </instancedMesh>
      {/* Hashed wedge bars for 'down' stereo */}
      <instancedMesh
        ref={hashInst}
        key={"mv-hash-" + hashCap}
        args={[undefined as any, undefined as any, hashCap]}
        visible={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          color={COLORS.bond}
          transparent={false}
          toneMapped={false}
        />
      </instancedMesh>
      {/* Solid wedge triangles for 'up' stereo */}
      <mesh ref={wedgeSolidMesh} visible={false}>
        <bufferGeometry ref={wedgeSolidGeo} />
        <meshBasicMaterial
          color={COLORS.bond}
          side={THREE.DoubleSide}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
      {/* Joint dot at snapped endpoint (deg>=2) */}
      <mesh ref={joinDot} visible={false}>
        <circleGeometry args={[1, 32]} />
        <meshBasicMaterial
          color={COLORS.bond}
          transparent={false}
          toneMapped={false}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
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
