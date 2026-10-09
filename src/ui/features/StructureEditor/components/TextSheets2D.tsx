/**
 * Texts' sheets on the page (docs/PDF.md, *A text*, *What a thing on the
 * page is*): each a white sheet with its first lines, at the size they
 * would be printed (utils/textSheets), in Meno's monospaced type - signed-
 * distance glyphs (troika), sharp at every zoom - and its name under it, as
 * a PDF's is. Seen from far off, its lines are grey strokes; nearer, its
 * words come up over them.
 *
 * Handled as a picture is: a drag on it moves the view; held still, it is
 * taken hold of and moved; a click selects it, Ctrl/Cmd and a click adds it
 * or takes it out; selected, a drag moves the whole selection. Two clicks
 * read it in the column (hooks/useStructureEvents).
 */
import * as THREE from "three";
import { useEffect, useMemo, useState } from "react";
import { Text } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEditor, useEditorStore } from "../store";
import type { WorkspaceText } from "../store/types";
import { COLORS } from "../../../theme/colors";
import { POINT } from "../../../../lib/pdf/layout";
import { addsToSelection } from "../../../../lib/doc/shortcuts";
import { DOUBLE_CLICK_MS, LONG_PRESS_MS } from "../constants";
import { SHEET_LETTER, SHEET_LINE_PT, SHEET_PAD_PT, SHEET_TYPE_PT, sheetOf } from "../utils/textSheets";
import { dragSelection } from "../utils/dragSelection";
import { follow, TAU } from "../../../theme/motion";
import { needsFallback, useLabelFontUrl } from "../../../fonts/typefaces";
import { useDrawnLayout } from "./drawnLayoutContext";
import { pageAt } from "../utils/page";
import { HeldLight } from "./HeldLight";
import { heldShows, type Held } from "./held";
import { GRAY } from "./pdfPictures";
import plexMono from "../../../../assets/fonts/IBMPlexMono-Regular.ttf?url";

/** Over the PDFs, under the pictures and the drawing; each put there later a step over the one before. */
const Z = -0.35;
const Z_STEP = 1e-3;
/** How far a press moves before it is a drag, and how far before it moves the view, in pixels. */
const CLICK_PX = 4;
const PAN_PX = 3;
/** The light round a sheet hovered, and how far out it reaches, in pixels. */
const LIT = 0.16;
const LIT_PAD_PX = 5;
/** The sheet's colours: its paper, its edge, its words and its strokes seen from far off. */
const PAPER = "#ffffff";
const EDGE = "rgb(209, 217, 224)";
const INK = "rgb(31, 35, 40)";
const STROKE = "rgb(200, 206, 213)";
/** How large its words are on the screen, in pixels, when they begin to come up over the strokes, and when they have quite. */
const WORDS_FROM_PX = 3.5;
const WORDS_AT_PX = 6;
/** Its name: how large on the screen, and how far under it. */
const NAME_PX = 12;
const NAME_GAP_PX = 14;

type Pt = { x: number; y: number };
const noRaycast = () => null;

export default function TextSheets2D() {
  const texts = useEditor((s) => s.texts);
  const selTexts = useEditor((s) => s.selTexts);
  const hovered = useEditor((s) => s.hoveredText);
  const { camera, gl } = useThree();
  const { opts } = useDrawnLayout();
  const sheets = useMemo(() => texts.filter((t) => t.at), [texts]);
  const nameFont = useLabelFontUrl(opts.fontFamily ?? "Arial", needsFallback(sheets.map((t) => t.name)));
  const toWorld = (cx: number, cy: number): Pt => {
    const rect = gl.domElement.getBoundingClientRect();
    const p = pageAt(((cx - rect.left) / rect.width) * 2 - 1, -(((cy - rect.top) / rect.height) * 2 - 1), camera);
    return { x: p.x, y: p.y };
  };
  return (
    <group>
      {sheets.map((t, i) => (
        <Sheet key={t.id} t={t} z={Z + i * Z_STEP} selected={selTexts.has(t.id)} hovered={hovered === t.id} nameFont={nameFont ?? undefined} toWorld={toWorld} />
      ))}
    </group>
  );
}

function Sheet({ t, z, selected, hovered, nameFont, toWorld }: { t: WorkspaceText; z: number; selected: boolean; hovered: boolean; nameFont?: string; toWorld: (cx: number, cy: number) => Pt }) {
  const store = useEditorStore();
  const { camera, invalidate } = useThree();
  const zoom = (camera as THREE.OrthographicCamera).zoom || 1;
  const px = 1 / zoom;
  const s = useMemo(() => sheetOf(t.text), [t.text]);
  const at = t.at!;
  const pad = SHEET_PAD_PT * POINT;
  const line = SHEET_LINE_PT * POINT;
  const letter = SHEET_LETTER * SHEET_TYPE_PT * POINT;
  // (its words as large on the screen as they are: strokes where too small to read, the words over them, coming up)
  const wordsPx = SHEET_TYPE_PT * POINT * zoom;
  const words = Math.min(1, Math.max(0, (wordsPx - WORDS_FROM_PX) / (WORDS_AT_PX - WORDS_FROM_PX)));

  // the light round it while the pointer is on it, coming and going
  const lightMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: COLORS.highlight, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }), []);
  useEffect(() => () => lightMaterial.dispose(), [lightMaterial]);
  useFrame((_, dt) => {
    const m = lightMaterial;
    const to = hovered ? LIT : 0;
    if (Math.abs(m.opacity - to) < 1e-3) {
      m.opacity = to;
      return;
    }
    m.opacity = follow(m.opacity, to, Math.min(dt, 1 / 20), TAU.quick);
    invalidate();
  });
  // taken hold of by a press held on it: where, from its top left, lit from there
  const [held, setHeld] = useState<(Held & Pt) | null>(null);
  const [, setTick] = useState(0);
  useEffect(() => invalidate(), [held, invalidate]);
  useFrame(() => {
    if (!held || !heldShows(held, performance.now())) return;
    setTick((k) => k + 1);
    invalidate();
  });

  const onDown = (e: { nativeEvent: PointerEvent; stopPropagation: () => void }) => {
    const ev = e.nativeEvent;
    if (ev.button !== 0) return;
    const st = store.getState();
    // (what is drawn over it is pressed, not it)
    if (st.hovered.atomId != null || st.hovered.bondId != null || st.hovered3d || st.hoveredArrow != null || st.hoveredPlus != null || st.hoveredCaption != null || st.hoveredPicture != null) return;
    e.stopPropagation();
    if (addsToSelection(ev)) {
      st.toggleTextSel(t.id);
      st.suppressDoubleClick(DOUBLE_CLICK_MS);
      return;
    }
    const from = { x: ev.clientX, y: ev.clientY };
    const move = () => {
      store.getState().beginPanHold(ev.pointerId);
      dragSelection(store, toWorld, from, (u) => {
        const s2 = store.getState();
        s2.endPanHold(u.pointerId);
        setHeld((h) => (h && h.let == null ? { ...h, let: performance.now() } : h));
      });
    };
    // selected: a drag moves the selection
    if (st.selTexts.has(t.id)) {
      move();
      return;
    }
    // else a drag moves the view; held still, it is taken hold of; a click selects it
    const q = toWorld(ev.clientX, ev.clientY);
    setHeld({ x: q.x - at.x, y: q.y - at.y, start: performance.now() });
    invalidate();
    let panned = false;
    const hold = window.setTimeout(() => {
      stop();
      const s2 = store.getState();
      s2.clearSel();
      s2.selectTexts([t.id]);
      setHeld((h) => (h ? { ...h, done: true } : h));
      move();
    }, LONG_PRESS_MS);
    const onMove = (m: PointerEvent) => {
      if (panned || Math.hypot(m.clientX - from.x, m.clientY - from.y) < PAN_PX) return;
      panned = true;
      window.clearTimeout(hold);
      setHeld((h) => (h ? { ...h, let: performance.now() } : h));
    };
    const onUp = (u: PointerEvent) => {
      stop();
      window.clearTimeout(hold);
      setHeld((h) => (h && h.let == null ? { ...h, let: performance.now() } : h));
      if (panned || Math.hypot(u.clientX - from.x, u.clientY - from.y) >= CLICK_PX) return;
      // (a click: it alone selected - a second click, the first's: read in the column, by the canvas's double-click)
      const s2 = store.getState();
      s2.clearSel();
      s2.selectTexts([t.id]);
    };
    const stop = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, true);
  };

  const lit = LIT_PAD_PX * px;
  const now = performance.now();
  const edge = px;
  return (
    <group position={[at.x, at.y, z]}>
      {/* (round it, not under it, as a picture's) */}
      {[
        [s.w / 2, lit / 2, s.w + 2 * lit, lit],
        [s.w / 2, -s.h - lit / 2, s.w + 2 * lit, lit],
        [s.w + lit / 2, -s.h / 2, lit, s.h],
        [-lit / 2, -s.h / 2, lit, s.h],
      ].map(([x, y, w, h], k) => (
        <mesh key={`lit${k}`} position={[x, y, -Z_STEP / 2]} scale={[w, h, 1]} material={lightMaterial} raycast={noRaycast}>
          <planeGeometry args={[1, 1]} />
        </mesh>
      ))}
      <mesh
        position={[s.w / 2, -s.h / 2, 0]}
        scale={[s.w, s.h, 1]}
        onPointerOver={() => store.getState().setHoveredText(t.id)}
        onPointerOut={() => {
          if (store.getState().hoveredText === t.id) store.getState().setHoveredText(null);
        }}
        onPointerDown={onDown}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color={PAPER} toneMapped={false} />
      </mesh>
      {/* its edge, a pixel wide - or the selection's light, where it is selected */}
      {[
        [s.w / 2, 0, s.w, edge],
        [s.w / 2, -s.h, s.w, edge],
        [0, -s.h / 2, edge, s.h],
        [s.w, -s.h / 2, edge, s.h],
      ].map(([x, y, w, h], k) => (
        <mesh key={`edge${k}`} position={[x, y, Z_STEP / 4]} scale={[selected ? w + edge : w, selected ? h + edge : h, 1]} raycast={noRaycast}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial color={selected ? COLORS.highlight : EDGE} toneMapped={false} />
        </mesh>
      ))}
      {/* far off, its lines as strokes */}
      {words < 1 &&
        s.lines.map((l, i) => {
          const lead = l.length - l.trimStart().length;
          const len = l.trimEnd().length;
          if (len <= lead) return null;
          const x0 = pad + lead * letter;
          const w = (len - lead) * letter;
          return (
            <mesh key={`stroke${i}`} position={[x0 + w / 2, -(pad + (i + 0.5) * line), Z_STEP / 8]} scale={[w, line * 0.42, 1]} raycast={noRaycast}>
              <planeGeometry args={[1, 1]} />
              <meshBasicMaterial color={STROKE} transparent opacity={1 - words} depthWrite={false} toneMapped={false} />
            </mesh>
          );
        })}
      {/* nearer, its words - a line at a time: a letter the type lacks, taken from another, takes no line but its own with it */}
      {words > 0 &&
        s.lines.map((l, i) =>
          l.trim() ? (
            <Text
              key={`line${i}`}
              font={plexMono}
              fontSize={SHEET_TYPE_PT * POINT}
              anchorX="left"
              anchorY="middle"
              position={[pad, -(pad + (i + 0.5) * line), Z_STEP / 4]}
              color={INK}
              fillOpacity={words}
              clipRect={[0, -line, s.w - 2 * pad, line]}
              raycast={noRaycast}
            >
              {l}
            </Text>
          ) : null,
        )}
      {/* its name under it, as small on the screen however near it is seen */}
      <Text font={nameFont} fontSize={NAME_PX * px} anchorX="left" anchorY="top" position={[0, -s.h - NAME_GAP_PX * px, Z_STEP / 4]} color={GRAY} maxWidth={Math.max(120 * px, s.w)} raycast={noRaycast}>
        {t.name}
      </Text>
      {held && <HeldLight b={{ x0: 0, x1: s.w, y0: -s.h, y1: 0 }} at={held} held={held} now={now} z={Z_STEP / 2} />}
    </group>
  );
}
