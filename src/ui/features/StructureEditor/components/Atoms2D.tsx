import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { useEditor } from "../store";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { computeMoveSnap } from "../utils/moveSnap";
import { ATOM_PICK_RADIUS_RATIO } from "../constants";
import { commitInstanceMatrices } from "./instances";

// The hit area is world-fixed, the size of the hover ring
// (ATOM_PICK_RADIUS_RATIO), so what lights up is what can be picked.
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
    setMoveMode,
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
  const countCap = Math.max(model.atoms.length, 1);
  const remountKey = model.atoms.length;

  // Initial placement and when model changes
  useEffect(() => {
    if (!inst.current) return;
    const atoms = model.atoms;
    inst.current.count = atoms.length;
    const rWorld = ATOM_PICK_RADIUS_RATIO * NOMINAL_BOND_LENGTH;
    for (let i = 0; i < atoms.length; i++) {
      const a = atoms[i];
      // Nudge z slightly forward (z=+1e-3) to prioritize atom raycasting over bond hit areas
      tmpM.makeScale(rWorld, rWorld, 1).setPosition(a.x, a.y, 1e-3);
      inst.current.setMatrixAt(i, tmpM);
    }
    commitInstanceMatrices(inst.current);
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
            // The atom is not moved until it is dropped: MovePreview2D works
            // out where it snaps to while it is dragged, and the drawing lays
            // it out there.
            const thisAtom = model.atoms[idx];
            // capture initial world offset for stable drag (for free move)
            const startWorld = toWorld(cx, cy);
            const offset = {
              dx: thisAtom.x - startWorld.x,
              dy: thisAtom.y - startWorld.y,
            };
            // After a second without moving, the atom follows the pointer
            // freely instead of snapping.
            let moveFree = false;
            const resetIdleTimer = () => {
              if (idleTimer.current != null) {
                window.clearTimeout(idleTimer.current);
                idleTimer.current = null;
              }
              idleTimer.current = window.setTimeout(() => {
                moveFree = true;
                try {
                  setMoveMode("free");
                } catch {}
              }, 1000) as unknown as number;
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
                  // seed moveDrag with initial pointer world position for preview
                  const p0 = toWorld(ev.clientX, ev.clientY);
                  beginMoveDrag(thisAtom.id, { x: p0.x, y: p0.y });
                }
              }
              if (cand.current.started) {
                const p = toWorld(ev.clientX, ev.clientY);
                // reset idle timer on any move
                resetIdleTimer();
                // update pointer for move preview
                updateMovePointer(p.x, p.y);
                moved = true;
              }
            };
            const onUp = (ev: PointerEvent) => {
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
              // if moved, suppress selection click
              if (moved) endedByInteractive.current = true;
              // If a drag occurred, continue suppressing single-click right after release
              if (moved) {
                try {
                  suppressDoubleClick?.(480);
                } catch {}
              }
              // Commit on drop: first try merge/replace at raw pointer position, then fallback to snap/free move
              try {
                const pEnd = toWorld(ev.clientX, ev.clientY);
                let didReplace = false;
                // 1) If dropping directly onto another atom, prefer replacement regardless of snap
                if (moved) {
                  const nearPtrId = findAtomNear(
                    pEnd.x,
                    pEnd.y,
                    NOMINAL_BOND_LENGTH * 0.4,
                    thisAtom.id
                  );
                  if (nearPtrId != null) {
                    replaceDraggedAtomWith(thisAtom.id, nearPtrId);
                    didReplace = true;
                  }
                }
                if (didReplace) {
                  // merged; nothing else to do
                } else {
                  // recompute neighbors & centers
                  const nbrs: number[] = [];
                  for (const b of model.bonds) {
                    if (b.a === thisAtom.id) nbrs.push(b.b);
                    else if (b.b === thisAtom.id) nbrs.push(b.a);
                  }
                  const degNow = nbrs.length;
                  const L = NOMINAL_BOND_LENGTH;
                  const step = Math.PI / 6;
                  const baseIdNow = degNow === 1 ? nbrs[0] : null;
                  const basePosNow =
                    degNow === 1
                      ? model.atoms.find((aa) => aa.id === baseIdNow) || null
                      : null;
                  // hubNow not needed; computeMoveSnap encapsulates snapping logic for deg>=2
                  let finalX = thisAtom.x;
                  let finalY = thisAtom.y;
                  if (!moved) {
                    // no drag
                  } else if (moveFree) {
                    // Free mode: commit exactly at the pointer to match preview
                    finalX = pEnd.x;
                    finalY = pEnd.y;
                  } else if (degNow === 1 && basePosNow) {
                    const ang = Math.atan2(
                      pEnd.y - basePosNow.y,
                      pEnd.x - basePosNow.x
                    );
                    const snap = Math.round(ang / step) * step;
                    finalX = basePosNow.x + L * Math.cos(snap);
                    finalY = basePosNow.y + L * Math.sin(snap);
                  } else if (degNow >= 2) {
                    // Unified snapping using shared utility
                    const snap = computeMoveSnap(model as any, thisAtom.id, {
                      x: pEnd.x,
                      y: pEnd.y,
                    });
                    if (
                      snap &&
                      Number.isFinite(snap.px) &&
                      Number.isFinite(snap.py)
                    ) {
                      finalX = snap.px;
                      finalY = snap.py;
                    } else {
                      finalX = pEnd.x + offset.dx;
                      finalY = pEnd.y + offset.dy;
                    }
                  } else {
                    finalX = pEnd.x + offset.dx;
                    finalY = pEnd.y + offset.dy;
                  }
                  const hitId = findAtomNear(
                    finalX,
                    finalY,
                    NOMINAL_BOND_LENGTH * 0.4,
                    thisAtom.id
                  );
                  if (hitId != null && moved) {
                    replaceDraggedAtomWith(thisAtom.id, hitId);
                  } else if (moved) {
                    moveAtom(thisAtom.id, finalX, finalY);
                  }
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
