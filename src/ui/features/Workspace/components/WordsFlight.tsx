/**
 * Words carried out of a PDF (docs/PDF.md, *Taking things out*), as Meno
 * sets them on the page, drawn over everything - the column too - in the
 * canvas's own pixels (PdfColumn's last pass).
 *
 * They come as a morph of the PDF's own words, the PDF left as it is: each
 * of Meno's words first lies over the word it was on the page, as wide and
 * as tall, unseen; one after another, outward from where they were pressed,
 * each is seen as it rises toward the viewer - larger, its shadow falling
 * below it - while all of them, together, go from the PDF's lines to their
 * places in Meno's - as wide as the PDF's were and lying as they did - held
 * under the pointer where it pressed them. Over the canvas they are as large as the canvas shows the page; let
 * go there, they settle onto it and are words on the page; let go anywhere
 * else, each goes back down onto the word it was.
 */
import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { captionWords } from "../../../../lib/chem/captions";
import { labelSetOf } from "../../../../lib/chem/layout2d";
import { TAU, follow } from "../../../theme/motion";
import { useEditorStore } from "../store";
import type { WordsFlight as Flight } from "../store/types";
import { useDrawnLayout } from "./drawnLayoutContext";
import { Texts2D } from "./Labels2D";

/** How long a word takes to rise and be seen, in ms; how much later each rises, by how far it was from where they were pressed (ms per pixel), and at most. */
const RISE_MS = 240;
const LATER_PER_PX = 0.5;
const LATEST_MS = 220;
/** When the words, together, set off from the PDF's lines for Meno's, and how long they take, in ms. */
const MOVE_AFTER_MS = 80;
const MORPH_MS = 380;
/** How long words take to settle where they are let go, and to go back, in ms; and how long they are drawn over the words on the page they have become. */
const SETTLE_MS = 200;
const BACK_MS = 320;
const HANDOVER_MS = 120;
/** How high words are held, in pixels - their shadow falling that far below, in part - and how far off the viewer is: held, they are that much nearer, and larger. */
const HEIGHT_PX = 36;
const DEPTH_PX = 760;
/** Their shadow: how strong, and how far it is blurred, as a share of the letters' size. */
const SHADOW = 0.14;
const SHADOW_BLUR = "60%";
/** How tall a line of words is taken to be, in ems: as PDFium's boxes round letters are. */
const LINE_EMS = 1.15;

const clamp01 = (u: number) => Math.min(1, Math.max(0, u));
/** Eased in and out, cubic. */
const inOut = (u: number) => {
  const t = clamp01(u);
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
};
/** Eased out, cubic. */
const out = (u: number) => 1 - (1 - clamp01(u)) ** 3;

/** A word drawn: where its letters lie, in the canvas's pixels (x to the right, y up), from where they lie in the words' own units. */
type Place = { x: number; y: number; sx: number; sy: number };

export default function WordsFlight({ w }: { w: Flight }) {
  const store = useEditorStore();
  const { opts } = useDrawnLayout();
  const { gl, camera, invalidate } = useThree();
  const laid = useMemo(() => captionWords(w.text, 0, 0, opts.fontPx, labelSetOf(opts), w.width, w.align ?? "center"), [w.text, w.width, w.align, opts]);
  // where under the pointer they are held: where it pressed them in the box
  // they are set in, that box laid over the lines they were on
  const held = useMemo(() => {
    const box = w.width ?? 2 * laid.halfW;
    return { x: -box / 2 + (w.grab.x - w.from.left) / w.from.k, y: laid.halfH - (w.grab.y - w.from.top) / w.from.k };
  }, [w.width, w.grab, w.from, laid]);
  useEffect(() => {
    w.now.held = held;
  }, [w, held]);
  // how much later each word rises: the farther it was from where they were pressed, the later
  const later = useMemo(
    () =>
      laid.items.map((_, i) => {
        const b = w.boxes[i];
        return b ? Math.min(LATEST_MS, Math.hypot((b[0] + b[2]) / 2 - w.grab.x, (b[1] + b[3]) / 2 - w.grab.y) * LATER_PER_PX) : LATEST_MS;
      }),
    [laid, w.boxes, w.grab],
  );
  const words = useRef<THREE.Group>(null);
  const shadows = useRef<THREE.Group>(null);
  const motion = useRef<{ k: number; end: { k: number; at: number; move: number; rises: number[] } | null; handed: number | null }>({ k: w.from.k, end: null, handed: null });

  useFrame((_, dt) => {
    const now = performance.now();
    const m = motion.current;
    const end = w.now.end;
    const rect = gl.domElement.getBoundingClientRect();
    const fx = (cx: number) => cx - rect.left;
    const fy = (cy: number) => -(cy - rect.top);
    const zoom = (camera as THREE.OrthographicCamera).zoom || 1;
    const t = now - w.start;

    // how far they have gone from the PDF's lines to Meno's, how far each has
    // risen, how high they are held and how much they are seen; and how many
    // pixels a unit of the page is: the canvas's over it, the PDF's else
    let move = inOut((t - MOVE_AFTER_MS) / MORPH_MS);
    let rises = later.map((l) => out((t - l) / RISE_MS));
    let high = 1;
    let seen = 1;
    if (end && !m.end) m.end = { k: m.k, at: end.to === "page" ? Math.max(end.start, w.start + Math.max(MOVE_AFTER_MS + MORPH_MS, LATEST_MS + RISE_MS)) : end.start, move, rises };
    if (end?.to === "back" && m.end) {
      // going back: each word back down onto the word it was
      const b = inOut((now - m.end.at) / BACK_MS);
      move = m.end.move * (1 - b);
      rises = m.end.rises.map((r) => r * (1 - b));
      m.k = m.end.k + (w.from.k - m.end.k) * b;
      if (b >= 1) {
        store.getState().setPdfWords(null);
        return;
      }
    } else if (end?.to === "page" && m.end) {
      // let go on the canvas: once all have come, settling onto it, as large as it shows the page
      if (now < m.end.at) m.end.k = m.k = follow(m.k, zoom, Math.min(dt, 1 / 20), TAU.move);
      else {
        const s = inOut((now - m.end.at) / SETTLE_MS);
        m.k = m.end.k + (zoom - m.end.k) * s;
        high = 1 - s;
        if (s >= 1) {
          // settled: the words on the page drawn, these over them a moment, fading
          if (m.handed == null) {
            m.handed = now;
            if (w.landing != null) store.getState().setPdfWords({ ...w, landing: null });
          }
          seen = 1 - clamp01((now - m.handed) / HANDOVER_MS);
          if (seen <= 0) {
            store.getState().setPdfWords(null);
            return;
          }
        }
      }
    } else {
      const to = w.now.over ? zoom : w.from.k;
      m.k = Math.abs(m.k - to) < to * 1e-4 ? to : follow(m.k, to, Math.min(dt, 1 / 20), TAU.move);
    }
    const k = m.k;
    const P = { x: fx(w.now.x), y: fy(w.now.y) };
    // (where they will be: their box's middle, held under the pointer)
    const mid = { x: P.x - held.x * k, y: P.y - held.y * k };
    const tall = opts.fontPx * LINE_EMS;
    const wordsOf = words.current?.children[0]?.children ?? [];
    const shadowsOf = shadows.current?.children[0]?.children ?? [];
    laid.words.forEach((word, i) => {
      const u = move;
      // where it was: over the PDF's word, as wide and as tall; none, it comes where it goes
      const b = w.boxes[i];
      const from: Place = b
        ? {
            sx: (b[2] - b[0]) / Math.max(word.w, 1e-6),
            sy: (b[3] - b[1]) / tall,
            x: fx(b[0]) - ((b[2] - b[0]) / Math.max(word.w, 1e-6)) * word.x,
            y: fy((b[1] + b[3]) / 2) - ((b[3] - b[1]) / tall) * word.y,
          }
        : { sx: k, sy: k, x: mid.x, y: mid.y };
      const to: Place = { sx: k, sy: k, x: mid.x, y: mid.y };
      const at: Place = { x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u, sx: from.sx + (to.sx - from.sx) * u, sy: from.sy + (to.sy - from.sy) * u };
      // risen, held that high: nearer the viewer, and larger about the pointer
      const lift = (rises[i] ?? 1) * high;
      const z = HEIGHT_PX * lift;
      const near = DEPTH_PX / (DEPTH_PX - z);
      const shown = (rises[i] ?? 1) * seen;
      const g = wordsOf[i];
      if (g) {
        g.position.set(P.x + (at.x - P.x) * near, P.y + (at.y - P.y) * near, 0);
        g.scale.set(at.sx * near, at.sy * near, 1);
        g.traverse((o) => {
          if ("fillOpacity" in o) (o as unknown as { fillOpacity: number }).fillOpacity = shown;
        });
      }
      const s = shadowsOf[i];
      if (s) {
        s.position.set(at.x + 0.12 * z, at.y - 0.3 * z, 0);
        s.scale.set(at.sx, at.sy, 1);
        s.traverse((o) => {
          if ("outlineOpacity" in o) (o as unknown as { outlineOpacity: number }).outlineOpacity = SHADOW * lift * shown;
        });
      }
    });
    invalidate();
  });

  return (
    <>
      <group ref={shadows}>
        <Texts2D texts={laid.items} moved shadow={SHADOW_BLUR} renderOrder={29} />
      </group>
      <group ref={words}>
        <Texts2D texts={laid.items} moved />
      </group>
    </>
  );
}
