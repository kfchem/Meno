import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { COLORS } from "../../../theme/colors";
import { atomColour, type Style3D } from "../../../../lib/chem/style3d";
import type { Look3D, Measure3D, Molecule3D, Turn3D } from "../store/types";
import { bondLines, frameOf, linesOf, solidOf, WORLD_PER_ANGSTROM, type BondLine } from "../utils/molecule3d";
import { kindOf, measureMarks, measureText, measureValue } from "../utils/measure3d";
import { PAGE_DISTANCE } from "./PageCamera";
import Frames3D from "./Frames3D";

/**
 * Drawn after everything on the page, and depth-tested: what stands off the
 * page is never covered by what lies on it, whatever order that is drawn in.
 */
export const OVER_PAGE = 100;

/**
 * The outline's light, by how lit the molecule is - 0 not at all, 1 hovered
 * or turning, 2 on the rim or moving: how wide, in pixels, and how much of
 * the highlight it takes. Between them it goes over smoothly. Selected, it
 * has a broad, pale outline as well, the selection's shade.
 */
const OUTLINE_PX = [0, 1.6, 2.6];
const OUTLINE_BLUE = [0, 0.32, 0.6];
const SELECTED_PX = 5;
const SELECTED_BLUE = 0.27;
/** A chosen atom's ring: how wide, in pixels, and how much of the highlight it takes. */
const CHOSEN_PX = 3.2;
const CHOSEN_BLUE = 0.75;
const outlineAt = (level: number, table: number[]) => {
  const i = Math.min(Math.floor(level), table.length - 2);
  return table[i] + (table[i + 1] - table[i]) * (level - i);
};
const HIGHLIGHT = new THREE.Color(COLORS.highlight);
const WHITE = new THREE.Color("#ffffff");
const blue = (k: number) => WHITE.clone().lerp(HIGHLIGHT, k);
/**
 * How quickly things follow, their time constants in seconds: the outline's
 * light, a molecule put back where it was, its atoms going to another frame,
 * and its atoms growing to space-filling or back.
 */
const OUTLINE_TAU = 0.07;
const PLACE_TAU = 0.08;
const FRAME_TAU = 0.06;
const LOOK_TAU = 0.08;
/** How gently the frames' chip follows the molecule's lowest point as it turns, in seconds. */
const PILL_TAU = 0.12;
/** A turn this small is followed at once - a drag's, or a turn on its own; a larger one is gone over to. */
const TURN_FOLLOWED = 0.3;
/** How much larger the atom under the pointer is drawn, and its spring: the 3D viewer's. */
const ATOM_SWELL = 1.1;
const SPRING = { stiffness: 150, damping: 15 };
/** A measurement's lines: how thick, and a distance's dashes and gaps, in ångströms. */
const MEASURE_RADIUS = 0.03;
const DASH = 0.16;
const GAP = 0.11;
/** The most dashes and arc steps one molecule's measurements are drawn with. */
const MEASURE_PIECES = 2048;

/**
 * Whether a pointer button is held down anywhere in the window: what moves
 * then is being dragged, and is followed at once rather than gone over to.
 */
let held = 0;
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", () => (held += 1), true);
  const up = () => (held = Math.max(0, held - 1));
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", up, true);
  window.addEventListener("blur", () => (held = 0));
}
const buttonHeld = () => held > 0;

/** One step of a spring towards `to`, which says whether it is still moving. */
function spring(s: { v: number; vel: number; to: number }, dt: number): boolean {
  const force = -SPRING.stiffness * (s.v - s.to) - SPRING.damping * s.vel;
  s.vel += force * dt;
  s.v += s.vel * dt;
  if (Math.abs(s.v - s.to) < 1e-3 && Math.abs(s.vel) < 1e-3) {
    s.v = s.to;
    s.vel = 0;
    return false;
  }
  return true;
}

/** `v` a step `dt` nearer `to`, with time constant `tau`; there once near enough. */
function follow(v: number, to: number, dt: number, tau: number): number {
  const next = to + (v - to) * Math.exp(-dt / tau);
  return Math.abs(next - to) < 1e-3 ? to : next;
}

export type Molecule3DViewProps = {
  m: Molecule3D;
  style: Style3D;
  look: Look3D;
  frame: number;
  turn: Turn3D | undefined;
  /** How lit its outline is: 0 not at all, 1 hovered or turning, 2 on the rim or moving. */
  lit: number;
  selected: boolean;
  /** Its atoms chosen, by index. */
  chosen: number[];
  /** Being moved by the pointer: where it stands is where it is put, at once. */
  following: boolean;
  /** Its frames shown in full beside it - hovered or selected - or as a count. */
  framesOpen: boolean;
  onFrame: (frame: number) => void;
  /** Its measurement under the pointer, by id; null, none. */
  hoveredMeasure: number | null;
  /** Taken away: it shrinks out of view, and says when it is gone. */
  leaving?: () => void;
};

/**
 * One molecule in 3D: its atoms and bonds, balls and sticks or space-filling,
 * in the frame it shows; its outline lit as it is hovered, moved or selected;
 * its chosen atoms ringed; its measurements; and its frames beside it. What
 * changes goes over to what it is to be rather than jumping: another frame,
 * another look, its place on an undo, its coming and going.
 */
export default function Molecule3DView(props: Molecule3DViewProps) {
  const { m, style, look, frame, turn, lit, selected, chosen, following, leaving } = props;
  const solid = solidOf(m, style);
  const n = m.atoms.length;
  const lineCount = useMemo(() => m.bonds.reduce((k, b) => k + linesOf(b.order), 0), [m.bonds]);
  const placed = useRef<THREE.Group>(null!);
  const turned = useRef<THREE.Group>(null!);
  const atoms = useRef<THREE.InstancedMesh>(null!);
  const bonds = useRef<THREE.InstancedMesh>(null);
  const atomHull = useRef<THREE.InstancedMesh>(null!);
  const bondHull = useRef<THREE.InstancedMesh>(null);
  const chosenHull = useRef<THREE.InstancedMesh>(null!);
  const pieces = useRef<THREE.InstancedMesh>(null!);
  const fans = useRef<THREE.Mesh>(null!);
  const pill = useRef<THREE.Group>(null!);
  const pillAt = useRef<number | null>(null);
  const [hoverAtom, setHoverAtom] = useState<number | null>(null);
  const { invalidate, camera } = useThree();
  const quaternion = useMemo(() => (turn ? new THREE.Quaternion(...turn) : new THREE.Quaternion()), [turn]);
  // how it is turned as drawn: following a drag at once, going over to a turn set afresh
  const shownTurn = useRef<THREE.Quaternion | null>(null);

  // what is drawn now, on its way to what it is to be
  const target = solid.frames[frameOf(solid, frame)];
  const places = useRef<Float32Array>(Float32Array.from(target));
  const fill = useRef(look === "space" ? 1 : 0);
  const swell = useRef(new Map<number, { v: number; vel: number; to: number }>());
  const rings = useRef(new Map<number, { v: number; vel: number; to: number }>());
  const grown = useRef({ v: leaving ? 1 : 0, vel: 0, to: leaving ? 0 : 1 });
  const level = useRef(0);
  const selLevel = useRef(0);
  const shown = useRef<THREE.Vector3 | null>(null);
  // measurements on their way in or out: how far in, and the last drawn of one gone
  const measureLevels = useRef(new Map<number, { v: number; m: Measure3D }>());
  const labels = useRef(new Map<number, { anchor: THREE.Group | null; el: HTMLDivElement | null }>());
  const [measureTexts, setMeasureTexts] = useState<Record<number, string>>({});
  const [shownMeasures, setShownMeasures] = useState<Measure3D[]>(m.measures ?? []);
  const dirty = useRef(true);

  // the molecule itself changed - its atoms, its frames, the style: drawn afresh
  useLayoutEffect(() => {
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) atoms.current.setColorAt(i, col.set(atomColour(m.atoms[i].el)));
    if (atoms.current.instanceColor) atoms.current.instanceColor.needsUpdate = true;
    if (places.current.length !== target.length) places.current = Float32Array.from(target);
    dirty.current = true;
    invalidate();
  }, [m, n, target, invalidate]);

  // measurements come and go, fading
  useEffect(() => {
    const now = m.measures ?? [];
    const ids = new Set(now.map((x) => x.id));
    for (const x of now) {
      const known = measureLevels.current.get(x.id);
      measureLevels.current.set(x.id, { v: known?.v ?? 0, m: x });
    }
    setShownMeasures([...now, ...[...measureLevels.current.values()].filter((l) => !ids.has(l.m.id)).map((l) => l.m)]);
    dirty.current = true;
    invalidate();
  }, [m.measures, invalidate]);

  // the atom under the pointer swells, and the one it leaves goes back
  useEffect(() => {
    for (const [i, s] of swell.current) s.to = i === hoverAtom ? ATOM_SWELL : 1;
    if (hoverAtom != null && !swell.current.has(hoverAtom)) swell.current.set(hoverAtom, { v: 1, vel: 0, to: ATOM_SWELL });
    invalidate();
  }, [hoverAtom, invalidate]);

  // chosen atoms are ringed, the ring opening out; let go, it closes
  useEffect(() => {
    const on = new Set(chosen);
    for (const [i, r] of rings.current) r.to = on.has(i) ? 1 : 0;
    for (const i of on) if (!rings.current.has(i)) rings.current.set(i, { v: 0, vel: 0, to: 1 });
    invalidate();
  }, [chosen, invalidate]);

  useEffect(() => invalidate(), [lit, selected, look, frame, turn, invalidate]);

  useFrame((_, dt) => {
    const step = Math.min(dt, 1 / 30);
    let moving = false;
    // another frame: its atoms go there
    let reshaped = dirty.current;
    const p = places.current;
    let far = 0;
    for (let i = 0; i < p.length; i++) far = Math.max(far, Math.abs(p[i] - target[i]));
    if (far > 1e-4) {
      const k = 1 - Math.exp(-step / FRAME_TAU);
      for (let i = 0; i < p.length; i++) p[i] += (target[i] - p[i]) * k;
      reshaped = moving = true;
    } else if (far > 0) {
      p.set(target);
      reshaped = true;
    }
    // another look: its atoms grow, or shrink, and its bonds give way
    const f = follow(fill.current, look === "space" ? 1 : 0, step, LOOK_TAU);
    if (f !== fill.current) {
      fill.current = f;
      reshaped = moving = true;
    }
    const height = solid.reach.balls + (solid.reach.space - solid.reach.balls) * fill.current;
    // where it stands: put back by an undo, it goes there rather than jumps
    const goal = new THREE.Vector3(m.at.x, m.at.y, height);
    // (a drag - its own, or the drawing's it is selected with - it follows at once)
    if (!shown.current || following || buttonHeld()) shown.current = goal.clone();
    else if (shown.current.distanceToSquared(goal) > 1e-8) {
      shown.current.lerp(goal, 1 - Math.exp(-step / PLACE_TAU));
      moving = true;
    }
    placed.current.position.copy(shown.current);
    if (!shownTurn.current || shownTurn.current.angleTo(quaternion) < TURN_FOLLOWED) {
      shownTurn.current = quaternion.clone();
    } else {
      shownTurn.current.slerp(quaternion, 1 - Math.exp(-step / PLACE_TAU));
      moving = true;
    }
    turned.current.quaternion.copy(shownTurn.current);
    // coming into view from its centre, or going into it
    if (grown.current.v !== grown.current.to || grown.current.vel !== 0) {
      spring(grown.current, step);
      moving = true;
      // (gone: shrunk to nothing, it is let go - hidden at once, and drawn
      // once more without it, or its last little picture would stay)
      if (leaving && grown.current.v <= 0.02) {
        placed.current.visible = false;
        leaving();
        invalidate();
        return;
      }
    }
    placed.current.scale.setScalar(Math.max(grown.current.v, 1e-3));
    // the atom under the pointer, and the chosen atoms' rings
    for (const [i, s] of swell.current) {
      if (spring(s, step)) reshaped = moving = true;
      else if (s.to === 1) swell.current.delete(i);
    }
    let ringing = false;
    for (const [i, r] of rings.current) {
      if (spring(r, step)) ringing = moving = true;
      else if (r.to === 0) {
        rings.current.delete(i);
        ringing = true;
      }
    }
    // the outline's light, and the selection's
    const towards = Math.max(0, Math.min(2, lit));
    const nextLevel = follow(level.current, towards, step, OUTLINE_TAU);
    const nextSel = follow(selLevel.current, selected ? 1 : 0, step, OUTLINE_TAU);
    const relit = nextLevel !== level.current || nextSel !== selLevel.current;
    if (relit) moving = true;
    level.current = nextLevel;
    selLevel.current = nextSel;

    const radius = (i: number) => {
      const r = solid.radii.balls[i] + (solid.radii.space[i] - solid.radii.balls[i]) * fill.current;
      return r * (swell.current.get(i)?.v ?? 1);
    };
    const bondR = style.bondRadius * WORLD_PER_ANGSTROM * (1 - fill.current);
    let lines: BondLine[] | null = null;
    if (reshaped) {
      placeAtoms(atoms.current, p, radius, 0);
      if (bonds.current) {
        lines = bondLines(m, p, bondR);
        placeBonds(bonds.current, lines, 0);
        bonds.current.visible = fill.current < 0.98;
      }
    }
    // (as wide in pixels whatever the zoom)
    const depth = PAGE_DISTANCE / Math.max(PAGE_DISTANCE - height, 1);
    const px = 1 / (camera.zoom * depth);
    // the outline
    const outPx = Math.max(outlineAt(level.current, OUTLINE_PX), SELECTED_PX * selLevel.current);
    const lightOn = outPx > 0.02;
    atomHull.current.visible = lightOn;
    if (bondHull.current) bondHull.current.visible = lightOn && fill.current < 0.98;
    if (lightOn && (reshaped || relit || dirty.current)) {
      const w = outPx * px;
      placeAtoms(atomHull.current, p, radius, w);
      if (bondHull.current) placeBonds(bondHull.current, lines ?? bondLines(m, p, bondR), w);
      const k = 1 - (1 - outlineAt(level.current, OUTLINE_BLUE)) * (1 - SELECTED_BLUE * selLevel.current);
      const colour = blue(k);
      (atomHull.current.material as THREE.MeshBasicMaterial).color.copy(colour);
      if (bondHull.current) (bondHull.current.material as THREE.MeshBasicMaterial).color.copy(colour);
    }
    // the chosen atoms' rings
    if (reshaped || ringing || dirty.current) {
      const mesh = chosenHull.current;
      for (let i = 0; i < n; i++) {
        const v = rings.current.get(i)?.v ?? 0;
        const r = v > 0.001 ? radius(i) + CHOSEN_PX * px * v : 0;
        mtx.makeScale(r, r, r).setPosition(p[3 * i], p[3 * i + 1], p[3 * i + 2]);
        mesh.setMatrixAt(i, mtx);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.visible = rings.current.size > 0;
    }
    // the measurements: drawn afresh as the atoms move, fading in and out
    let fading = false;
    for (const [id, l] of measureLevels.current) {
      const to = (m.measures ?? []).some((x) => x.id === id) ? 1 : 0;
      const v = follow(l.v, to, step, OUTLINE_TAU);
      if (v !== l.v) {
        l.v = v;
        fading = moving = true;
      }
      if (v === 0 && to === 0) {
        measureLevels.current.delete(id);
        fading = true;
      }
    }
    if (reshaped || fading || dirty.current) drawMeasures(p);
    dirty.current = false;
    // its frames, beside it: just below it on the page
    if (pill.current) {
      // (where its lowest atom is seen, on the page, now: followed gently as it turns)
      const g = Math.max(grown.current.v, 1e-3);
      const cam = camera.position;
      const at = shown.current;
      const v = new THREE.Vector3();
      let low = Infinity;
      for (let i = 0; i < n; i++) {
        v.set(p[3 * i], p[3 * i + 1], p[3 * i + 2]).applyQuaternion(shownTurn.current!);
        const k = cam.z / Math.max(cam.z - (at.z + v.z), 1e-3);
        low = Math.min(low, cam.y + (at.y + v.y - cam.y) * k - radius(i) * k);
      }
      const below = low - at.y;
      pillAt.current = pillAt.current == null || reshaped ? below : follow(pillAt.current, below, step, PILL_TAU);
      if (Math.abs(pillAt.current - below) > 1e-3) moving = true;
      pill.current.position.set(0, pillAt.current / g, -at.z / g);
    }
    if (moving) invalidate();
  });

  /** The measurements' marks and values, as the atoms are now. */
  const drawMeasures = (p: Float32Array) => {
    const mesh = pieces.current;
    const fanPoints: number[] = [];
    let used = 0;
    const texts: Record<number, string> = {};
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (const [id, l] of measureLevels.current) {
      const marks = measureMarks(p, l.m.atoms);
      const r = MEASURE_RADIUS * WORLD_PER_ANGSTROM * l.v;
      for (let k = 0; k + 1 < marks.lines.length; k += 2) {
        a.copy(marks.lines[k]);
        b.copy(marks.lines[k + 1]);
        const length = a.distanceTo(b);
        if (!marks.dashed) {
          if (used < MEASURE_PIECES) placePiece(mesh, used++, a, b, r);
          continue;
        }
        const period = (DASH + GAP) * WORLD_PER_ANGSTROM;
        const dashes = Math.max(1, Math.round(length / period));
        const along = b.clone().sub(a).divideScalar(dashes);
        for (let d = 0; d < dashes && used < MEASURE_PIECES; d++) {
          const s = a.clone().addScaledVector(along, d + GAP / (DASH + GAP) / 2);
          const e = a.clone().addScaledVector(along, d + 1 - GAP / (DASH + GAP) / 2);
          placePiece(mesh, used++, s, e, r);
        }
      }
      for (const v of marks.fan) fanPoints.push(v.x, v.y, v.z);
      texts[id] = measureText(kindOf(l.m.atoms), measureValue(p, l.m.atoms));
      const label = labels.current.get(id);
      if (label?.anchor) label.anchor.position.copy(marks.label);
      if (label?.el) label.el.style.opacity = String(l.v);
    }
    mesh.count = used;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = used > 0;
    const geometry = fans.current.geometry;
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(fanPoints, 3));
    geometry.computeBoundingSphere();
    fans.current.visible = fanPoints.length > 0;
    setMeasureTexts((was) => (same(was, texts) ? was : texts));
    // a measurement fully gone is let go
    setShownMeasures((was) => {
      const kept = was.filter((x) => measureLevels.current.has(x.id));
      return kept.length === was.length ? was : kept;
    });
  };

  return (
    <group ref={placed}>
      <group ref={turned}>
        <instancedMesh
          ref={atoms}
          args={[undefined, undefined, n]}
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
        {lineCount > 0 && (
          <instancedMesh ref={bonds} args={[undefined, undefined, lineCount]} renderOrder={OVER_PAGE} frustumCulled={false}>
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
        {/* The outline, and a chosen atom's ring: the molecule, or the atom,
            drawn a little larger, before it and under it - what shows is a
            thin rim of light round its outline only, none where one part of
            it passes in front of another. */}
        <instancedMesh
          ref={atomHull}
          args={[undefined, undefined, n]}
          renderOrder={OVER_PAGE - 1}
          frustumCulled={false}
          visible={false}
          raycast={() => {}}
        >
          <sphereGeometry args={[1, style.ballSegments, style.ballSegments]} />
          <meshBasicMaterial transparent opacity={1} depthWrite={false} toneMapped={false} />
        </instancedMesh>
        {lineCount > 0 && (
          <instancedMesh
            ref={bondHull}
            args={[undefined, undefined, lineCount]}
            renderOrder={OVER_PAGE - 1}
            frustumCulled={false}
            visible={false}
            raycast={() => {}}
          >
            <cylinderGeometry args={[1, 1, 1, style.bondSegments]} />
            <meshBasicMaterial transparent opacity={1} depthWrite={false} toneMapped={false} />
          </instancedMesh>
        )}
        <instancedMesh
          ref={chosenHull}
          args={[undefined, undefined, n]}
          renderOrder={OVER_PAGE - 1}
          frustumCulled={false}
          visible={false}
          raycast={() => {}}
        >
          <sphereGeometry args={[1, style.ballSegments, style.ballSegments]} />
          <meshBasicMaterial color={blue(CHOSEN_BLUE)} transparent opacity={1} depthWrite={false} toneMapped={false} />
        </instancedMesh>
        {/* The measurements: lines and arcs, a faint fan within an angle,
            and each value written beside its marks */}
        <instancedMesh
          ref={pieces}
          args={[undefined, undefined, MEASURE_PIECES]}
          renderOrder={OVER_PAGE + 1}
          frustumCulled={false}
          visible={false}
          raycast={() => {}}
        >
          <cylinderGeometry args={[1, 1, 1, 6]} />
          <meshBasicMaterial color={COLORS.highlight} transparent opacity={1} toneMapped={false} />
        </instancedMesh>
        <mesh ref={fans} renderOrder={OVER_PAGE + 1} frustumCulled={false} visible={false} raycast={() => {}}>
          <bufferGeometry />
          <meshBasicMaterial
            color={COLORS.highlight}
            transparent
            opacity={0.16}
            side={THREE.DoubleSide}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        {shownMeasures.map((x) => (
          <group
            key={x.id}
            ref={(g) => {
              const l = labels.current.get(x.id) ?? { anchor: null, el: null };
              l.anchor = g;
              labels.current.set(x.id, l);
            }}
          >
            {/* (the pointer goes through it to the molecule: what it is over
                is found by its box - Molecules3D - for its menu and the
                Delete key) */}
            <Html center zIndexRange={[30, 20]} style={{ pointerEvents: "none" }}>
              <div
                ref={(el) => {
                  const l = labels.current.get(x.id) ?? { anchor: null, el: null };
                  l.el = el;
                  labels.current.set(x.id, l);
                }}
                data-measure3d={`${m.id}:${x.id}`}
                className={`pointer-events-none px-1.5 rounded-full bg-white/90 border text-[11px] leading-[18px] text-gh-black tabular-nums whitespace-nowrap select-none shadow-sm transition-colors duration-150 ${
                  props.hoveredMeasure === x.id ? "border-[#1e90ff]" : "border-gh-line"
                }`}
                style={{ opacity: 0 }}
              >
                {measureTexts[x.id] ?? ""}
              </div>
            </Html>
          </group>
        ))}
      </group>
      {solid.frames.length > 1 && (
        <group ref={pill}>
          <Frames3D
            count={solid.frames.length}
            frame={frameOf(solid, frame)}
            energies={m.energies?.length === solid.frames.length ? m.energies : undefined}
            open={props.framesOpen}
            onFrame={props.onFrame}
          />
        </group>
      )}
    </group>
  );
}

function same(a: Record<number, string>, b: Record<number, string>): boolean {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[Number(k)] === b[Number(k)]);
}

const mtx = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const q = new THREE.Quaternion();
const scale = new THREE.Vector3();
const mid = new THREE.Vector3();
const dir = new THREE.Vector3();

/** Each atom's ball where it is, as large as `radius` says, and `extra` larger all round. */
function placeAtoms(mesh: THREE.InstancedMesh, places: Float32Array, radius: (i: number) => number, extra: number) {
  const n = places.length / 3;
  for (let i = 0; i < n; i++) {
    const r = radius(i) + extra;
    mtx.makeScale(r, r, r).setPosition(places[3 * i], places[3 * i + 1], places[3 * i + 2]);
    mesh.setMatrixAt(i, mtx);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}

/** Each bond's lines, cylinders from end to end, `extra` thicker all round. */
function placeBonds(mesh: THREE.InstancedMesh, lines: BondLine[], extra: number) {
  lines.forEach((line, k) => placePiece(mesh, k, line.a, line.b, line.r + (line.r > 0 ? extra : 0)));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}

/** A cylinder of radius `r` from `a` to `b`, as instance `k`. */
function placePiece(mesh: THREE.InstancedMesh, k: number, a: THREE.Vector3, b: THREE.Vector3, r: number) {
  dir.subVectors(b, a);
  const length = dir.length();
  q.setFromUnitVectors(UP, length > 1e-9 ? dir.divideScalar(length) : UP);
  mtx.compose(mid.addVectors(a, b).multiplyScalar(0.5), q, scale.set(r, length, r));
  mesh.setMatrixAt(k, mtx);
}

