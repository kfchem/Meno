import * as THREE from "three";
import { pageAt } from "../utils/page";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEditor, useEditorStore } from "../store";
import { ALPHA, COLORS } from "../../../theme/colors";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { ATOM_HOVER_RING_RADIUS_RATIO, DOUBLE_CLICK_MS, FREE_MS, MOV_PX } from "../constants";
import { addsToSelection } from "../../../../lib/doc/shortcuts";
import { inBox, inLasso, middleOf, molecules3dIn, turned } from "../utils/selection";
import { STYLE_3D } from "../../../../lib/chem/style3d";
import { lookOf, poseOf, seenBounds, solidOf, standingHeight, turnedInPlane, turnedTogether, type Turning3D } from "../utils/molecule3d";
import { PAGE_DISTANCE } from "../utils/page";
import type { Model, Molecule3D, Turn3D } from "../store/types";

/** How far above the selection its turning handle stands, as a share of a bond. */
const HANDLE_ABOVE = 0.75;
/** The handle's radius on the screen, in px, and how far off it a press still takes it. */
const HANDLE_PX = 6;
const HANDLE_HIT = 2;
/** Turning snaps to steps of this many degrees, until a pause lets it go. */
const TURN_STEP = 15;
/** How strongly what is selected is shaded, against the hover highlight's. */
const SHADE = 0.45;

/**
 * The highlight laid over the white page at `alpha`, as one opaque colour:
 * where an atom's shading meets its bonds' it is no darker than elsewhere.
 */
function overWhite(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(255 + (c - 255) * alpha);
  const [r, g, b] = [mix((n >> 16) & 255), mix((n >> 8) & 255), mix(n & 255)];
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** A molecule in 3D as a turn takes it, turned as it is now. */
const turningOf =
  (turns: Record<number, Turn3D>) =>
  (m: Molecule3D): Turning3D => {
    const solid = solidOf(m, STYLE_3D);
    return { id: m.id, at: m.at, turn: turns[m.id], standing: standingHeight(solid, lookOf(m, STYLE_3D)) };
  };

/**
 * How far the selection reaches on the page, the drawing's atoms and the
 * molecules in 3D - each as it is turned and shown now, seen from straight
 * above it - and its middle; null with nothing selected.
 */
function selectionExtent(
  model: Model,
  atoms: ReadonlySet<number>,
  molecules: readonly Molecule3D[],
  sel3d: ReadonlySet<number>,
  turns: Record<number, Turn3D>,
  frames: Record<number, number>,
): { mid: { x: number; y: number }; top: number } | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const a of model.atoms) {
    if (!atoms.has(a.id)) continue;
    xs.push(a.x);
    ys.push(a.y);
  }
  for (const m of molecules) {
    if (!sel3d.has(m.id)) continue;
    const b = seenBounds(poseOf(m, solidOf(m, STYLE_3D), lookOf(m, STYLE_3D), turns[m.id], frames[m.id]), PAGE_DISTANCE);
    xs.push(b.minX, b.maxX);
    ys.push(b.minY, b.maxY);
  }
  if (!xs.length) return null;
  // (the drawing alone: its atoms' middle, as ever)
  const mid = sel3d.size ? { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 } : middleOf(model, atoms);
  return mid ? { mid, top: Math.max(...ys) } : null;
}

/**
 * The selection, drawn and worked:
 *
 * - what is selected, shaded under the drawing;
 * - a box or a lasso being drawn to select what it holds - from empty
 *   space with Ctrl (⌘ on a Mac) held, or by a double-click there that
 *   drags; with Alt (Option) held, a lasso rather than a box;
 * - a handle above the selection that turns it about its middle, in steps
 *   of 15 degrees, or freely after a pause. Molecules in 3D selected alone
 *   it turns as one body, in 3D - as a drag on a molecule turns it - about
 *   their common centre; selected with the drawing, they are carried round
 *   in its plane and turned with it. With Shift, each molecule turns about
 *   its own centre instead, and the drawing stays.
 */
export default function Selection2D() {
  const { model, sel, boxSelect } = useEditor();
  const sel3d = useEditor((s) => s.sel3d);
  const molecules3d = useEditor((s) => s.molecules3d);
  const turns3d = useEditor((s) => s.turns3d);
  const frames3d = useEditor((s) => s.frames3d);
  // where the handle stood when a turn in 3D took it: it stays there till let go
  const [held, setHeld] = useState<{ mid: { x: number; y: number }; top: number } | null>(null);
  const store = useEditorStore();
  const { camera, gl, invalidate } = useThree();
  const handle = useRef<THREE.Group>(null!);

  const toWorld = (cx: number, cy: number) => {
    const rect = gl.domElement.getBoundingClientRect();
    const v = new THREE.Vector3(((cx - rect.left) / rect.width) * 2 - 1, -(((cy - rect.top) / rect.height) * 2 - 1), 0);
    const p = pageAt(v.x, v.y, camera);
    return { x: p.x, y: p.y };
  };

  // --- a box or a lasso ----------------------------------------------------
  useEffect(() => {
    // on the canvas's container, capturing: ahead of the view's own pan and
    // of the drawing's own handlers
    const host = gl.domElement.parentElement ?? gl.domElement;
    // the last press on nothing that was not a drag: a second press soon
    // after it, near it, is a double-click's
    let lastEmpty = { t: -Infinity, x: 0, y: 0 };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || e.target !== gl.domElement) return;
      const st = store.getState();
      if (st.hovered.atomId != null || st.hovered.bondId != null || st.hovered3d || st.labelEdit.active) return;
      const add = addsToSelection(e);
      const second =
        e.timeStamp - lastEmpty.t <= DOUBLE_CLICK_MS && Math.hypot(e.clientX - lastEmpty.x, e.clientY - lastEmpty.y) < 8;
      const sx = e.clientX;
      const sy = e.clientY;
      if (!add && !second) {
        // (a pan is no first click)
        lastEmpty = { t: e.timeStamp, x: sx, y: sy };
        const onFirstUp = (ev: PointerEvent) => {
          window.removeEventListener("pointerup", onFirstUp, true);
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) >= MOV_PX) lastEmpty = { t: -Infinity, x: 0, y: 0 };
        };
        window.addEventListener("pointerup", onFirstUp, true);
        return;
      }
      lastEmpty = { t: -Infinity, x: 0, y: 0 };
      const kind = e.altKey ? "lasso" : "box";
      const start = toWorld(sx, sy);
      let moved = false;
      let points = [start];
      // the drag is the box's, not the view's
      st.beginPanHold(e.pointerId);
      const onMove = (ev: PointerEvent) => {
        if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < MOV_PX) return;
        moved = true;
        const p = toWorld(ev.clientX, ev.clientY);
        if (kind === "box") points = [start, p];
        else {
          const last = points[points.length - 1];
          if (Math.hypot(p.x - last.x, p.y - last.y) > NOMINAL_BOND_LENGTH * 0.05) points = [...points, p];
        }
        store.getState().setBoxSelect({ active: true, kind, points });
        invalidate();
      };
      const onUp = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp, true);
        const s = store.getState();
        s.endPanHold(ev.pointerId);
        if (!moved) return; // a double-click, not dragged, draws its bond as ever
        s.setBoxSelect({ active: false, kind, points: [] });
        invalidate();
        const got = kind === "box" ? inBox(s.model, points[0], points[1]) : inLasso(s.model, points);
        const atoms = add ? new Set([...s.sel.atoms, ...got.atoms]) : got.atoms;
        const bonds = add ? new Set([...s.sel.bonds, ...got.bonds]) : got.bonds;
        const taken = [...got.atoms];
        // (the molecules in 3D whose centres it takes, with the drawing)
        s.selectMolecules3d(molecules3dIn(s.molecules3d, kind, points), add);
        s.setSel({ atoms, bonds }, taken.length ? taken[taken.length - 1] : s.selAnchor);
        // the box's end is no double-click's, and no click on nothing
        s.suppressDoubleClick(DOUBLE_CLICK_MS);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp, true);
    };
    host.addEventListener("pointerdown", onDown, true);
    return () => host.removeEventListener("pointerdown", onDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, camera, store, invalidate]);

  // --- turning -------------------------------------------------------------
  const extent = useMemo(
    () => held ?? selectionExtent(model, sel.atoms, molecules3d, sel3d, turns3d, frames3d),
    [held, model, sel.atoms, molecules3d, sel3d, turns3d, frames3d],
  );
  const turnable = extent != null && (sel.atoms.size > 1 || sel3d.size > 0);
  const handleAt = turnable ? { x: extent!.mid.x, y: extent!.top + NOMINAL_BOND_LENGTH * HANDLE_ABOVE } : null;

  const startTurn = (e: PointerEvent) => {
    const st = store.getState();
    const molecules = st.molecules3d.filter((m) => st.sel3d.has(m.id));
    // molecules alone, or with Shift: turned in 3D, as a drag on one turns it
    if (molecules.length && (e.shiftKey || !st.sel.atoms.size)) {
      turnInSpace(e, molecules, e.shiftKey);
      return;
    }
    const about = selectionExtent(st.model, st.sel.atoms, st.molecules3d, st.sel3d, st.turns3d, st.frames3d)?.mid;
    if (!about) return;
    const from = st.model.atoms.filter((a) => st.sel.atoms.has(a.id)).map((a) => ({ id: a.id, x: a.x, y: a.y }));
    const carried = molecules.map(turningOf(st.turns3d));
    const p0 = toWorld(e.clientX, e.clientY);
    const a0 = Math.atan2(p0.y - about.y, p0.x - about.x);
    const gesture = `turn-${performance.now()}`;
    let free = false;
    let pause: number | null = null;
    let frame: number | null = null;
    let last = p0;
    st.beginPanHold(e.pointerId);
    st.suppressDoubleClick(DOUBLE_CLICK_MS);
    const apply = () => {
      frame = null;
      const a = Math.atan2(last.y - about.y, last.x - about.x) - a0;
      const step = (TURN_STEP * Math.PI) / 180;
      const angle = free ? a : Math.round(a / step) * step;
      // (molecules with the drawing: carried round in its plane, and turned with it)
      if (carried.length) store.getState().turnMolecules3d(turnedInPlane(carried, about, angle), gesture, turned(from, about, angle));
      else store.getState().moveAtoms(turned(from, about, angle), gesture);
    };
    const onMove = (ev: PointerEvent) => {
      last = toWorld(ev.clientX, ev.clientY);
      // (one turn a frame: every turn lays the drawing out again)
      if (frame == null) frame = window.requestAnimationFrame(apply);
      if (pause != null) window.clearTimeout(pause);
      pause = window.setTimeout(() => {
        free = true;
        apply();
      }, FREE_MS);
    };
    const onUp = (ev: PointerEvent) => {
      if (pause != null) window.clearTimeout(pause);
      if (frame != null) {
        window.cancelAnimationFrame(frame);
        apply();
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
      const s = store.getState();
      s.endPanHold(ev.pointerId);
      // (and its end is no click on nothing, which would let it go)
      s.suppressDoubleClick(DOUBLE_CLICK_MS);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, true);
  };

  /**
   * Molecules in 3D turned by the handle in space, as a drag on one turns
   * it: as one body about their common centre - which moves them - or,
   * `each`, every one about its own centre. Either is one undo step, which
   * puts the turns back (a drag on a molecule itself turns only the view).
   */
  const turnInSpace = (e: PointerEvent, molecules: Molecule3D[], each: boolean) => {
    const st = store.getState();
    const from = molecules.map(turningOf(st.turns3d));
    const turnsBefore = Object.fromEntries(molecules.map((m) => [m.id, st.turns3d[m.id]]));
    const inPlace = each || from.length === 1;
    let went = false;
    const gesture = `turn-3d-${performance.now()}`;
    const q = new THREE.Quaternion();
    setHeld(selectionExtent(st.model, st.sel.atoms, st.molecules3d, st.sel3d, st.turns3d, st.frames3d));
    let last = { x: e.clientX, y: e.clientY };
    let frame: number | null = null;
    st.beginPanHold(e.pointerId);
    st.suppressDoubleClick(DOUBLE_CLICK_MS);
    const apply = () => {
      frame = null;
      went = true;
      const s = store.getState();
      if (inPlace) {
        for (const m of from) {
          const t = q.clone().multiply(m.turn ? new THREE.Quaternion(...m.turn) : new THREE.Quaternion()).normalize();
          s.setTurn3d(m.id, [t.x, t.y, t.z, t.w]);
        }
      } else s.turnMolecules3d(turnedTogether(from, q), gesture);
      invalidate();
    };
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - last.x;
      const dy = ev.clientY - last.y;
      last = { x: ev.clientX, y: ev.clientY };
      const len = Math.hypot(dx, dy);
      if (len === 0) return;
      // (a drag to the right turns the near side right; down turns it down)
      const angle = (STYLE_3D.turnPerHalfWidth * len) / Math.max(gl.domElement.clientWidth / 2, 1);
      q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(dy, dx, 0).normalize(), angle)).normalize();
      if (frame == null) frame = window.requestAnimationFrame(apply);
    };
    const onUp = (ev: PointerEvent) => {
      if (frame != null) {
        window.cancelAnimationFrame(frame);
        apply();
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
      setHeld(null);
      const s = store.getState();
      s.endPanHold(ev.pointerId);
      s.suppressDoubleClick(DOUBLE_CLICK_MS);
      if (inPlace && went) s.keepTurns3d(turnsBefore, Object.fromEntries(from.map((m) => [m.id, s.turns3d[m.id]])));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, true);
  };

  // the handle the same size on the screen at any zoom
  useFrame(() => {
    if (handle.current) handle.current.scale.setScalar(HANDLE_PX / Math.max((camera as THREE.PerspectiveCamera).zoom, 1e-6));
  });

  // --- shading -------------------------------------------------------------
  const r = ATOM_HOVER_RING_RADIUS_RATIO * NOMINAL_BOND_LENGTH;
  const shade = overWhite(COLORS.highlight, ALPHA.highlight * SHADE);
  const byId = useMemo(() => new Map(model.atoms.map((a) => [a.id, a])), [model.atoms]);
  const shadedBonds = model.bonds.filter((b) => sel.bonds.has(b.id));
  const shadedAtoms = model.atoms.filter((a) => sel.atoms.has(a.id));
  // the box or the lasso being drawn: a pale fill inside a line
  const outline = useMemo(() => {
    if (!boxSelect.active || boxSelect.points.length < 2) return null;
    const pts =
      boxSelect.kind === "box"
        ? [
            boxSelect.points[0],
            { x: boxSelect.points[1].x, y: boxSelect.points[0].y },
            boxSelect.points[1],
            { x: boxSelect.points[0].x, y: boxSelect.points[1].y },
          ]
        : boxSelect.points;
    const line = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, p.y, 0.005))),
      new THREE.LineBasicMaterial({ color: COLORS.highlight, depthTest: false, toneMapped: false }),
    );
    line.renderOrder = 40;
    const fill = new THREE.Mesh(
      new THREE.ShapeGeometry(new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, p.y)))),
      new THREE.MeshBasicMaterial({
        color: COLORS.highlight,
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    fill.position.z = 0.004;
    fill.renderOrder = 39;
    return { line, fill };
  }, [boxSelect]);
  useEffect(
    () => () => {
      for (const o of outline ? [outline.line, outline.fill] : []) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    },
    [outline],
  );

  return (
    <group>
      {shadedAtoms.map((a) => (
        <mesh key={`sa-${a.id}`} position={[a.x, a.y, -0.04]} renderOrder={-2}>
          <circleGeometry args={[r, 32]} />
          <meshBasicMaterial color={shade} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      {shadedBonds.map((b) => {
        const p = byId.get(b.a);
        const q = byId.get(b.b);
        if (!p || !q) return null;
        const len = Math.hypot(q.x - p.x, q.y - p.y);
        return (
          <mesh
            key={`sb-${b.id}`}
            position={[(p.x + q.x) / 2, (p.y + q.y) / 2, -0.045]}
            rotation={[0, 0, Math.atan2(q.y - p.y, q.x - p.x)]}
            renderOrder={-2}
          >
            <planeGeometry args={[len, r * 1.1]} />
            <meshBasicMaterial color={shade} depthWrite={false} toneMapped={false} />
          </mesh>
        );
      })}
      {outline && <primitive object={outline.fill} />}
      {outline && <primitive object={outline.line} />}
      {handleAt && (
        <group
          ref={handle}
          position={[handleAt.x, handleAt.y, 0.006]}
          onPointerDown={(e) => {
            if ((e.nativeEvent?.button ?? 0) !== 0) return;
            e.stopPropagation();
            startTurn(e.nativeEvent);
          }}
        >
          {/* (what a press takes, wider than what is seen) */}
          <mesh>
            <circleGeometry args={[HANDLE_HIT, 24]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
          <mesh renderOrder={41}>
            <circleGeometry args={[1, 24]} />
            <meshBasicMaterial color="#ffffff" depthTest={false} toneMapped={false} />
          </mesh>
          <mesh renderOrder={42}>
            <ringGeometry args={[0.68, 1, 24]} />
            <meshBasicMaterial color={COLORS.highlight} depthTest={false} toneMapped={false} />
          </mesh>
        </group>
      )}
    </group>
  );
}
