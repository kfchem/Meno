import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { useEditor } from "../store";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";

export function Atoms2D() {
  const {
    model,
    moveAtom,
    connectAtoms,
    replaceDraggedAtomWith,
    findAtomNear,
    beginLabelEdit,
    setHoveredFromId,
    clearAtomHover,
    startExtend,
    updateExtend,
    commitExtend,
    beginPanHold,
    endPanHold,
    setExtendMode,
    beginMoveDrag,
    updateMovePointer,
    endMoveDrag,
    suppressDoubleClick,
  } = useEditor();
  const inst = useRef<THREE.InstancedMesh>(null!);
  const tmpM = useMemo(() => new THREE.Matrix4(), []);
  const { camera, gl } = useThree();
  const canvas = gl.domElement as HTMLCanvasElement;
  const toWorld = (cx: number, cy: number) => {
    const rect = canvas.getBoundingClientRect();
    const v = new THREE.Vector3(
      ((cx - rect.left) / rect.width) * 2 - 1,
      -(((cy - rect.top) / rect.height) * 2 - 1),
      0
    );
    v.unproject(camera as any);
    return { x: v.x, y: v.y };
  };
  const lastDown = useRef<{
    t: number;
    id: number | null;
    x: number;
    y: number;
  }>({ t: 0, id: null, x: 0, y: 0 });
  const cand = useRef<{
    active: boolean;
    atomId: number | null;
    started: boolean;
    sx: number;
    sy: number;
    lastx: number;
    lasty: number;
  }>({
    active: false,
    atomId: null,
    started: false,
    sx: 0,
    sy: 0,
    lastx: 0,
    lasty: 0,
  });
  const endedByInteractive = useRef(false);
  const idleTimer = useRef<number | null>(null);
  const lastMoveAt = useRef<number>(0);
  const pendingEdit = useRef<{ tid: number | null; atomId: number | null }>({
    tid: null,
    atomId: null,
  });
  const cancelPendingEdit = () => {
    if (pendingEdit.current.tid != null) {
      try {
        window.clearTimeout(pendingEdit.current.tid as any);
      } catch {}
      pendingEdit.current.tid = null;
      pendingEdit.current.atomId = null;
    }
  };
  // World-fixed hit area (independent of zoom & element type)
  const HIT_RADIUS_RATIO = 0.4; // radius ≈ 0.4 * L to make picking easier
  const countCap = Math.max(model.atoms.length, 1);
  const remountKey = model.atoms.length;

  // Initial placement and when model changes
  useEffect(() => {
    if (!inst.current) return;
    const atoms = model.atoms;
    inst.current.count = atoms.length;
    const rWorld = HIT_RADIUS_RATIO * NOMINAL_BOND_LENGTH;
    for (let i = 0; i < atoms.length; i++) {
      const a = atoms[i];
      // Nudge z slightly forward (z=+1e-3) to prioritize atom raycasting over bond hit areas
      tmpM.makeScale(rWorld, rWorld, 1).setPosition(a.x, a.y, 1e-3);
      inst.current.setMatrixAt(i, tmpM);
    }
    inst.current.instanceMatrix.needsUpdate = true;
  }, [model.atoms, model.bonds, tmpM]);

  return (
    <instancedMesh
      ref={inst}
      key={remountKey}
      args={[undefined as any, undefined as any, countCap]}
      onPointerDown={(e) => {
        const idx = (e as any).instanceId as number | undefined;
        if (idx == null || idx < 0) return;
        const a = model.atoms[idx];
        if (!a) return;
        setHoveredFromId(a.id);
        const now = performance.now();
        const btn = (e as any).nativeEvent?.button;
        const DBL_MS = 400;
        if (
          btn === 0 &&
          lastDown.current.id === a.id &&
          now - lastDown.current.t <= DBL_MS
        ) {
          // Candidate for interactive extension
          // Double-click detected: cancel any pending single-click edit
          cancelPendingEdit();
          const cx = (e as any).nativeEvent?.clientX ?? (e as any).clientX;
          const cy = (e as any).nativeEvent?.clientY ?? (e as any).clientY;
          cand.current = {
            active: true,
            atomId: a.id,
            started: false,
            sx: cx,
            sy: cy,
            lastx: cx,
            lasty: cy,
          };
          endedByInteractive.current = false;
          // prevent pan while user is doing dblclick -> direction gesture
          const pid =
            (e as any).nativeEvent?.pointerId ?? (e as any).pointerId ?? null;
          beginPanHold(pid);
          const MOV_PX = 6;
          const onMove = (ev: PointerEvent) => {
            if (!cand.current.active || cand.current.atomId == null) return;
            cand.current.lastx = ev.clientX;
            cand.current.lasty = ev.clientY;
            // reset 1s idle timer on any move
            lastMoveAt.current = ev.timeStamp || performance.now();
            if (idleTimer.current != null) {
              window.clearTimeout(idleTimer.current);
              idleTimer.current = null;
            }
            idleTimer.current = window.setTimeout(() => {
              // if still active and no movement for 1s, switch to free mode
              if (cand.current.active) setExtendMode("free");
            }, 1000) as unknown as number;
            if (!cand.current.started) {
              const dx = ev.clientX - cand.current.sx;
              const dy = ev.clientY - cand.current.sy;
              if (Math.hypot(dx, dy) >= MOV_PX) {
                cand.current.started = true;
                startExtend(cand.current.atomId);
              }
            }
            if (cand.current.started) {
              const p = toWorld(ev.clientX, ev.clientY);
              updateExtend(p.x, p.y);
            }
          };
          const onUp = (ev: PointerEvent) => {
            if (cand.current.active) {
              if (cand.current.started) {
                commitExtend();
                endedByInteractive.current = true;
              } else {
                // Tap-connect: if pointer barely moved and a nearby atom exists, create a connection
                try {
                  const baseId = cand.current.atomId!;
                  const p = toWorld(ev.clientX, ev.clientY);
                  const near = findAtomNear(
                    p.x,
                    p.y,
                    NOMINAL_BOND_LENGTH * 0.4,
                    baseId
                  );
                  if (near != null) {
                    connectAtoms(baseId, near, 1);
                    endedByInteractive.current = true;
                    // Suppress Canvas dblclick just in case
                    try {
                      suppressDoubleClick?.(160);
                    } catch {}
                  } else {
                    endedByInteractive.current = false;
                  }
                } catch {
                  endedByInteractive.current = false;
                }
              }
            }
            if (idleTimer.current != null) {
              window.clearTimeout(idleTimer.current);
              idleTimer.current = null;
            }
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp, true);
            cand.current = {
              active: false,
              atomId: null,
              started: false,
              sx: 0,
              sy: 0,
              lastx: 0,
              lasty: 0,
            };
            // release pan hold after gesture ends
            try {
              endPanHold(ev.pointerId);
            } catch {
              endPanHold(null);
            }
          };
          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", onUp, true);
          // Allow Canvas doubleclick to fire after up (if no interactive)
        } else {
          // Single-click hold -> drag to MOVE the clicked atom
          lastDown.current = {
            t: now,
            id: a.id,
            x: (e as any).nativeEvent?.clientX ?? (e as any).clientX,
            y: (e as any).nativeEvent?.clientY ?? (e as any).clientY,
          };
          if (btn === 0) {
            const cx = (e as any).nativeEvent?.clientX ?? (e as any).clientX;
            const cy = (e as any).nativeEvent?.clientY ?? (e as any).clientY;
            cand.current = {
              active: true,
              atomId: a.id,
              started: false,
              sx: cx,
              sy: cy,
              lastx: cx,
              lasty: cy,
            };
            endedByInteractive.current = false;
            const pid =
              (e as any).nativeEvent?.pointerId ?? (e as any).pointerId ?? null;
            beginPanHold(pid);
            const MOV_PX = 5; // start moving threshold (px)
            // capture initial world offset for stable drag (for free move)
            const thisAtom = model.atoms[idx];
            const startWorld = toWorld(cx, cy);
            const offset = {
              dx: thisAtom.x - startWorld.x,
              dy: thisAtom.y - startWorld.y,
            };
            // neighbor detection for snapping when degree==1 or >=2
            const nbrs: number[] = [];
            for (const b of model.bonds) {
              if (b.a === thisAtom.id) nbrs.push(b.b);
              else if (b.b === thisAtom.id) nbrs.push(b.a);
            }
            const deg = nbrs.length;
            const baseId = deg === 1 ? nbrs[0] : null;
            const basePos =
              deg === 1
                ? model.atoms.find((aa) => aa.id === baseId) || null
                : null;
            // For deg >= 2, compute centroid as a virtual hub for snapping
            let hub: { x: number; y: number } | null = null;
            if (deg >= 2) {
              let sx = 0,
                sy = 0,
                n = 0;
              for (const nid of nbrs) {
                const p = model.atoms.find((aa) => aa.id === nid);
                if (p) {
                  sx += p.x;
                  sy += p.y;
                  n++;
                }
              }
              if (n > 0) hub = { x: sx / n, y: sy / n };
            }
            const step = Math.PI / 6; // 30°
            const L = NOMINAL_BOND_LENGTH;
            // Animation state for snapping move
            const anim = {
              raf: 0 as number,
              running: false,
              center: null as null | { x: number; y: number },
              radius: 0 as number,
              targetR: 0 as number,
              radVel: 0 as number,
              curAng: 0,
              angVel: 0,
              targetAng: 0,
              lastTs: 0,
            };
            // Free-mode flag for move (idle 1s)
            let moveFree = false;
            const resetIdleTimer = () => {
              if (idleTimer.current != null) {
                window.clearTimeout(idleTimer.current);
                idleTimer.current = null;
              }
              idleTimer.current = window.setTimeout(() => {
                moveFree = true;
                // stop spring animation if running
                if (anim.running && anim.raf) {
                  try {
                    window.cancelAnimationFrame(anim.raf);
                  } catch {}
                  anim.running = false;
                  anim.raf = 0;
                }
                // Kick a short ease-out transition (snap -> free) similar to extend preview
                const startAng = anim.curAng;
                const startLen =
                  anim.radius && anim.radius > 0 ? anim.radius : L; // use current snapping radius
                const startTime = performance.now();
                const DUR = 180; // ms
                const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
                const stepBlend = () => {
                  if (!cand.current.active) return;
                  const lx = cand.current.lastx;
                  const ly = cand.current.lasty;
                  if (!Number.isFinite(lx) || !Number.isFinite(ly)) return;
                  const pNow = toWorld(lx, ly);
                  // Blend angle toward cursor direction around the same center
                  const ctr = anim.center ||
                    basePos ||
                    hub || { x: thisAtom.x, y: thisAtom.y };
                  const angNow = Math.atan2(pNow.y - ctr.y, pNow.x - ctr.x);
                  const t = Math.min(1, (performance.now() - startTime) / DUR);
                  const s = easeOutCubic(t);
                  const wrapDelta = (from: number, to: number) => {
                    let d = to - from;
                    d = ((d + Math.PI) % (2 * Math.PI)) - Math.PI;
                    return d;
                  };
                  const angBlend = startAng + wrapDelta(startAng, angNow) * s;
                  const lenBlend =
                    startLen +
                    (Math.hypot(pNow.x - ctr.x, pNow.y - ctr.y) - startLen) * s;
                  const nx = ctr.x + lenBlend * Math.cos(angBlend);
                  const ny = ctr.y + lenBlend * Math.sin(angBlend);
                  moveAtom(thisAtom.id, nx, ny);
                  if (t < 1 && cand.current.active) {
                    window.requestAnimationFrame(stepBlend);
                  } else {
                    // After transition, follow cursor directly (offset zero)
                    offset.dx = 0;
                    offset.dy = 0;
                    const pFinal = toWorld(lx, ly);
                    moveAtom(thisAtom.id, pFinal.x, pFinal.y);
                  }
                };
                window.requestAnimationFrame(stepBlend);
              }, 1000) as unknown as number;
            };
            const startSpring = () => {
              if (anim.running) return;
              anim.running = true;
              const loop = (ts: number) => {
                if (!cand.current.active || !cand.current.started) {
                  anim.running = false;
                  anim.raf = 0;
                  return;
                }
                const dtRaw = anim.lastTs ? (ts - anim.lastTs) / 1000 : 0.016;
                anim.lastTs = ts;
                const dt = Math.min(Math.max(dtRaw || 0.016, 0.001), 0.05);
                // spring params (faster response)
                const k = 1000;
                const zeta = 0.4;
                const c = 2 * Math.sqrt(k) * zeta;
                // radial spring params (slightly under critical for speed)
                const kR = 1100;
                const zR = 0.85;
                const cR = 2 * Math.sqrt(kR) * zR;
                const wrapPi = (a: number) => {
                  const t = (a + Math.PI) % (2 * Math.PI);
                  return t < 0 ? t + 2 * Math.PI - Math.PI : t - Math.PI;
                };
                // shortest error from current to target
                const err = wrapPi(anim.curAng - anim.targetAng);
                const angAcc = -k * err - c * anim.angVel;
                anim.angVel += angAcc * dt;
                anim.curAng += anim.angVel * dt;
                // radial update toward target radius
                const rGoal =
                  anim.targetR && anim.targetR > 0 ? anim.targetR : L;
                const rNow = anim.radius && anim.radius > 0 ? anim.radius : L;
                const rErr = rNow - rGoal;
                const radAcc = -kR * rErr - cR * (anim.radVel || 0);
                anim.radVel = (anim.radVel || 0) + radAcc * dt;
                anim.radius = rNow + anim.radVel * dt;
                // apply to atom position if center is known
                if (anim.center) {
                  const rnow = anim.radius && anim.radius > 0 ? anim.radius : L;
                  const nx = anim.center.x + rnow * Math.cos(anim.curAng);
                  const ny = anim.center.y + rnow * Math.sin(anim.curAng);
                  moveAtom(thisAtom.id, nx, ny);
                }
                anim.raf = window.requestAnimationFrame(loop);
              };
              anim.raf = window.requestAnimationFrame(loop);
            };
            let moved = false;
            const onMove = (ev: PointerEvent) => {
              if (!cand.current.active || cand.current.atomId == null) return;
              cand.current.lastx = ev.clientX;
              cand.current.lasty = ev.clientY;
              const dx = ev.clientX - cand.current.sx;
              const dy = ev.clientY - cand.current.sy;
              if (!cand.current.started) {
                if (Math.hypot(dx, dy) >= MOV_PX) {
                  cand.current.started = true;
                  // On drag start, cancel pending single-click edit if any
                  cancelPendingEdit();
                  // During/just after drag, suppress fallback single-click scheduling
                  try {
                    suppressDoubleClick?.(600);
                  } catch {}
                  // start idle timer upon entering drag-started state
                  resetIdleTimer();
                  // mark moving atom to suppress hover
                  // seed moveDrag with initial pointer world position for preview
                  const p0 = toWorld(ev.clientX, ev.clientY);
                  beginMoveDrag(thisAtom.id, { x: p0.x, y: p0.y });
                  // initialize spring state when snapping is in effect
                  if (deg === 1 && basePos) {
                    anim.center = { x: basePos.x, y: basePos.y };
                    // start from current angle (atom around center)
                    anim.curAng = Math.atan2(
                      thisAtom.y - basePos.y,
                      thisAtom.x - basePos.x
                    );
                    // initialize radius and targetR
                    anim.radius = Math.hypot(
                      thisAtom.x - basePos.x,
                      thisAtom.y - basePos.y
                    );
                    anim.targetR = L;
                    anim.radVel = 0;
                    anim.angVel = 0;
                    anim.lastTs = 0;
                  } else if (deg >= 2 && hub) {
                    anim.center = { x: hub.x, y: hub.y };
                    anim.curAng = Math.atan2(
                      thisAtom.y - hub.y,
                      thisAtom.x - hub.x
                    );
                    anim.radius = Math.hypot(
                      thisAtom.x - hub.x,
                      thisAtom.y - hub.y
                    );
                    anim.targetR = L;
                    anim.radVel = 0;
                    anim.angVel = 0;
                    anim.lastTs = 0;
                  }
                }
              }
              if (cand.current.started) {
                const p = toWorld(ev.clientX, ev.clientY);
                // reset idle timer on any move
                resetIdleTimer();
                // update pointer for move preview
                updateMovePointer(p.x, p.y);
                if (moveFree) {
                  // Free follow: stop snapping/animation
                  if (anim.running && anim.raf) {
                    try {
                      window.cancelAnimationFrame(anim.raf);
                    } catch {}
                    anim.running = false;
                    anim.raf = 0;
                  }
                  moveAtom(
                    cand.current.atomId,
                    p.x + offset.dx,
                    p.y + offset.dy
                  );
                } else if (deg === 1 && basePos) {
                  // snapping with spring update: set target angle and ensure RAF
                  const ang = Math.atan2(p.y - basePos.y, p.x - basePos.x);
                  const snap = Math.round(ang / step) * step;
                  anim.targetAng = snap;
                  if (!anim.running) startSpring();
                } else if (deg >= 2 && hub) {
                  // Aesthetic snap with spring - richer candidates
                  const ang = Math.atan2(p.y - hub.y, p.x - hub.x);
                  const nbrAngles: number[] = [];
                  const nbrPos: { x: number; y: number }[] = [];
                  for (const nid of nbrs) {
                    const q = model.atoms.find((aa) => aa.id === nid);
                    if (q) {
                      nbrAngles.push(Math.atan2(q.y - hub.y, q.x - hub.x));
                      nbrPos.push({ x: q.x, y: q.y });
                    }
                  }
                  const TAU = 2 * Math.PI;
                  const norm = (a: number) => ((a % TAU) + TAU) % TAU;
                  // note: angle delta helper removed (selection is proximity-based)
                  // Build diverse candidate positions (center + radius + angle)
                  type Cand = {
                    cx: number;
                    cy: number;
                    r: number;
                    ang: number;
                    px: number;
                    py: number;
                  };
                  const posKey = (x: number, y: number) =>
                    `${(Math.round(x * 1000) / 1000).toFixed(3)}|${(
                      Math.round(y * 1000) / 1000
                    ).toFixed(3)}`;
                  const cset = new Set<string>();
                  const cands: Cand[] = [];
                  const pushCandPos = (
                    cx: number,
                    cy: number,
                    r: number,
                    angVal: number
                  ) => {
                    const a = norm(angVal);
                    const px = cx + r * Math.cos(a);
                    const py = cy + r * Math.sin(a);
                    const key = posKey(px, py);
                    if (!cset.has(key)) {
                      cset.add(key);
                      cands.push({ cx, cy, r, ang: a, px, py });
                    }
                  };
                  // 30° grid around cursor direction (±6 steps) about hub
                  for (let k = -6; k <= 6; k++)
                    pushCandPos(
                      hub.x,
                      hub.y,
                      L,
                      Math.round(ang / step + k) * step
                    );
                  // 15° phase-shifted grid (offset by 15°) about hub
                  const half = step * 0.5; // 15°
                  for (let k = -6; k <= 6; k++)
                    pushCandPos(
                      hub.x,
                      hub.y,
                      L,
                      Math.round((ang + half) / step + k) * step - half
                    );
                  // Bisectors of neighbor gaps (quantized to 30°) about hub
                  const sorted = [...nbrAngles].sort(
                    (a, b) => norm(a) - norm(b)
                  );
                  for (let i = 0; i < sorted.length; i++) {
                    const a0 = sorted[i];
                    const a1 = sorted[(i + 1) % sorted.length];
                    let d = norm(a1) - norm(a0);
                    if (d <= 0) d += TAU;
                    const mid = norm(a0 + d / 2);
                    pushCandPos(hub.x, hub.y, L, Math.round(mid / step) * step);
                  }
                  // Uniform sector grid based on (deg+1)-gon about hub
                  const sector = TAU / (deg + 1);
                  for (let k = -deg - 2; k <= deg + 2; k++)
                    pushCandPos(
                      hub.x,
                      hub.y,
                      L,
                      Math.round(ang / sector + k) * sector
                    );
                  // Offsets from each neighbor by common exterior angles (±): 120°, 90°, 72°, 60°, 45°, 30° (about hub)
                  const exts = [120, 90, 72, 60, 45, 30].map(
                    (d) => (d * Math.PI) / 180
                  );
                  for (const na of nbrAngles) {
                    for (const ex of exts) {
                      pushCandPos(hub.x, hub.y, L, na + ex);
                      pushCandPos(hub.x, hub.y, L, na - ex);
                    }
                  }
                  // Add 120° circle loci candidates for deg==2 using neighbor positions
                  if (deg === 2 && nbrPos.length === 2) {
                    const A = nbrPos[0];
                    const B = nbrPos[1];
                    const mx = (A.x + B.x) * 0.5;
                    const my = (A.y + B.y) * 0.5;
                    const dx = B.x - A.x;
                    const dy = B.y - A.y;
                    const c = Math.hypot(dx, dy);
                    if (c > 1e-6) {
                      const R = c / Math.sqrt(3); // circle radius for inscribed 120°
                      const h = c / (2 * Math.sqrt(3)); // center offset along perpendicular bisector
                      const ux = -dy / c;
                      const uy = dx / c;
                      const centers = [
                        { x: mx + ux * h, y: my + uy * h },
                        { x: mx - ux * h, y: my - uy * h },
                      ];
                      // helper: generate angles along the minor arc from A to B around center C
                      const wrapPi = (t: number) => {
                        let v = (t + Math.PI) % (2 * Math.PI);
                        if (v < 0) v += 2 * Math.PI;
                        return v - Math.PI;
                      };
                      const genMinorArc = (C: { x: number; y: number }) => {
                        const aA = Math.atan2(A.y - C.y, A.x - C.x);
                        const aB = Math.atan2(B.y - C.y, B.x - C.x);
                        let d = wrapPi(aB - aA);
                        // ensure d is the minor arc sweep (|d| <= π)
                        // We expect |d| ≈ 120° here
                        const steps = Math.max(
                          4,
                          Math.round(Math.abs(d) / (Math.PI / 12))
                        ); // ~15° resolution
                        for (let i = 0; i <= steps; i++) {
                          const t = i / steps;
                          const angC = aA + d * t;
                          pushCandPos(C.x, C.y, R, angC);
                        }
                      };
                      for (const C of centers) genMinorArc(C);
                    }
                  }
                  // Add pairwise 120° minor-arc samples for any deg>=3 (for each neighbor pair)
                  if (deg >= 3 && nbrPos.length >= 2) {
                    const wrapPi = (t: number) => {
                      let v = (t + Math.PI) % (2 * Math.PI);
                      if (v < 0) v += 2 * Math.PI;
                      return v - Math.PI;
                    };
                    for (let i = 0; i < nbrPos.length; i++) {
                      for (let j = i + 1; j < nbrPos.length; j++) {
                        const U = nbrPos[i];
                        const V = nbrPos[j];
                        const mx2 = (U.x + V.x) * 0.5;
                        const my2 = (U.y + V.y) * 0.5;
                        const dx2 = V.x - U.x;
                        const dy2 = V.y - U.y;
                        const c2 = Math.hypot(dx2, dy2);
                        if (c2 <= 1e-6) continue;
                        const R2 = c2 / Math.sqrt(3);
                        const h2 = c2 / (2 * Math.sqrt(3));
                        const ux2 = -dy2 / c2;
                        const uy2 = dx2 / c2;
                        const centers2 = [
                          { x: mx2 + ux2 * h2, y: my2 + uy2 * h2 },
                          { x: mx2 - ux2 * h2, y: my2 - uy2 * h2 },
                        ];
                        for (const C of centers2) {
                          const aU = Math.atan2(U.y - C.y, U.x - C.x);
                          const aV = Math.atan2(V.y - C.y, V.x - C.x);
                          let dUV = wrapPi(aV - aU);
                          const steps2 = Math.max(
                            4,
                            Math.round(Math.abs(dUV) / (Math.PI / 12))
                          );
                          for (let k = 0; k <= steps2; k++) {
                            const t = k / steps2;
                            const angC = aU + dUV * t;
                            pushCandPos(C.x, C.y, R2, angC);
                          }
                        }
                      }
                    }
                  }
                  // Optional filter: keep candidates satisfying bond-length conditions at the moving atom
                  // Condition A: distance from candidate position to at least one neighbor equals NOMINAL_BOND_LENGTH within tolerance
                  // Condition B: distances to at least two neighbors are equal within tolerance (no need to match nominal)
                  // Reintroduce tolerance to avoid instability from float errors
                  const TOL = Math.max(1e-4, L * 0.01); // ~1% of nominal length with small absolute floor
                  const filtered: typeof cands = [];
                  for (const cd of cands) {
                    const distances: number[] = [];
                    for (const nid of nbrs) {
                      const q = model.atoms.find((aa) => aa.id === nid);
                      if (!q) continue;
                      distances.push(Math.hypot(cd.px - q.x, cd.py - q.y));
                    }
                    // Condition A
                    const okA = distances.some((d) => Math.abs(d - L) <= TOL);
                    // Condition B: any pair within tolerance
                    let okB = false;
                    for (let i = 0; i < distances.length && !okB; i++) {
                      for (let j = i + 1; j < distances.length; j++) {
                        if (Math.abs(distances[i] - distances[j]) <= TOL) {
                          okB = true;
                          break;
                        }
                      }
                    }
                    if (okA || okB) filtered.push(cd);
                  }
                  const usable = filtered.length > 0 ? filtered : cands;
                  // Pick the candidate nearest to the pointer (Euclidean distance)
                  // Add hysteresis: prefer staying on the same center unless improvement is significant
                  let bestAnyIdx = -1,
                    bestAnyD = Infinity;
                  let bestSameIdx = -1,
                    bestSameD = Infinity;
                  const hasCenter = !!anim.center;
                  for (let i = 0; i < usable.length; i++) {
                    const cd = usable[i];
                    const d = Math.hypot(cd.px - p.x, cd.py - p.y);
                    let dAdj = d;
                    const sameCenter =
                      hasCenter &&
                      Math.hypot(
                        cd.cx - (anim.center as any).x,
                        cd.cy - (anim.center as any).y
                      ) <= 1e-6;
                    if (sameCenter) dAdj -= 0.05 * L; // small stability bias
                    if (dAdj < bestAnyD) {
                      bestAnyD = dAdj;
                      bestAnyIdx = i;
                    }
                    if (sameCenter && dAdj < bestSameD) {
                      bestSameD = dAdj;
                      bestSameIdx = i;
                    }
                  }
                  let pickIdx = bestAnyIdx;
                  if (hasCenter && bestSameIdx >= 0 && bestAnyIdx >= 0) {
                    const anyIsDifferent =
                      Math.hypot(
                        usable[bestAnyIdx].cx - (anim.center as any).x,
                        usable[bestAnyIdx].cy - (anim.center as any).y
                      ) > 1e-6;
                    const HYST = 0.12 * L; // require noticeable improvement to switch centers
                    if (anyIsDifferent && bestAnyD > bestSameD - HYST) {
                      pickIdx = bestSameIdx;
                    }
                  }
                  if (pickIdx >= 0) {
                    const best = usable[pickIdx];
                    // Rebase angle when center changes to avoid world-position jump
                    const prevCenter = anim.center
                      ? { x: anim.center.x, y: anim.center.y }
                      : null;
                    const prevR =
                      anim.radius && anim.radius > 0 ? anim.radius : L;
                    let worldX: number, worldY: number;
                    if (anim.running && prevCenter) {
                      worldX = prevCenter.x + prevR * Math.cos(anim.curAng);
                      worldY = prevCenter.y + prevR * Math.sin(anim.curAng);
                    } else {
                      // use current atom position as the world reference when not running
                      worldX = thisAtom.x;
                      worldY = thisAtom.y;
                    }
                    // apply chosen candidate (new polar frame)
                    const newCenter = { x: best.cx, y: best.cy };
                    const newR = best.r && best.r > 0 ? best.r : L;
                    anim.center = newCenter;
                    // keep world position continuous in new frame
                    const currR = Math.hypot(
                      worldX - newCenter.x,
                      worldY - newCenter.y
                    );
                    anim.radius = currR > 1e-12 ? currR : newR;
                    anim.targetR = newR;
                    anim.radVel *= 0.5; // damp radial velocity on center change
                    if (anim.running) {
                      // keep the same world position, rewrite curAng in the new frame
                      anim.curAng = Math.atan2(
                        worldY - newCenter.y,
                        worldX - newCenter.x
                      );
                    } else {
                      // initialize angle from current position in the new frame
                      anim.curAng = Math.atan2(
                        thisAtom.y - newCenter.y,
                        thisAtom.x - newCenter.x
                      );
                      anim.angVel = 0;
                      anim.lastTs = 0;
                    }
                    // Choose target as the 2π-equivalent of best.ang nearest to current curAng
                    const baseAng = anim.running ? anim.targetAng : anim.curAng;
                    const k2pi = Math.round(
                      (baseAng - best.ang) / (2 * Math.PI)
                    );
                    anim.targetAng = best.ang + k2pi * (2 * Math.PI);
                    // damp angular velocity slightly when target/center changes to reduce overshoot
                    anim.angVel *= 0.5;
                    if (!anim.running) startSpring();
                  }
                } else {
                  moveAtom(
                    cand.current.atomId,
                    p.x + offset.dx,
                    p.y + offset.dy
                  );
                }
                moved = true;
              }
            };
            const onUp = (ev: PointerEvent) => {
              if (idleTimer.current != null) {
                window.clearTimeout(idleTimer.current);
                idleTimer.current = null;
              }
              // stop spring animation if running
              if (anim.running && anim.raf) {
                try {
                  window.cancelAnimationFrame(anim.raf);
                } catch {}
              }
              window.removeEventListener("pointermove", onMove);
              window.removeEventListener("pointerup", onUp, true);
              cand.current = {
                active: false,
                atomId: null,
                started: false,
                sx: 0,
                sy: 0,
                lastx: 0,
                lasty: 0,
              };
              // if moved, suppress selection click
              if (moved) endedByInteractive.current = true;
              // If a drag occurred, continue suppressing single-click right after release
              if (moved) {
                try {
                  suppressDoubleClick?.(480);
                } catch {}
              }
              // clear moving flag
              // If a nearby atom exists on drop, replace the moved atom with that atom and connect
              try {
                const pEnd = toWorld(ev.clientX, ev.clientY);
                const hitId = findAtomNear(
                  pEnd.x,
                  pEnd.y,
                  NOMINAL_BOND_LENGTH * 0.4,
                  thisAtom.id
                );
                if (hitId != null && moved) {
                  // Replace the moving atom from the perspective of the base (deg==1) or hub
                  replaceDraggedAtomWith(thisAtom.id, hitId);
                }
              } catch {}
              endMoveDrag();
              // For single-click (no drag started), schedule entering edit mode with a short delay
              // If the second click of a double-click occurs, onPointerDown will cancel via cancelPendingEdit()
              if (!moved && !cand.current.started) {
                cancelPendingEdit();
                const EDIT_DELAY_MS = 410; // Slightly longer than DBL_MS(400) to feel snappy
                pendingEdit.current.atomId = thisAtom.id;
                pendingEdit.current.tid = window.setTimeout(() => {
                  if (pendingEdit.current.atomId === thisAtom.id) {
                    beginLabelEdit(thisAtom.id);
                  }
                  cancelPendingEdit();
                }, EDIT_DELAY_MS) as unknown as number;
              }
              try {
                endPanHold(ev.pointerId);
              } catch {
                endPanHold(null);
              }
            };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp, true);
          }
        }
      }}
      onDoubleClick={(e) => {
        // Suppress Canvas dblclick if we just did interactive commit
        if (endedByInteractive.current) {
          (e as any).stopPropagation?.();
          endedByInteractive.current = false;
        }
        // On double-click, cancel any pending single-click edit
        cancelPendingEdit();
      }}
      onPointerMove={(e) => {
        const idx = (e as any).instanceId as number | undefined;
        if (idx == null || idx < 0) return;
        const a = model.atoms[idx];
        if (a) {
          setHoveredFromId(a.id);
          // Stop propagation so atoms don’t override lower-layer (bond) hits
          (e as any).stopPropagation?.();
        }
      }}
      onPointerOut={() => {
        // Only clear atom hover; keep bond hover if present
        clearAtomHover();
      }}
      onClick={() => {
        // Do nothing here since beginLabelEdit is triggered immediately in onPointerUp
        // Avoid double execution via default browser click propagation
        return;
      }}
    >
      <circleGeometry args={[1, 48]} />
      {/* In 2D we don’t fill atoms (keep them transparent). Only keep the hit area for events. */}
      <meshBasicMaterial
        transparent
        opacity={0}
        depthWrite={false}
        toneMapped={false}
        color={"white"}
      />
    </instancedMesh>
  );
}
