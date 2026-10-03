import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { addsToSelection } from "../../../../lib/doc/shortcuts";
import { KEY_LIGHT_FROM, STYLE_3D, type Style3D } from "../../../../lib/chem/style3d";
import { MOV_PX } from "../constants";
import { useEditor, useEditorStore } from "../store";
import type { Molecule3D, Turn3D } from "../store/types";
import { atomAt, lookOf, partAt, poseOf, solidOf } from "../utils/molecule3d";
import { pageAt } from "../utils/page";
import { schemeAmong } from "../utils/copyPaste";
import Molecule3DView from "./Molecule3DView";

/** A turn left to itself stops below this speed, in radians a second. */
const STILL = 0.02;
/** A release this long after the last move leaves the molecule still, in ms. */
const HELD_MS = 80;
/** How far back the moves go that say how fast a molecule was turning when let go, in ms. */
const RECENT_MS = 64;

type Press = {
  /** The molecule pressed on, and with it the others selected with it. */
  id: number;
  group: number[];
  pointerId: number;
  /** Where the press began, on the screen. */
  sx: number;
  sy: number;
  /** The atom pressed on, if any: what a click chooses. */
  atom: number | null;
  moved: boolean;
};

type Gesture =
  | (Press & {
      kind: "turn";
      x: number;
      y: number;
      t: number;
      axis: THREE.Vector3;
      /** The latest moves: when, how far each turned, and in how long. */
      recent: { t: number; angle: number; dt: number }[];
    })
  | (Press & {
      kind: "move";
      from: { x: number; y: number };
      /** Where each molecule moved stood when the drag began. */
      ats: { id: number; at: { x: number; y: number } }[];
      /** The drawing selected with it, and the arrows and pluses among it: where they were. */
      drawn: {
        atoms: { id: number; x: number; y: number }[];
        arrows: { id: number; x: number; y: number }[];
        pluses: { id: number; x: number; y: number }[];
      };
      key: string;
    });

/**
 * The molecules in 3D standing on the page: drawn, lit, and worked with the
 * pointer.
 * - Hovered, a molecule's outline lights up, faintly. A drag on it turns it
 *   about its centre - and the others selected with it, each about its own -
 *   and let go it turns on a little; a drag on the rim just outside its
 *   outline, which lights up more, moves it and them on the page.
 * - A click on an atom chooses it, for a measurement, or lets it go; a
 *   click elsewhere on the molecule, or on its rim, selects it; with Ctrl
 *   (⌘ on a Mac), it is taken into the selection, or out of it.
 * The page itself never tilts, so a drawing beside it stays as drawn.
 */
export default function Molecules3D({ style = STYLE_3D }: { style?: Style3D }) {
  const molecules = useEditor((s) => s.molecules3d);
  const turns = useEditor((s) => s.turns3d);
  const frames = useEditor((s) => s.frames3d);
  const hovered = useEditor((s) => s.hovered3d);
  const sel3d = useEditor((s) => s.sel3d);
  const chosen = useEditor((s) => s.chosen3d);
  const hoveredMeasure = useEditor((s) => s.hoveredMeasure3d);
  const store = useEditorStore();
  const { camera, gl, invalidate } = useThree();
  const dom = gl.domElement as HTMLCanvasElement;
  // molecules turning on by themselves: about which axis, how fast (rad/s)
  const spins = useRef(new Map<number, { axis: THREE.Vector3; speed: number }>());
  const gesture = useRef<Gesture | null>(null);
  const [active, setActive] = useState<{ kind: Gesture["kind"]; group: number[] } | null>(null);
  // molecules taken away, shrinking out of view: as they were, and how they were turned and shown
  const [leaving, setLeaving] = useState<{ m: Molecule3D; turn: Turn3D | undefined; frame: number }[]>([]);
  const before = useRef({ molecules, turns, frames });
  useEffect(() => {
    const now = new Set(molecules.map((m) => m.id));
    const was = before.current;
    const gone = was.molecules.filter((m) => !now.has(m.id));
    if (gone.length) {
      setLeaving((l) => [...l, ...gone.map((m) => ({ m, turn: was.turns[m.id], frame: was.frames[m.id] ?? 0 }))]);
    }
    before.current = { molecules, turns, frames };
  }, [molecules, turns, frames]);
  // (one gone or going: drawn again, so the picture shows it)
  useEffect(() => {
    invalidate();
  }, [leaving, invalidate]);

  useEffect(() => {
    const pageOf = (e: PointerEvent) => {
      const r = dom.getBoundingClientRect();
      return pageAt(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1), camera);
    };
    const poseNow = (m: Molecule3D) => {
      const st = store.getState();
      return poseOf(m, solidOf(m, style), lookOf(m, style), st.turns3d[m.id], st.frames3d[m.id]);
    };
    // the molecule the pointer is on, or on the rim of: the last placed on
    // top, and on one rather than on another's rim
    const hit = (e: PointerEvent): { id: number; part: "body" | "rim" } | null => {
      const p = pageOf(e);
      const st = store.getState();
      let rim: { id: number; part: "rim" } | null = null;
      for (let i = st.molecules3d.length - 1; i >= 0; i--) {
        const m = st.molecules3d[i];
        const part = partAt(m, poseNow(m), camera.position, p.x, p.y, camera.zoom, style.bondRadius);
        if (part === "body") return { id: m.id, part };
        if (part === "rim" && !rim) rim = { id: m.id, part };
      }
      return rim;
    };
    const turnBy = (id: number, axis: THREE.Vector3, angle: number) => {
      const was = store.getState().turns3d[id];
      const q = was ? new THREE.Quaternion(...was) : new THREE.Quaternion();
      q.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, angle)).normalize();
      store.getState().setTurn3d(id, [q.x, q.y, q.z, q.w] as Turn3D);
    };
    // a click that ends a gesture is the gesture's, not the drawing's
    const swallowClick = () => {
      const swallow = (ev: Event) => ev.stopPropagation();
      window.addEventListener("click", swallow, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
    };

    // the measurement whose value the pointer is over: its box, as drawn
    const labelAt = (e: PointerEvent): { id: number; measure: number } | null => {
      const host = dom.parentElement;
      if (!host) return null;
      for (const el of host.querySelectorAll<HTMLElement>("[data-measure3d]")) {
        const r = el.getBoundingClientRect();
        if (Number(el.style.opacity || 1) < 0.5) continue;
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          const [id, measure] = (el.dataset.measure3d ?? "").split(":").map(Number);
          return { id, measure };
        }
      }
      return null;
    };

    const onMove = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g) {
        // (nothing new is hovered while a button is held for something else)
        if (e.buttons === 0) {
          store.getState().setHovered3d(hit(e));
          store.getState().setHoveredMeasure3d(labelAt(e));
        }
        return;
      }
      if (e.pointerId !== g.pointerId) return;
      e.stopPropagation();
      // (a press that has not travelled is a click's, as yet)
      if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < MOV_PX) return;
      g.moved = true;
      if (g.kind === "turn") {
        const dx = e.clientX - g.x;
        const dy = e.clientY - g.y;
        const len = Math.hypot(dx, dy);
        if (len === 0) return;
        const angle = (style.turnPerHalfWidth * len) / Math.max(dom.clientWidth / 2, 1);
        // (a drag to the right turns the near side right; down turns it down)
        const axis = new THREE.Vector3(dy, dx, 0).normalize();
        for (const id of g.group) turnBy(id, axis, angle);
        const recent = [...g.recent, { t: e.timeStamp, angle, dt: e.timeStamp - g.t }].filter(
          (r) => e.timeStamp - r.t <= RECENT_MS,
        );
        gesture.current = { ...g, x: e.clientX, y: e.clientY, t: e.timeStamp, axis, recent };
      } else {
        const p = pageOf(e);
        const dx = p.x - g.from.x;
        const dy = p.y - g.from.y;
        const by = <T extends { id: number; x: number; y: number }>(t: T) => ({ id: t.id, x: t.x + dx, y: t.y + dy });
        const solids = g.ats.map(({ id, at }) => ({ id, at: { x: at.x + dx, y: at.y + dy } }));
        // (the drawing selected with it goes with it, in the same step)
        if (g.drawn.atoms.length) {
          store.getState().moveAtoms(g.drawn.atoms.map(by), g.key, {
            arrows: g.drawn.arrows.map(by),
            pluses: g.drawn.pluses.map(by),
            molecules3d: solids,
          });
        } else store.getState().moveMolecules3d(solids, g.key);
      }
      invalidate();
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || gesture.current) return;
      const h = store.getState().hovered3d ?? hit(e);
      if (!h) return;
      const st = store.getState();
      const m = st.molecules3d.find((x) => x.id === h.id);
      if (!m) return;
      e.stopPropagation();
      try {
        dom.setPointerCapture(e.pointerId);
      } catch {}
      // the others selected with it go with it
      const group = st.sel3d.has(m.id) ? st.molecules3d.filter((x) => st.sel3d.has(x.id)).map((x) => x.id) : [m.id];
      const p = pageOf(e);
      const press: Press = {
        id: m.id,
        group,
        pointerId: e.pointerId,
        sx: e.clientX,
        sy: e.clientY,
        atom: h.part === "body" ? atomAt(poseNow(m), camera.position, p.x, p.y) : null,
        moved: false,
      };
      if (h.part === "body") {
        for (const id of group) spins.current.delete(id);
        gesture.current = {
          ...press,
          kind: "turn",
          x: e.clientX,
          y: e.clientY,
          t: e.timeStamp,
          axis: new THREE.Vector3(0, 1, 0),
          recent: [],
        };
      } else {
        // (selected with the drawing: the drawing's selection, and what is among it, too)
        const withDrawing = st.sel3d.has(m.id) && st.sel.atoms.size > 0;
        const among = withDrawing
          ? schemeAmong({ ...st.model, arrows: st.arrows, pluses: st.pluses }, st.sel.atoms)
          : { arrows: [], pluses: [] };
        gesture.current = {
          ...press,
          kind: "move",
          from: { x: p.x, y: p.y },
          ats: st.molecules3d.filter((x) => group.includes(x.id)).map((x) => ({ id: x.id, at: { ...x.at } })),
          drawn: {
            atoms: withDrawing ? st.model.atoms.filter((a) => st.sel.atoms.has(a.id)).map((a) => ({ id: a.id, x: a.x, y: a.y })) : [],
            arrows: among.arrows.map((a) => ({ id: a.id, x: a.x, y: a.y })),
            pluses: among.pluses.map((x) => ({ id: x.id, x: x.x, y: x.y })),
          },
          key: `move-3d-${m.id}-${e.timeStamp}`,
        };
      }
      setActive({ kind: gesture.current.kind, group });
    };

    const onUp = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g || e.pointerId !== g.pointerId) return;
      e.stopPropagation();
      try {
        dom.releasePointerCapture(e.pointerId);
      } catch {}
      gesture.current = null;
      setActive(null);
      const st = store.getState();
      if (!g.moved) {
        // a click: an atom chosen, or the molecule selected
        if (addsToSelection(e)) st.toggleMolecule3dSel(g.id);
        else if (g.atom != null) st.chooseAtom3d(g.id, g.atom);
        else st.selectMolecules3d([g.id]);
      } else if (g.kind === "turn") {
        // let go while still moving, it turns on as fast as it was turning
        // over the last moves, slowing as it goes
        const took = g.recent.reduce((a, r) => a + r.dt, 0);
        const speed = g.recent.reduce((a, r) => a + r.angle, 0) / (Math.max(took, 16) / 1000);
        if (e.timeStamp - g.t < HELD_MS && speed > STILL) {
          for (const id of g.group) spins.current.set(id, { axis: g.axis, speed });
        }
      }
      swallowClick();
      st.setHovered3d(hit(e));
      invalidate();
    };

    const onLeave = () => {
      if (gesture.current) return;
      store.getState().setHovered3d(null);
      store.getState().setHoveredMeasure3d(null);
    };

    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointerup", onUp);
    dom.addEventListener("pointercancel", onUp);
    dom.addEventListener("pointerleave", onLeave);
    return () => {
      dom.removeEventListener("pointermove", onMove);
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointerup", onUp);
      dom.removeEventListener("pointercancel", onUp);
      dom.removeEventListener("pointerleave", onLeave);
    };
  }, [dom, camera, store, style, invalidate]);

  // the pointer says what a drag does
  useEffect(() => {
    const cursor =
      active?.kind === "turn"
        ? "grabbing"
        : active?.kind === "move" || hovered?.part === "rim"
          ? "move"
          : hovered
            ? "grab"
            : "";
    dom.style.cursor = cursor;
  }, [dom, hovered, active]);

  // a molecule let go while turning turns on, slowing to a stop
  useFrame((_, dt) => {
    if (!spins.current.size) return;
    for (const [id, s] of spins.current) {
      const was = store.getState().turns3d[id];
      const q = was ? new THREE.Quaternion(...was) : new THREE.Quaternion();
      q.premultiply(new THREE.Quaternion().setFromAxisAngle(s.axis, s.speed * dt)).normalize();
      store.getState().setTurn3d(id, [q.x, q.y, q.z, q.w] as Turn3D);
      s.speed *= Math.pow(1 - style.turnDamping, dt * 60);
      if (s.speed < STILL) spins.current.delete(id);
    }
    invalidate();
  });

  if (!molecules.length && !leaving.length) return null;
  const litOf = (id: number): number => {
    if (active) return active.group.includes(id) ? (active.kind === "move" ? 2 : 1) : 0;
    if (hovered?.id !== id) return 0;
    return hovered.part === "rim" ? 2 : 1;
  };
  return (
    <group>
      <ambientLight intensity={style.ambientLight} />
      <directionalLight position={KEY_LIGHT_FROM as [number, number, number]} intensity={style.keyLight} />
      {molecules.map((m) => (
        <Molecule3DView
          key={m.id}
          m={m}
          style={style}
          look={lookOf(m, style)}
          frame={frames[m.id] ?? 0}
          turn={turns[m.id]}
          lit={litOf(m.id)}
          selected={sel3d.has(m.id)}
          chosen={chosen?.id === m.id ? chosen.atoms : NONE}
          following={active?.kind === "move" && active.group.includes(m.id)}
          framesOpen={hovered?.id === m.id || sel3d.has(m.id)}
          onFrame={(f) => store.getState().setFrame3d(m.id, f)}
          hoveredMeasure={hoveredMeasure?.id === m.id ? hoveredMeasure.measure : null}
        />
      ))}
      {leaving.map(({ m, turn, frame }) => (
        <Molecule3DView
          key={`leaving-${m.id}`}
          m={m}
          style={style}
          look={lookOf(m, style)}
          frame={frame}
          turn={turn}
          lit={0}
          selected={false}
          chosen={NONE}
          following={false}
          framesOpen={false}
          onFrame={() => {}}
          hoveredMeasure={null}
          leaving={() => setLeaving((l) => l.filter((x) => x.m !== m))}
        />
      ))}
    </group>
  );
}

const NONE: number[] = [];
