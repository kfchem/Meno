import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { COLORS } from "../../../theme/colors";
import { KEY_LIGHT_FROM, STYLE_3D, atomColour, type Style3D } from "../../../../lib/chem/style3d";
import { useEditor, useEditorStore } from "../store";
import type { Molecule3D, Turn3D } from "../store/types";
import { partAt, solidOf, standingHeight, WORLD_PER_ANGSTROM, type Solid } from "../utils/molecule3d";
import { pageAt } from "../utils/page";
import { PAGE_DISTANCE } from "./PageCamera";

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

/** How a molecule in 3D is lit up: not at all, hovered or turning, or about to be moved or moving. */
type Highlight = "none" | "on" | "rim";

/**
 * The molecules in 3D standing on the page: drawn, lit, and worked with the
 * pointer. Hovered, a molecule's outline lights up, faintly: a drag on it
 * turns the molecule about its centre, and let go it turns on a little; a
 * drag on the rim just outside its outline - which lights up more - moves it
 * on the page. The page itself never tilts, so a drawing beside it stays as
 * drawn.
 */
export default function Molecules3D({ style = STYLE_3D }: { style?: Style3D }) {
  const molecules = useEditor((s) => s.molecules3d);
  const turns = useEditor((s) => s.turns3d);
  const hovered = useEditor((s) => s.hovered3d);
  const store = useEditorStore();
  const { camera, gl, invalidate } = useThree();
  const dom = gl.domElement as HTMLCanvasElement;
  // molecules turning on by themselves: about which axis, how fast (rad/s)
  const spins = useRef(new Map<number, { axis: THREE.Vector3; speed: number }>());
  const gesture = useRef<Gesture | null>(null);
  const [active, setActive] = useState<{ kind: Gesture["kind"]; id: number } | null>(null);

  useEffect(() => {
    const pageOf = (e: PointerEvent) => {
      const r = dom.getBoundingClientRect();
      return pageAt(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1), camera);
    };
    // the molecule the pointer is on, or on the rim of: the last placed on
    // top, and on one rather than on another's rim
    const hit = (e: PointerEvent): { id: number; part: "body" | "rim" } | null => {
      const p = pageOf(e);
      const st = store.getState();
      let rim: { id: number; part: "rim" } | null = null;
      for (let i = st.molecules3d.length - 1; i >= 0; i--) {
        const m = st.molecules3d[i];
        const part = partAt(m, solidOf(m, style), st.turns3d[m.id], camera.position, p.x, p.y, camera.zoom, style.bondRadius);
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
      setActive({ kind: gesture.current.kind, id: m.id });
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
        }
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

  if (!molecules.length) return null;
  const highlightOf = (id: number): Highlight => {
    if (active) return active.id === id ? (active.kind === "move" ? "rim" : "on") : "none";
    if (hovered?.id !== id) return "none";
    return hovered.part === "rim" ? "rim" : "on";
  };
  return (
    <group>
      <ambientLight intensity={style.ambientLight} />
      <directionalLight position={KEY_LIGHT_FROM as [number, number, number]} intensity={style.keyLight} />
      {molecules.map((m) => (
        <Molecule3DView key={m.id} m={m} turn={turns[m.id]} style={style} highlight={highlightOf(m.id)} />
      ))}
    </group>
  );
}

/** How wide the outline's light is, in pixels: hovered, and on the rim. */
const OUTLINE_PX = { on: 1.6, rim: 2.6 } as const;
/** Its colour: the highlight laid over white - faint, and stronger on the rim. */
const OUTLINE_COLOUR = {
  on: new THREE.Color(COLORS.highlight).lerp(new THREE.Color("#ffffff"), 0.68),
  rim: new THREE.Color(COLORS.highlight).lerp(new THREE.Color("#ffffff"), 0.4),
} as const;
/** How much larger the atom under the pointer is drawn, and its spring: the 3D viewer's. */
const ATOM_SWELL = 1.1;
const SPRING = { stiffness: 150, damping: 15 };

function Molecule3DView({
  m,
  turn,
  style,
  highlight,
}: {
  m: Molecule3D;
  turn: Turn3D | undefined;
  style: Style3D;
  highlight: Highlight;
}) {
  const solid = solidOf(m, style);
  const atoms = useRef<THREE.InstancedMesh>(null!);
  const bonds = useRef<THREE.InstancedMesh>(null);
  const atomHull = useRef<THREE.InstancedMesh>(null!);
  const bondHull = useRef<THREE.InstancedMesh>(null);
  const [hoverAtom, setHoverAtom] = useState<number | null>(null);
  const { invalidate, camera } = useThree();
  const quaternion = useMemo(() => (turn ? new THREE.Quaternion(...turn) : new THREE.Quaternion()), [turn]);
  // each atom's swell, sprung: where it is, how fast it goes, where it is going
  const swell = useRef(new Map<number, { v: number; vel: number; to: number }>());
  // what the outline was last drawn for
  const drawn = useRef("");

  useLayoutEffect(() => {
    const col = new THREE.Color();
    for (let i = 0; i < solid.radii.length; i++) atoms.current.setColorAt(i, col.set(atomColour(m.atoms[i].el)));
    if (atoms.current.instanceColor) atoms.current.instanceColor.needsUpdate = true;
    placeAtoms(atoms.current, solid, swell.current, 0);
    if (bonds.current) placeBonds(bonds.current, m, solid, style.bondRadius * WORLD_PER_ANGSTROM);
    drawn.current = "";
    invalidate();
  }, [m, solid, style, invalidate]);

  // the atom under the pointer swells, and the one it leaves goes back
  useEffect(() => {
    for (const [i, s] of swell.current) s.to = i === hoverAtom ? ATOM_SWELL : 1;
    if (hoverAtom != null && !swell.current.has(hoverAtom)) swell.current.set(hoverAtom, { v: 1, vel: 0, to: ATOM_SWELL });
    invalidate();
  }, [hoverAtom, invalidate]);

  useFrame((_, dt) => {
    let moving = false;
    if (swell.current.size) {
      const step = Math.min(dt, 1 / 30);
      for (const [i, s] of swell.current) {
        const force = -SPRING.stiffness * (s.v - s.to) - SPRING.damping * s.vel;
        s.vel += force * step;
        s.v += s.vel * step;
        if (Math.abs(s.v - s.to) < 1e-3 && Math.abs(s.vel) < 1e-3) {
          s.v = s.to;
          s.vel = 0;
          if (s.to === 1) swell.current.delete(i);
        } else moving = true;
      }
      placeAtoms(atoms.current, solid, swell.current, 0);
    }
    // the outline, as wide in pixels whatever the zoom
    if (highlight !== "none") {
      const depth = PAGE_DISTANCE / Math.max(PAGE_DISTANCE - standingHeight(solid), 1);
      const w = OUTLINE_PX[highlight] / (camera.zoom * depth);
      const key = `${highlight},${w}`;
      if (key !== drawn.current || moving || swell.current.size) {
        drawn.current = key;
        placeAtoms(atomHull.current, solid, swell.current, w);
        if (bondHull.current) placeBonds(bondHull.current, m, solid, style.bondRadius * WORLD_PER_ANGSTROM + w);
        (atomHull.current.material as THREE.MeshBasicMaterial).color.copy(OUTLINE_COLOUR[highlight]);
        if (bondHull.current) (bondHull.current.material as THREE.MeshBasicMaterial).color.copy(OUTLINE_COLOUR[highlight]);
      }
    }
    if (moving) invalidate();
  });

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
      {/* The outline: the molecule drawn a little larger, before it and under
          it - what shows is a thin rim of light round its outline only, none
          where one part of it passes in front of another. */}
      <instancedMesh
        ref={atomHull}
        args={[undefined, undefined, m.atoms.length]}
        renderOrder={OVER_PAGE - 1}
        frustumCulled={false}
        visible={highlight !== "none"}
        raycast={() => {}}
      >
        <sphereGeometry args={[1, style.ballSegments, style.ballSegments]} />
        <meshBasicMaterial transparent opacity={1} depthWrite={false} toneMapped={false} />
      </instancedMesh>
      {style.atoms === "balls" && m.bonds.length > 0 && (
        <instancedMesh
          ref={bondHull}
          args={[undefined, undefined, m.bonds.length]}
          renderOrder={OVER_PAGE - 1}
          frustumCulled={false}
          visible={highlight !== "none"}
          raycast={() => {}}
        >
          <cylinderGeometry args={[1, 1, 1, style.bondSegments]} />
          <meshBasicMaterial transparent opacity={1} depthWrite={false} toneMapped={false} />
        </instancedMesh>
      )}
    </group>
  );
}

const mtx = new THREE.Matrix4();

/** Each atom's ball where it is, swollen as it is, and `extra` larger all round. */
function placeAtoms(mesh: THREE.InstancedMesh, solid: Solid, swell: Map<number, { v: number }>, extra: number) {
  for (let i = 0; i < solid.radii.length; i++) {
    const r = solid.radii[i] * (swell.get(i)?.v ?? 1) + extra;
    mtx.makeScale(r, r, r).setPosition(solid.local[3 * i], solid.local[3 * i + 1], solid.local[3 * i + 2]);
    mesh.setMatrixAt(i, mtx);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}

/** Each bond a cylinder of radius `r` from atom to atom. */
function placeBonds(mesh: THREE.InstancedMesh, m: Molecule3D, solid: Solid, r: number) {
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  m.bonds.forEach((bond, k) => {
    a.fromArray(solid.local, 3 * bond.a1);
    b.fromArray(solid.local, 3 * bond.a2);
    const len = a.distanceTo(b);
    q.setFromUnitVectors(up, b.clone().sub(a).normalize());
    mtx.compose(a.clone().add(b).multiplyScalar(0.5), q, s.set(r, len, r));
    mesh.setMatrixAt(k, mtx);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}
