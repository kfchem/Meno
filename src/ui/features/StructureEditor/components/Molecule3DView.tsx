import PageHtml from "./PageHtml";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { COLORS } from "../../../theme/colors";
import { atomColour, type Style3D } from "../../../../lib/chem/style3d";
import type { Look3D, Measure3D, Molecule3D, Rising3D, Turn3D } from "../store/types";
import { bondLines, bondReach, frameOf, labelSpot, linesOf, populations, solidOf, widestWay, WORLD_PER_ANGSTROM, type BondLine, type LabelBox, type Stick } from "../utils/molecule3d";
import { MARK_MIN_PX, MARK_SCALE, stereoTextEms } from "../chem/marks";
import { LONG_PRESS_MS, LONG_PRESS_SHOW_MS } from "../constants";
import { kindOf, MEASURE_FAN_OPACITY, MEASURE_RADIUS, measureMarks, measureText, measureValue, piecesOf } from "../utils/measure3d";
import { eyeOf, FRAME_ORDER, seenAt } from "../utils/page";
import Frames3D from "./Frames3D";
import Overlay3D from "./Overlay3D";
import StereoText from "./StereoText";

/**
 * Drawn after everything on the page, and depth-tested: what stands off the
 * page is never covered by what lies on it, whatever order that is drawn in.
 */
export const OVER_PAGE = 100;

/**
 * The outline's light, by how lit the molecule is - 0 not at all, 1 hovered
 * or turning, 2 moving: how wide, in pixels, and how much of the highlight
 * it takes. Between them it goes over smoothly. Selected, it has a broad,
 * pale outline as well, the selection's shade - which, as a press on it is
 * held, spreads out from the atom pressed on along its bonds.
 */
const OUTLINE_PX = [0, 1.6, 2.6];
const OUTLINE_BLUE = [0, 0.32, 0.6];
const SELECTED_PX = 5;
const SELECTED_BLUE = 0.27;
/** A chosen atom's ring, or a chosen bond's sleeve: how wide, in pixels, and how much of the highlight it takes. */
const CHOSEN_PX = 3.2;
const CHOSEN_BLUE = 0.75;
/** An atom whose drawing's atom is under the pointer: its outline, in pixels, and how blue. */
const LINKED_PX = 2.6;
const LINKED_BLUE = 0.5;
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
/**
 * A stereocentre's label: where it stands before it is first placed, the
 * white round its letters, and the room between it and its atom's ball.
 */
const STEREO_OFFSET = "translate(0.95em, -0.95em)";
const STEREO_HALO = "0 0 2px #fff, 0 0 2px #fff, 0 0 3px #fff";
/** How far apart two stereo labels keep at the least, in ems of their size. */
const STEREO_APART = 0.6;
/**
 * A molecule rising out of its drawing, in seconds: its atoms grow out of the
 * drawing's, where they lie on the page, and go over to their places in 3D as
 * it comes up off the page; then it goes over to rest beside the drawing.
 */
const RISE_GROW = 0.3;
const RISE_UP = 0.6;
const RISE_ACROSS_FROM = 0.45;
const RISE_END = 1.15;
const easeOutCubic = (u: number) => 1 - (1 - Math.min(Math.max(u, 0), 1)) ** 3;
const easeInOutCubic = (u: number) => {
  const t = Math.min(Math.max(u, 0), 1);
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
};
const SPRING = { stiffness: 150, damping: 15 };
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
  /** How lit its outline is: 0 not at all, 1 hovered or turning, 2 moving. */
  lit: number;
  selected: boolean;
  /** Its atoms chosen, by index; and its bonds. */
  chosen: number[];
  chosenBonds: number[];
  /** A press held on it, to select it: the atom pressed on, and since when (`performance.now()`). */
  holding: { from: number; start: number } | null;
  /** Being moved by the pointer: where it stands is where it is put, at once. */
  following: boolean;
  /** Its frames shown in full beside it - hovered or selected - or as a count. */
  framesOpen: boolean;
  onFrame: (frame: number) => void;
  /** Its measurement under the pointer, by id; null, none. */
  hoveredMeasure: number | null;
  /** Taken away: it shrinks out of view, and says when it is gone. */
  leaving?: () => void;
  /** Rising out of its drawing: where it started, over the drawing, and when; and what is told once it has risen. */
  rising?: Rising3D;
  /** Its atom whose drawing's atom is under the pointer: lit as if it were. */
  linkedAtom?: number | null;
  /** Its atom under the pointer, as it comes and goes. */
  onHoverAtom?: (atom: number | null) => void;
  /** Its drawing has changed since it was made from it: made again, asked for. */
  onRemake?: () => void;
  /** Its other frames - conformers - drawn over the one it shows. */
  overlay?: boolean;
  /** Its stereocentres' and double bonds' labels shown: all, only those its drawing left open, or none. */
  stereoShown: "all" | "chosen" | null;
  /**
   * R and S as the drawing writes them: as large as its R and S, on the
   * page or on the screen; in its typeface; in parentheses or not; and how
   * far off its ball, as a share of the drawing's label size.
   */
  stereoFont: { size: number; units: "world" | "px"; family: string; parentheses: boolean; gap: number };
  onRisen?: () => void;
};

/**
 * One molecule in 3D: its atoms and bonds, balls and sticks or space-filling,
 * in the frame it shows; its outline lit as it is hovered, moved or selected;
 * its chosen atoms ringed; its measurements; and its frames beside it. What
 * changes goes over to what it is to be rather than jumping: another frame,
 * another look, its place on an undo, its coming and going.
 */
export default function Molecule3DView(props: Molecule3DViewProps) {
  const { m, style, look, frame, turn, lit, selected, chosen, chosenBonds, holding, following, leaving } = props;
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
  const linkedHull = useRef<THREE.Mesh>(null!);
  // the atom lit for its drawing's, and how far its outline has come
  const linked = useRef<{ atom: number | null; v: number }>({ atom: null, v: 0 });
  const chosenSleeves = useRef<THREE.InstancedMesh>(null);
  const pieces = useRef<THREE.InstancedMesh>(null!);
  const fans = useRef<THREE.Mesh>(null!);
  const pill = useRef<THREE.Group>(null!);
  const pillAt = useRef<number | null>(null);
  const [hoverAtom, setHoverAtom] = useState<number | null>(null);
  const { invalidate, camera, size } = useThree();
  const quaternion = useMemo(() => (turn ? new THREE.Quaternion(...turn) : new THREE.Quaternion()), [turn]);
  // how it is turned as drawn: following a drag at once, going over to a turn set afresh
  const shownTurn = useRef<THREE.Quaternion | null>(null);

  // what is drawn now, on its way to what it is to be
  const target = solid.frames[frameOf(solid, frame)];
  const places = useRef<Float32Array>(Float32Array.from(target));
  const fill = useRef(look === "space" ? 1 : 0);
  const swell = useRef(new Map<number, { v: number; vel: number; to: number }>());
  const rings = useRef(new Map<number, { v: number; vel: number; to: number }>());
  const sleeves = useRef(new Map<number, { v: number; vel: number; to: number }>());
  // how far the selection's outline has spread, atom by atom, as a press is held
  const held = useRef(new Float32Array(n));
  if (held.current.length !== n) held.current = new Float32Array(n);
  const wasHolding = useRef(false);
  // each atom's distance from the atom pressed on, in bonds, and the furthest
  const spread = useMemo(() => {
    if (!holding) return null;
    const near: number[][] = m.atoms.map(() => []);
    for (const b of m.bonds) {
      near[b.a1].push(b.a2);
      near[b.a2].push(b.a1);
    }
    const level = new Int32Array(n).fill(-1);
    level[holding.from] = 0;
    let edge = [holding.from];
    let deepest = 0;
    while (edge.length) {
      const next: number[] = [];
      for (const a of edge) {
        for (const o of near[a]) {
          if (level[o] >= 0) continue;
          level[o] = level[a] + 1;
          deepest = level[o];
          next.push(o);
        }
      }
      edge = next;
    }
    // (atoms not bonded to it - a salt's other ion - last)
    for (let i = 0; i < n; i++) if (level[i] < 0) level[i] = deepest + 1;
    return { level, deepest: Math.max(...level) };
  }, [holding, m.atoms, m.bonds, n]);
  // each bond's lines, by bond
  const lineBond = useMemo(() => m.bonds.flatMap((b, i) => Array.from({ length: linesOf(b.order) }, () => i)), [m.bonds]);
  // (rising out of a drawing, it is its full size from the first: its atoms grow instead)
  const grown = useRef({ v: leaving || props.rising ? 1 : 0, vel: 0, to: leaving ? 0 : 1 });
  // how far its atoms have grown, rising out of a drawing
  const risen = useRef(props.rising ? 0 : 1);
  const level = useRef(0);
  const selLevel = useRef(0);
  const shown = useRef<THREE.Vector3 | null>(null);
  // measurements on their way in or out: how far in, and the last drawn of one gone
  const measureLevels = useRef(new Map<number, { v: number; m: Measure3D }>());
  const labels = useRef(new Map<number, { anchor: THREE.Group | null; el: HTMLDivElement | null }>());
  // each value's size on the screen, with the text it was read for: read
  // again only when its text changes, not every frame - what the stereo
  // labels keep clear of
  const valueSizes = useRef(new Map<number, { text: string; w: number; h: number }>());
  const [measureTexts, setMeasureTexts] = useState<Record<number, string>>({});
  const [shownMeasures, setShownMeasures] = useState<Measure3D[]>(m.measures ?? []);
  const dirty = useRef(true);
  // a conformer set's shares, by Boltzmann; and its atoms' elements
  const shares = useMemo(
    () => (m.conformerSet && m.energies?.length === solid.frames.length ? populations(m.energies) : undefined),
    [m.conformerSet, m.energies, solid.frames.length],
  );
  const els = useMemo(() => m.atoms.map((a) => a.el), [m.atoms]);
  // its stereocentres' and double bonds' labels: all, or those its drawing left open
  const stereoMarks = useMemo(() => {
    const st = m.stereo;
    if (!st || !props.stereoShown) return [];
    const only = props.stereoShown === "chosen" ? st.chosen : null;
    if (props.stereoShown === "chosen" && !only) return [];
    // (with the atoms whose ways out it keeps clear of: a centre's
    // neighbours, a double bond's two and theirs)
    const near = (i: number) => m.bonds.flatMap((b) => (b.a1 === i ? [b.a2] : b.a2 === i ? [b.a1] : []));
    const out: { key: string; atoms: number[]; around: number[]; text: string }[] = [];
    for (const [i, text] of Object.entries(st.atoms)) {
      if (!only || only.atoms.includes(Number(i))) out.push({ key: `a${i}`, atoms: [Number(i)], around: near(Number(i)), text });
    }
    for (const [i, text] of Object.entries(st.bonds)) {
      const b = m.bonds[Number(i)];
      if (b && (!only || only.bonds.includes(Number(i))))
        out.push({ key: `b${i}`, atoms: [b.a1, b.a2], around: [...new Set([...near(b.a1), ...near(b.a2)])], text });
    }
    return out;
  }, [m.stereo, m.bonds, props.stereoShown]);
  const stereoAnchors = useRef(new Map<string, { anchor: THREE.Group | null; el: HTMLDivElement | null }>());
  useEffect(() => {
    dirty.current = true;
    invalidate();
  }, [stereoMarks, invalidate]);

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

  // the atom under the pointer swells - or the one whose drawing's atom is -
  // and the one it leaves goes back
  const linkedAtom = props.linkedAtom ?? null;
  useEffect(() => {
    const lit = [hoverAtom, linkedAtom].filter((i): i is number => i != null);
    for (const [i, s] of swell.current) s.to = lit.includes(i) ? ATOM_SWELL : 1;
    for (const i of lit) if (!swell.current.has(i)) swell.current.set(i, { v: 1, vel: 0, to: ATOM_SWELL });
    invalidate();
  }, [hoverAtom, linkedAtom, invalidate]);
  const onHoverAtom = props.onHoverAtom;
  useEffect(() => onHoverAtom?.(hoverAtom), [hoverAtom, onHoverAtom]);

  // chosen atoms are ringed, the ring opening out, and chosen bonds
  // sleeved likewise; let go, it closes
  useEffect(() => {
    const on = new Set(chosen);
    for (const [i, r] of rings.current) r.to = on.has(i) ? 1 : 0;
    for (const i of on) if (!rings.current.has(i)) rings.current.set(i, { v: 0, vel: 0, to: 1 });
    invalidate();
  }, [chosen, invalidate]);
  useEffect(() => {
    const on = new Set(chosenBonds);
    for (const [i, r] of sleeves.current) r.to = on.has(i) ? 1 : 0;
    for (const i of on) if (!sleeves.current.has(i)) sleeves.current.set(i, { v: 0, vel: 0, to: 1 });
    invalidate();
  }, [chosenBonds, invalidate]);
  useEffect(() => invalidate(), [holding, invalidate]);

  useEffect(() => invalidate(), [lit, selected, look, frame, turn, invalidate]);

  // (before the labels' Html places them, so that they are placed where the
  // atoms are drawn this frame, not the one before: FRAME_ORDER)
  useFrame((_, dt) => {
    const step = Math.min(dt, 1 / 30);
    let moving = false;
    // another frame: its atoms go there
    let reshaped = dirty.current;
    const p = places.current;
    let far = 0;
    const rising = props.rising;
    const riseT = rising ? (performance.now() - rising.start) / 1000 : 0;
    if (rising?.flat && rising.flat.length === p.length && riseT < RISE_UP) {
      // rising out of the drawing: from its atoms on the page to their places in 3D
      const u = easeInOutCubic(riseT / RISE_UP);
      for (let i = 0; i < p.length; i++) p[i] = rising.flat[i] + (target[i] - rising.flat[i]) * u;
      reshaped = moving = true;
    } else {
      for (let i = 0; i < p.length; i++) far = Math.max(far, Math.abs(p[i] - target[i]));
    }
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
    // (as high as it reaches - or where a turn of several put it)
    const height = m.at.z ?? solid.reach.balls + (solid.reach.space - solid.reach.balls) * fill.current;
    // where it stands: put back by an undo, it goes there rather than jumps
    const goal = new THREE.Vector3(m.at.x, m.at.y, height);
    const rise = props.rising;
    if (rise) {
      // rising out of its drawing: off the page, its depth growing, and over to beside it
      const t = riseT;
      const up = easeInOutCubic(t / RISE_UP);
      const across = easeInOutCubic((t - RISE_ACROSS_FROM) / (RISE_END - RISE_ACROSS_FROM));
      shown.current = new THREE.Vector3(
        rise.from.x + (goal.x - rise.from.x) * across,
        rise.from.y + (goal.y - rise.from.y) * across,
        goal.z * up,
      );
      const grow = easeOutCubic(t / RISE_GROW);
      if (grow !== risen.current) reshaped = true;
      risen.current = grow;
      moving = true;
      if (t >= RISE_END) {
        risen.current = 1;
        p.set(target);
        reshaped = true;
        props.onRisen?.();
      }
    }
    // (a drag - its own, or the drawing's it is selected with - it follows at once)
    else if (!shown.current || following || buttonHeld()) shown.current = goal.clone();
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
    let sleeving = false;
    for (const [i, r] of sleeves.current) {
      if (spring(r, step)) sleeving = moving = true;
      else if (r.to === 0) {
        sleeves.current.delete(i);
        sleeving = true;
      }
    }
    // a press held: the selection's outline spreads from the atom pressed
    // on, nothing showing for the first part of it; done, the molecule is
    // selected and its outline stays as it is; let go early, it goes
    const h = held.current;
    let holdTo = 0;
    if (holding && spread) {
      const t = performance.now() - holding.start;
      const u = Math.min(1, Math.max(0, (t - LONG_PRESS_SHOW_MS) / (LONG_PRESS_MS - LONG_PRESS_SHOW_MS)));
      for (let i = 0; i < n; i++) h[i] = Math.min(1, Math.max(0, u * (spread.deepest + 1) - spread.level[i]));
      holdTo = 1;
      moving = true;
    } else if (wasHolding.current && selected) {
      let least = 1;
      for (let i = 0; i < n; i++) least = Math.min(least, h[i]);
      selLevel.current = Math.max(selLevel.current, least);
    }
    wasHolding.current = !!holding;
    let holdMost = 0;
    if (!holding) {
      for (let i = 0; i < n; i++) {
        if (h[i] === 0) continue;
        h[i] = follow(h[i], 0, step, OUTLINE_TAU);
        moving = true;
      }
    }
    for (let i = 0; i < n; i++) holdMost = Math.max(holdMost, h[i]);
    const holdShown = holdMost > 0 || holdTo > 0;
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
      return r * (swell.current.get(i)?.v ?? 1) * risen.current;
    };
    const bondR = style.bondRadius * WORLD_PER_ANGSTROM * (1 - fill.current) * risen.current;
    let lines: BondLine[] | null = null;
    if (reshaped) {
      placeAtoms(atoms.current, p, radius, 0);
      if (bonds.current) {
        lines = bondLines(m, p, bondR);
        placeBonds(bonds.current, lines, 0);
        bonds.current.visible = fill.current < 0.98;
      }
    }
    // (as wide in pixels whatever the zoom - and, in perspective, however
    // high it stands)
    const eye = eyeOf(camera);
    const px = 1 / (camera.zoom * seenAt(0, 0, height, eye).k);
    // the outline
    const outPx = Math.max(outlineAt(level.current, OUTLINE_PX), SELECTED_PX * selLevel.current);
    const lightOn = outPx > 0.02 || holdShown;
    atomHull.current.visible = lightOn;
    if (bondHull.current) bondHull.current.visible = lightOn && fill.current < 0.98;
    if (lightOn && (reshaped || relit || dirty.current || holdShown)) {
      const w = outPx * px;
      const wide = SELECTED_PX * px;
      placeAtoms(atomHull.current, p, radius, holdShown ? (i) => Math.max(w, wide * h[i]) : w);
      if (bondHull.current) {
        const all = lines ?? bondLines(m, p, bondR);
        placeBonds(
          bondHull.current,
          all,
          holdShown
            ? (k) => {
                const b = m.bonds[lineBond[k]];
                return Math.max(w, wide * Math.min(h[b.a1], h[b.a2]));
              }
            : w,
        );
      }
      const k = 1 - (1 - outlineAt(level.current, OUTLINE_BLUE)) * (1 - SELECTED_BLUE * Math.max(selLevel.current, holdMost));
      const colour = blue(k);
      (atomHull.current.material as THREE.MeshBasicMaterial).color.copy(colour);
      if (bondHull.current) (bondHull.current.material as THREE.MeshBasicMaterial).color.copy(colour);
    }
    // the atom whose drawing's atom is under the pointer, outlined
    {
      const l = linked.current;
      const want = props.linkedAtom ?? null;
      if (want != null) l.atom = want;
      const v = follow(l.v, want != null ? 1 : 0, step, OUTLINE_TAU);
      if (Math.abs(v - (want != null ? 1 : 0)) > 0.005) moving = true;
      l.v = Math.abs(v - (want != null ? 1 : 0)) <= 0.005 ? (want != null ? 1 : 0) : v;
      const mesh = linkedHull.current;
      mesh.visible = l.v > 0 && l.atom != null && l.atom < n;
      if (mesh.visible) {
        const i = l.atom!;
        mesh.position.set(p[3 * i], p[3 * i + 1], p[3 * i + 2]);
        mesh.scale.setScalar(radius(i) + LINKED_PX * px * l.v);
      }
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
    // the chosen bonds' sleeves
    const sleeveMesh = chosenSleeves.current;
    if (sleeveMesh && (reshaped || sleeving || dirty.current)) {
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      m.bonds.forEach((bond, i) => {
        const v = sleeves.current.get(i)?.v ?? 0;
        a.set(p[3 * bond.a1], p[3 * bond.a1 + 1], p[3 * bond.a1 + 2]);
        b.set(p[3 * bond.a2], p[3 * bond.a2 + 1], p[3 * bond.a2 + 2]);
        placePiece(sleeveMesh, i, a, b, v > 0.001 ? bondReach(bond.order, bondR) + CHOSEN_PX * px * v : 0);
      });
      sleeveMesh.instanceMatrix.needsUpdate = true;
      sleeveMesh.computeBoundingSphere();
      sleeveMesh.visible = sleeves.current.size > 0 && fill.current < 0.98;
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
    // the stereo labels, on their atom - a double bond's, at its middle - and
    // set off from it on the screen, as the drawing's are: clear of its ball,
    // the widest way out between its bonds as it is seen now - or the
    // nearest way that keeps clear of the other atoms, the bonds, the
    // measurements' values and the labels already placed - and as large as
    // the drawing's letters
    if (stereoMarks.length) {
      const g = Math.max(grown.current.v, 1e-3);
      const font = Math.max(MARK_MIN_PX, props.stereoFont.units === "px" ? props.stereoFont.size : props.stereoFont.size / px);
      const v = new THREE.Vector3();
      const onScreen = (parent: THREE.Object3D, x: number, y: number, z: number) => {
        parent.localToWorld(v.set(x, y, z)).project(camera);
        return { x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height };
      };
      const placedLabels: LabelBox[] = [];
      // (every atom's ball on the screen, once for all the labels; and every
      // bond as drawn - none when space-filling)
      let balls: { x: number; y: number; r: number }[] | null = null;
      const sticks: Stick[] = [];
      for (const mark of stereoMarks) {
        const l = stereoAnchors.current.get(mark.key);
        if (!l?.anchor) continue;
        const at = l.anchor.position.set(0, 0, 0);
        for (const i of mark.atoms) at.add(v.set(p[3 * i], p[3 * i + 1], p[3 * i + 2]));
        at.divideScalar(mark.atoms.length);
        const parent = l.anchor.parent;
        if (!l.el || !parent) continue;
        if (reshaped || dirty.current) l.el.style.opacity = String(risen.current);
        parent.updateWorldMatrix(true, false);
        if (!balls) {
          balls = [];
          for (let i = 0; i < n; i++) balls.push({ ...onScreen(parent, p[3 * i], p[3 * i + 1], p[3 * i + 2]), r: (radius(i) * g) / px });
          if (bondR > 0) for (const b of m.bonds) if (balls[b.a1] && balls[b.a2]) sticks.push({ a: balls[b.a1], b: balls[b.a2], r: (bondR * g) / px });
          // (the measurements' values, where they are written now - each
          // value's size read when its text is new: it is written in a
          // root of its own, after this one's, so not before it shows)
          for (const [id, v] of labels.current) {
            if (!v.anchor?.parent || !v.el || (measureLevels.current.get(id)?.v ?? 0) < 0.5) continue;
            const text = v.el.textContent ?? "";
            let size = valueSizes.current.get(id);
            if (!size || size.text !== text) {
              size = { text, w: v.el.offsetWidth, h: v.el.offsetHeight };
              valueSizes.current.set(id, size);
            }
            const c = onScreen(v.anchor.parent, v.anchor.position.x, v.anchor.position.y, v.anchor.position.z);
            placedLabels.push({ x: c.x, y: c.y, hx: size.w / 2, hy: size.h / 2 });
          }
        }
        const o = onScreen(parent, at.x, at.y, at.z);
        const way = widestWay(mark.around.map((i) => Math.atan2(balls![i].y - o.y, balls![i].x - o.x)));
        // (out past the ball - or the bond - as far as the drawing's style
        // sets its R and S off its atoms, of its labels' size; the letters'
        // box a capital's height, and a little for the halo)
        const reach = ((mark.atoms.length === 1 ? radius(mark.atoms[0]) : bondR) * g) / px + (props.stereoFont.gap * font) / MARK_SCALE;
        const half = { x: font * (stereoTextEms(mark.text, props.stereoFont.parentheses) / 2 + 0.1), y: font * 0.45 };
        // (every atom near it but its own - a double bond's two among them)
        const own = mark.atoms.length === 1 ? mark.atoms[0] : -1;
        const others = balls.filter((b, i) => i !== own && Math.hypot(b.x - o.x, b.y - o.y) < reach + 4 * half.x + b.r);
        const spot = labelSpot(o, reach, half, way, others, placedLabels, sticks);
        // (the next keeps a little way off it, not just clear: two side by
        // side read as one, and as either atom's)
        placedLabels.push({ ...spot, hx: spot.hx + STEREO_APART * font, hy: spot.hy + STEREO_APART * font });
        l.el.style.transform = `translate(${(spot.x - o.x).toFixed(1)}px, ${(spot.y - o.y).toFixed(1)}px)`;
        l.el.style.fontSize = `${font.toFixed(1)}px`;
      }
    }
    dirty.current = false;
    // its frames, beside it: just below it on the page
    if (pill.current) {
      // (where its lowest atom is seen, on the page, now: followed gently as it turns)
      const g = Math.max(grown.current.v, 1e-3);
      const at = shown.current;
      const v = new THREE.Vector3();
      let low = Infinity;
      for (let i = 0; i < n; i++) {
        v.set(p[3 * i], p[3 * i + 1], p[3 * i + 2]).applyQuaternion(shownTurn.current!);
        const seen = seenAt(at.x + v.x, at.y + v.y, at.z + v.z, eye);
        low = Math.min(low, seen.y - radius(i) * seen.k);
      }
      const below = low - at.y;
      pillAt.current = pillAt.current == null || reshaped ? below : follow(pillAt.current, below, step, PILL_TAU);
      if (Math.abs(pillAt.current - below) > 1e-3) moving = true;
      pill.current.position.set(0, pillAt.current / g, -at.z / g);
    }
    if (moving) invalidate();
  }, FRAME_ORDER.molecules);

  /** The measurements' marks and values, as the atoms are now. */
  const drawMeasures = (p: Float32Array) => {
    const mesh = pieces.current;
    const fanPoints: number[] = [];
    let used = 0;
    const texts: Record<number, string> = {};
    for (const [id, l] of measureLevels.current) {
      const marks = measureMarks(p, l.m.atoms);
      const r = MEASURE_RADIUS * WORLD_PER_ANGSTROM * l.v;
      for (const [s, e] of piecesOf(marks)) if (used < MEASURE_PIECES) placePiece(mesh, used++, s, e, r);
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
        <mesh ref={linkedHull} renderOrder={OVER_PAGE - 1} frustumCulled={false} visible={false} raycast={() => {}}>
          <sphereGeometry args={[1, style.ballSegments, style.ballSegments]} />
          <meshBasicMaterial color={blue(LINKED_BLUE)} transparent opacity={1} depthWrite={false} toneMapped={false} />
        </mesh>
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
        {m.bonds.length > 0 && (
          <instancedMesh
            ref={chosenSleeves}
            args={[undefined, undefined, m.bonds.length]}
            renderOrder={OVER_PAGE - 1}
            frustumCulled={false}
            visible={false}
            raycast={() => {}}
          >
            <cylinderGeometry args={[1, 1, 1, style.bondSegments]} />
            <meshBasicMaterial color={blue(CHOSEN_BLUE)} transparent opacity={1} depthWrite={false} toneMapped={false} />
          </instancedMesh>
        )}
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
            opacity={MEASURE_FAN_OPACITY}
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
            <PageHtml center zIndexRange={[30, 20]} style={{ pointerEvents: "none" }}>
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
            </PageHtml>
          </group>
        ))}
        {solid.frames.length > 1 && (
          <Overlay3D
            solid={solid}
            bonds={m.bonds}
            els={els}
            frame={frameOf(solid, frame)}
            on={!!props.overlay}
            radius={style.bondRadius * WORLD_PER_ANGSTROM}
            weights={shares}
          />
        )}
        {stereoMarks.map((mark) => (
          <group
            key={mark.key}
            ref={(g) => {
              const l = stereoAnchors.current.get(mark.key) ?? { anchor: null, el: null };
              l.anchor = g;
              stereoAnchors.current.set(mark.key, l);
            }}
          >
            <PageHtml center zIndexRange={[30, 20]} style={{ pointerEvents: "none" }}>
              <div
                ref={(el) => {
                  const l = stereoAnchors.current.get(mark.key) ?? { anchor: null, el: null };
                  l.el = el;
                  stereoAnchors.current.set(mark.key, l);
                }}
                className="pointer-events-none select-none whitespace-nowrap text-accel-blue text-[12px] leading-none"
                style={{ opacity: 0, transform: STEREO_OFFSET, textShadow: STEREO_HALO, fontFamily: props.stereoFont.family }}
              >
                <StereoText cip={mark.text} parentheses={props.stereoFont.parentheses} />
              </div>
            </PageHtml>
          </group>
        ))}
      </group>
      {/* (rising out of its drawing, it shows its frames once it has risen) */}
      {(solid.frames.length > 1 || props.onRemake) && !props.rising && (
        <group ref={pill}>
          {solid.frames.length > 1 ? (
            <Frames3D
              count={solid.frames.length}
              frame={frameOf(solid, frame)}
              energies={m.energies?.length === solid.frames.length ? m.energies : undefined}
              open={props.framesOpen}
              onFrame={props.onFrame}
              below={props.onRemake && <Changed onRemake={props.onRemake} />}
              populations={shares}
            />
          ) : (
            props.onRemake && (
              <PageHtml zIndexRange={[30, 20]}>
                <div style={{ transform: "translate(-50%, 10px)" }}>
                  <Changed onRemake={props.onRemake} />
                </div>
              </PageHtml>
            )
          )}
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
function placeAtoms(mesh: THREE.InstancedMesh, places: Float32Array, radius: (i: number) => number, extra: number | ((i: number) => number)) {
  const n = places.length / 3;
  for (let i = 0; i < n; i++) {
    const r = radius(i) + (typeof extra === "number" ? extra : extra(i));
    mtx.makeScale(r, r, r).setPosition(places[3 * i], places[3 * i + 1], places[3 * i + 2]);
    mesh.setMatrixAt(i, mtx);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}

/** Each bond's lines, cylinders from end to end, `extra` thicker all round (by line, if it is a function). */
function placeBonds(mesh: THREE.InstancedMesh, lines: BondLine[], extra: number | ((k: number) => number)) {
  lines.forEach((line, k) => placePiece(mesh, k, line.a, line.b, line.r + (line.r > 0 ? (typeof extra === "number" ? extra : extra(k)) : 0)));
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

/** Its drawing changed since it was made from it: said quietly, under its frames, with the way to make it again. */
function Changed({ onRemake }: { onRemake: () => void }) {
  return (
    <div
      className="mt-1.5 whitespace-nowrap rounded-full border border-gh-line bg-white/90 px-2 text-[11px] leading-[20px] text-gh-gray shadow-sm"
      onPointerDown={(e) => e.stopPropagation()}
    >
      Its drawing has changed ·{" "}
      <button className="text-accel-base hover:underline" onClick={onRemake}>
        Make again
      </button>
    </div>
  );
}
