import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEditor, useEditorStore } from "../store";
import { ALPHA, COLORS } from "../../../theme/colors";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { lineHalfOf } from "../../../../lib/chem/layout2d";
import { ATOM_HOVER_RING_RADIUS_RATIO, DOUBLE_CLICK_MS, FREE_MS, MOV_PX } from "../constants";
import { addsToSelection } from "../../../../lib/doc/shortcuts";
import { inBox, inLasso, middleOf, turned } from "../utils/selection";
import { useDrawnLayout } from "./drawnLayoutContext";
import { squareBand } from "./bondBand";

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

/**
 * The selection, drawn and worked:
 *
 * - what is selected, shaded under the drawing;
 * - a box or a lasso being drawn to select what it holds - from empty
 *   space with Ctrl (⌘ on a Mac) held, or by a double-click there that
 *   drags; with Alt (Option) held, a lasso rather than a box;
 * - a handle above the selection that turns it about its middle, in steps
 *   of 15 degrees, or freely after a pause.
 */
export default function Selection2D() {
  const { model, sel, boxSelect } = useEditor();
  const drawn = useDrawnLayout();
  const store = useEditorStore();
  const { camera, gl, invalidate } = useThree();
  const handle = useRef<THREE.Group>(null!);

  const toWorld = (cx: number, cy: number) => {
    const rect = gl.domElement.getBoundingClientRect();
    const v = new THREE.Vector3(((cx - rect.left) / rect.width) * 2 - 1, -(((cy - rect.top) / rect.height) * 2 - 1), 0);
    v.unproject(camera);
    return { x: v.x, y: v.y };
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
      if (st.hovered.atomId != null || st.hovered.bondId != null || st.labelEdit.active) return;
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
  const mid = useMemo(() => middleOf(model, sel.atoms), [model, sel.atoms]);
  const top = useMemo(() => {
    const ys = model.atoms.filter((a) => sel.atoms.has(a.id)).map((a) => a.y);
    return ys.length ? Math.max(...ys) : 0;
  }, [model, sel.atoms]);
  const turnable = sel.atoms.size > 1 && mid != null;
  const handleAt = turnable ? { x: mid!.x, y: top + NOMINAL_BOND_LENGTH * HANDLE_ABOVE } : null;

  const startTurn = (e: PointerEvent) => {
    const st = store.getState();
    const about = middleOf(st.model, st.sel.atoms);
    if (!about) return;
    const from = st.model.atoms.filter((a) => st.sel.atoms.has(a.id)).map((a) => ({ id: a.id, x: a.x, y: a.y }));
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
      store.getState().moveAtoms(turned(from, about, angle), gesture);
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

  // the handle the same size on the screen at any zoom
  useFrame(() => {
    if (handle.current) handle.current.scale.setScalar(HANDLE_PX / Math.max((camera as THREE.OrthographicCamera).zoom, 1e-6));
  });

  // --- shading -------------------------------------------------------------
  const r = ATOM_HOVER_RING_RADIUS_RATIO * NOMINAL_BOND_LENGTH;
  const shade = overWhite(COLORS.highlight, ALPHA.highlight * SHADE);
  const byId = useMemo(() => new Map(model.atoms.map((a) => [a.id, a])), [model.atoms]);
  const shadedAtoms = model.atoms.filter((a) => sel.atoms.has(a.id));
  // The selected bonds' bands, as one shape. Each follows what its bond
  // draws, as the drawing measures it, so neither a wedge's broad end nor a
  // double bond's second line stands out past it: a plain bond's band is as
  // wide as it always was, 1.1 r across, and the others the same margin past
  // their drawing.
  const bands = useMemo(() => {
    const lineHalf = lineHalfOf(drawn.opts, drawn.zoom);
    const margin = Math.max(0, r * 0.55 - lineHalf);
    const plain = { left1: lineHalf, right1: lineHalf, left2: lineHalf, right2: lineHalf };
    const index = new Map(drawn.atoms.map((a, i) => [a.id, i]));
    const drawnBond = new Map(drawn.bonds.map((b, k) => [`${b.a1} ${b.a2}`, k]));
    const corners: number[] = [];
    for (const b of model.bonds) {
      if (!sel.bonds.has(b.id)) continue;
      const p = byId.get(b.a);
      const q = byId.get(b.b);
      if (!p || !q) continue;
      const k = drawnBond.get(`${index.get(b.a)} ${index.get(b.b)}`);
      const reach = (k != null && drawn.layout.reach[k]) || plain;
      const [c0, c1, c2, c3] = squareBand(p, q, reach, margin);
      for (const c of [c0, c1, c2, c0, c2, c3]) corners.push(c.x, c.y, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(corners, 3));
    return g;
  }, [drawn, model.bonds, sel.bonds, byId, r]);
  useEffect(() => () => bands.dispose(), [bands]);
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
      new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, p.y, 0.5))),
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
    fill.position.z = 0.49;
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
      <mesh geometry={bands} position={[0, 0, -0.045]} renderOrder={-2}>
        <meshBasicMaterial color={shade} depthWrite={false} toneMapped={false} />
      </mesh>
      {outline && <primitive object={outline.fill} />}
      {outline && <primitive object={outline.line} />}
      {handleAt && (
        <group
          ref={handle}
          position={[handleAt.x, handleAt.y, 0.6]}
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
