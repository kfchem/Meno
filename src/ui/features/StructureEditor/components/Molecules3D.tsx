import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { COLORS } from "../../../theme/colors";
import { KEY_LIGHT_FROM, STYLE_3D, atomColour, type Style3D } from "../../../../lib/chem/style3d";
import { useEditor, useEditorStore } from "../store";
import type { Molecule3D, Turn3D } from "../store/types";
import {
  footprint,
  frameOf,
  partOfFrame,
  solidOf,
  standingHeight,
  WORLD_PER_ANGSTROM,
  type Rect,
} from "../utils/molecule3d";
import { pageAt } from "../utils/page";

/**
 * Drawn after everything on the page, and depth-tested: what stands off the
 * page is never covered by what lies on it, whatever order that is drawn in.
 */
const OVER_PAGE = 100;
/** A turn left to itself stops below this speed, in radians a second. */
const STILL = 0.02;
/** A release this long after the last move leaves the molecule still, in ms. */
const HELD_MS = 80;
/** How far back the moves go that say how fast a molecule was turning when let go, in ms. */
const RECENT_MS = 64;

type Gesture =
  | {
      kind: "turn";
      id: number;
      pointerId: number;
      x: number;
      y: number;
      t: number;
      axis: THREE.Vector3;
      /** The latest moves: when, how far each turned, and in how long. */
      recent: { t: number; angle: number; dt: number }[];
      moved: boolean;
    }
  | {
      kind: "move";
      id: number;
      pointerId: number;
      from: { x: number; y: number };
      at: { x: number; y: number };
      key: string;
      moved: boolean;
    };

/**
 * The molecules in 3D standing on the page: drawn, lit, and worked with the
 * pointer. Hovered, a molecule shows its frame: a drag within it turns the
 * molecule about its centre, and it goes on turning a little when let go; a
 * drag on the frame's edge moves it on the page. The page itself never
 * tilts, so a drawing beside it stays as drawn.
 */
export default function Molecules3D({ style = STYLE_3D }: { style?: Style3D }) {
  const molecules = useEditor((s) => s.molecules3d);
  const turns = useEditor((s) => s.turns3d);
  const hovered = useEditor((s) => s.hovered3d);
  const store = useEditorStore();
  const { camera, gl, invalidate } = useThree();
  const dom = gl.domElement as HTMLCanvasElement;
  // a turning molecule's frame stays as it was when the turn began
  const frozen = useRef(new Map<number, Rect>());
  // molecules turning on by themselves: about which axis, how fast (rad/s)
  const spins = useRef(new Map<number, { axis: THREE.Vector3; speed: number }>());
  const gesture = useRef<Gesture | null>(null);
  const [active, setActive] = useState<Gesture["kind"] | null>(null);

  const frameFor = (m: Molecule3D): Rect =>
    frozen.current.get(m.id) ??
    frameOf(footprint(m, solidOf(m, style), store.getState().turns3d[m.id], camera.position), camera.zoom);

  useEffect(() => {
    const pageOf = (e: PointerEvent) => {
      const r = dom.getBoundingClientRect();
      return pageAt(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1), camera);
    };
    // the molecule whose frame the pointer is in, the last placed on top
    const hit = (e: PointerEvent): { id: number; part: "body" | "edge" } | null => {
      const p = pageOf(e);
      const ms = store.getState().molecules3d;
      for (let i = ms.length - 1; i >= 0; i--) {
        const part = partOfFrame(frameFor(ms[i]), p.x, p.y, camera.zoom);
        if (part) return { id: ms[i].id, part };
      }
      return null;
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

    const onMove = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g) {
        // (nothing new is hovered while a button is held for something else)
        if (e.buttons === 0) store.getState().setHovered3d(hit(e));
        return;
      }
      if (e.pointerId !== g.pointerId) return;
      e.stopPropagation();
      if (g.kind === "turn") {
        const dx = e.clientX - g.x;
        const dy = e.clientY - g.y;
        const len = Math.hypot(dx, dy);
        if (len === 0) return;
        const angle = (style.turnPerHalfWidth * len) / Math.max(dom.clientWidth / 2, 1);
        // (a drag to the right turns the near side right; down turns it down)
        const axis = new THREE.Vector3(dy, dx, 0).normalize();
        turnBy(g.id, axis, angle);
        const recent = [...g.recent, { t: e.timeStamp, angle, dt: e.timeStamp - g.t }].filter(
          (r) => e.timeStamp - r.t <= RECENT_MS,
        );
        gesture.current = { ...g, x: e.clientX, y: e.clientY, t: e.timeStamp, axis, recent, moved: true };
      } else {
        const p = pageOf(e);
        store.getState().moveMolecule3d(g.id, { x: g.at.x + p.x - g.from.x, y: g.at.y + p.y - g.from.y }, g.key);
        gesture.current = { ...g, moved: true };
      }
      invalidate();
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || gesture.current) return;
      const h = store.getState().hovered3d ?? hit(e);
      if (!h) return;
      const m = store.getState().molecules3d.find((x) => x.id === h.id);
      if (!m) return;
      e.stopPropagation();
      try {
        dom.setPointerCapture(e.pointerId);
      } catch {}
      if (h.part === "body") {
        frozen.current.set(m.id, frameFor(m));
        spins.current.delete(m.id);
        gesture.current = {
          kind: "turn",
          id: m.id,
          pointerId: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          t: e.timeStamp,
          axis: new THREE.Vector3(0, 1, 0),
          recent: [],
          moved: false,
        };
      } else {
        const p = pageOf(e);
        gesture.current = {
          kind: "move",
          id: m.id,
          pointerId: e.pointerId,
          from: { x: p.x, y: p.y },
          at: { ...m.at },
          key: `move-3d-${m.id}-${e.timeStamp}`,
          moved: false,
        };
      }
      setActive(gesture.current.kind);
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
      if (g.kind === "turn") {
        // let go while still moving, it turns on as fast as it was turning
        // over the last moves, slowing as it goes
        const took = g.recent.reduce((a, r) => a + r.dt, 0);
        const speed = g.recent.reduce((a, r) => a + r.angle, 0) / (Math.max(took, 16) / 1000);
        if (g.moved && e.timeStamp - g.t < HELD_MS && speed > STILL) {
          spins.current.set(g.id, { axis: g.axis, speed });
        } else frozen.current.delete(g.id);
      }
      swallowClick();
      store.getState().setHovered3d(hit(e));
      invalidate();
    };

    const onLeave = () => {
      if (!gesture.current) store.getState().setHovered3d(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dom, camera, store, style, invalidate]);

  // the pointer says what a drag would do
  useEffect(() => {
    const cursor = active === "turn" ? "grabbing" : active === "move" ? "move" : hovered?.part === "edge" ? "move" : hovered ? "grab" : "";
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
      if (s.speed < STILL) {
        spins.current.delete(id);
        frozen.current.delete(id);
      }
    }
    invalidate();
  });

  if (!molecules.length) return null;
  const framed = molecules.find((m) => m.id === (gesture.current?.id ?? hovered?.id));
  return (
    <group>
      <ambientLight intensity={style.ambientLight} />
      <directionalLight position={KEY_LIGHT_FROM as [number, number, number]} intensity={style.keyLight} />
      {molecules.map((m) => (
        <Molecule3DView key={m.id} m={m} turn={turns[m.id]} style={style} />
      ))}
      {framed && (
        <Frame
          frameFor={() => frameFor(framed)}
          strong={active === "move" || (!active && hovered?.part === "edge")}
        />
      )}
    </group>
  );
}

function Molecule3DView({ m, turn, style }: { m: Molecule3D; turn: Turn3D | undefined; style: Style3D }) {
  const solid = solidOf(m, style);
  const atoms = useRef<THREE.InstancedMesh>(null!);
  const bonds = useRef<THREE.InstancedMesh>(null);
  const [hoverAtom, setHoverAtom] = useState<number | null>(null);
  const invalidate = useThree((s) => s.invalidate);
  const quaternion = useMemo(() => (turn ? new THREE.Quaternion(...turn) : new THREE.Quaternion()), [turn]);

  useLayoutEffect(() => {
    const mtx = new THREE.Matrix4();
    const col = new THREE.Color();
    const n = solid.radii.length;
    for (let i = 0; i < n; i++) {
      // (an atom under the pointer a little larger, as the 3D viewer had it)
      const r = solid.radii[i] * (i === hoverAtom ? 1.1 : 1);
      mtx.makeScale(r, r, r).setPosition(solid.local[3 * i], solid.local[3 * i + 1], solid.local[3 * i + 2]);
      atoms.current.setMatrixAt(i, mtx);
      atoms.current.setColorAt(i, col.set(atomColour(m.atoms[i].el)));
    }
    atoms.current.instanceMatrix.needsUpdate = true;
    if (atoms.current.instanceColor) atoms.current.instanceColor.needsUpdate = true;
    atoms.current.computeBoundingSphere();
    if (bonds.current) {
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3();
      const r = style.bondRadius * WORLD_PER_ANGSTROM;
      m.bonds.forEach((bond, k) => {
        a.fromArray(solid.local, 3 * bond.a1);
        b.fromArray(solid.local, 3 * bond.a2);
        const len = a.distanceTo(b);
        q.setFromUnitVectors(up, b.clone().sub(a).normalize());
        mtx.compose(a.clone().add(b).multiplyScalar(0.5), q, s.set(r, len, r));
        bonds.current!.setMatrixAt(k, mtx);
      });
      bonds.current.instanceMatrix.needsUpdate = true;
      bonds.current.computeBoundingSphere();
    }
    invalidate();
  }, [m, solid, hoverAtom, style, invalidate]);

  return (
    <group position={[m.at.x, m.at.y, standingHeight(solid)]} quaternion={quaternion}>
      <instancedMesh
        ref={atoms}
        args={[undefined, undefined, m.atoms.length]}
        renderOrder={OVER_PAGE}
        frustumCulled={false}
        onPointerMove={(e) => {
          e.stopPropagation();
          if (e.instanceId != null && e.instanceId !== hoverAtom) setHoverAtom(e.instanceId);
        }}
        onPointerOut={() => setHoverAtom(null)}
      >
        <sphereGeometry args={[1, style.ballSegments, style.ballSegments]} />
        <meshStandardMaterial roughness={style.roughness} metalness={style.metalness} transparent opacity={1} />
      </instancedMesh>
      {style.atoms === "balls" && m.bonds.length > 0 && (
        <instancedMesh ref={bonds} args={[undefined, undefined, m.bonds.length]} renderOrder={OVER_PAGE} frustumCulled={false}>
          <cylinderGeometry args={[1, 1, 1, style.bondSegments]} />
          <meshStandardMaterial
            color={style.bondColor}
            roughness={style.roughness}
            metalness={style.metalness}
            transparent
            opacity={1}
          />
        </instancedMesh>
      )}
    </group>
  );
}

/** How wide the frame is drawn, and its corners' radius, in pixels. */
const FRAME_PX = 1.5;
const FRAME_STRONG_PX = 2.5;
const CORNER_PX = 10;

function roundedRect(r: Rect, radius: number): THREE.Shape {
  const s = new THREE.Shape();
  const k = Math.min(radius, (r.maxX - r.minX) / 2, (r.maxY - r.minY) / 2);
  s.moveTo(r.minX + k, r.minY);
  s.lineTo(r.maxX - k, r.minY);
  s.quadraticCurveTo(r.maxX, r.minY, r.maxX, r.minY + k);
  s.lineTo(r.maxX, r.maxY - k);
  s.quadraticCurveTo(r.maxX, r.maxY, r.maxX - k, r.maxY);
  s.lineTo(r.minX + k, r.maxY);
  s.quadraticCurveTo(r.minX, r.maxY, r.minX, r.maxY - k);
  s.lineTo(r.minX, r.minY + k);
  s.quadraticCurveTo(r.minX, r.minY, r.minX + k, r.minY);
  return s;
}

/** The light frame round the molecule under the pointer, on the page. */
function Frame({ frameFor, strong }: { frameFor: () => Rect; strong: boolean }) {
  const mesh = useRef<THREE.Mesh>(null!);
  const camera = useThree((s) => s.camera);
  const seen = useRef("");
  useFrame(() => {
    const r = frameFor();
    const zoom = camera.zoom;
    const key = `${r.minX},${r.minY},${r.maxX},${r.maxY},${zoom},${strong}`;
    if (key === seen.current) return;
    seen.current = key;
    const w = (strong ? FRAME_STRONG_PX : FRAME_PX) / zoom;
    const corner = CORNER_PX / zoom;
    const outer = roundedRect({ minX: r.minX - w / 2, minY: r.minY - w / 2, maxX: r.maxX + w / 2, maxY: r.maxY + w / 2 }, corner + w / 2);
    outer.holes.push(roundedRect({ minX: r.minX + w / 2, minY: r.minY + w / 2, maxX: r.maxX - w / 2, maxY: r.maxY - w / 2 }, Math.max(corner - w / 2, 0)));
    const old = mesh.current.geometry;
    mesh.current.geometry = new THREE.ShapeGeometry(outer, 6);
    old.dispose();
  });
  useEffect(() => () => mesh.current?.geometry.dispose(), []);
  return (
    <mesh ref={mesh} position={[0, 0, 0.003]} renderOrder={43}>
      <bufferGeometry />
      <meshBasicMaterial
        color={COLORS.highlight}
        transparent
        opacity={strong ? 0.85 : 0.45}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}
