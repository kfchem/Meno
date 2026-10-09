/**
 * PDFs on the page (docs/PDF.md, *A PDF*, *On the page*): each a stack of its
 * pages at the size they are printed at, the page on top over the others -
 * or its pages spread out in rows - its name under it.
 *
 * Quick, then sharp: a page shows at once from a small picture of it, and,
 * seen nearer, the parts in view are drawn again at the screen's resolution
 * in tiles, nearest first, each fading in over what was there. While the
 * view is zoomed, the tiles there are scaled; once it settles, sharper ones
 * are asked for. PDFium draws them, in a process of its own (lib/pdf).
 *
 * Full size, a drag on it moves the view, as on empty space; held still a
 * moment on its rim - or anywhere on it, where its words are too small to
 * read - it is taken hold of, lit from the pointer out as a structure is,
 * and then moved by the drag. As an icon, a drag moves it. The page on top
 * is turned by the corner that folds as the stack is hovered, or by the
 * arrow keys over it (StructureCanvas). Turned, the page lifts off toward
 * the viewer and goes under; spread or gathered, the pages lift off one
 * after another and settle in their places.
 */
import * as THREE from "three";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { pageAt } from "../utils/page";
import { setViewGoal } from "./viewGoal";
import { useEditor, useEditorStore } from "../store";
import type { PdfItem } from "../store/types";
import { ICON_NAME_WIDTH, iconScale, pdfBounds, pdfRoom, POINT, shownSheet, spreadSheets, stackSheets, topSheet, type Sheet } from "../../../../lib/pdf/layout";
import { useDrawnLayout } from "./drawnLayoutContext";
import { needsFallback, useLabelFontUrl } from "../../../fonts/typefaces";
import { COLORS } from "../../../theme/colors";
import { BASE, FADE_MS, GRAY, levelFor, LINE, Page, TILE, usePictures, type Mark, type Pic, type Tile } from "./pdfPictures";
import { FLASH_MS, marksOn } from "./pdfMarks";
import { followLink, readerOf } from "./pdfColumnReader";
import { linkAt, linksOf, type PdfLink } from "../../../../lib/pdf/reader";
import { letterNear, placeAt, textHad, wordAt, type PageText } from "../../../../lib/pdf/text";
import { placeBefore, selects } from "../utils/pdfSelection";
import { dragWords, onSelected } from "./wordsDrag";
import { LONG_PRESS_MS, LONG_PRESS_SHOW_MS, MOV_PX } from "../constants";
import { ALPHA } from "../../../theme/colors";
import { SHADE } from "./selectionShade";
import type { PdfSelection, WordPlace } from "../store/types";

/** Eased in and out, cubic: what is lifted rises and settles. */
export const ease = (u: number) => {
  const t = Math.min(Math.max(u, 0), 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

/** Where PDFs lie: under the drawing, which is drawn over them. */
export const Z = -0.4;
/** How long the view stays still before sharper tiles are asked for, in ms - still being under these a frame: a share of the zoom, and pixels moved. */
export const SETTLE_MS = 90;
const STILL_ZOOM = 0.003;
const STILL_PX = 0.5;
/** How long things take: a page turned, a page spread or gathered, in ms. */
const TURN_MS = 380;
const SPREAD_MS = 460;
const SPREAD_STAGGER_MS = 45;
/** How long a PDF takes to be made an icon, or full size again, in ms. */
const ICON_MS = 380;

/** The corner that folds, on the screen, in pixels. */
const FOLD_PX = 30;

const NOTHING_FOUND: never[] = [];

/** The light round a PDF hovered, or one whose page in the column is: as words on the page are lit. */
const LIT = 0.16;
const LIT_PAD_PX = 5;
/** How far a press may move and still be a click, in pixels. */
const CLICK_PX = 4;
/** How large a page's words must be on the screen to be selected by a long press on them - pixels a point. */
const READABLE_PX_PER_PT = 0.6;
/** How far in from a page's edge its rim reaches, on the screen, in pixels: held there, the PDF is taken hold of. */
const RIM_PX = 16;
/** How far a press moves before it moves the view (PanZoom2D's), in pixels: a hold begun is let go. */
const PAN_PX = 3;
/** How quickly the light of a PDF let go goes, in ms. */
const HELD_FADE_MS = 140;

type Pointerish = { button?: number; clientX: number; clientY: number; pointerId?: number };
const native = (e: unknown): Pointerish => ((e as { nativeEvent?: Pointerish }).nativeEvent ?? (e as Pointerish));

export default function Pdfs2D() {
  const pdfs = useEditor((s) => s.pdfs);
  const hoveredPdf = useEditor((s) => s.hoveredPdf);
  const litPdf = useEditor((s) => s.litPdf);
  // (words selected, and places found, marked on the pages)
  const pdfSel = useEditor((s) => s.pdfSel);
  const pdfFind = useEditor((s) => s.pdfFind);
  const found = pdfFind?.found ?? NOTHING_FOUND;
  const foundNow = pdfFind ? (pdfFind.found[pdfFind.now] ?? null) : null;
  const pdfFlash = useEditor((s) => s.pdfFlash);
  const store = useEditorStore();
  const { camera, gl, invalidate, size } = useThree();
  const [, setTick] = useState(0);
  const redraw = useCallback(() => {
    setTick((t) => t + 1);
    invalidate();
  }, [invalidate]);
  const pics = usePictures(redraw);
  // (an icon's name in the drawing's type, as its labels are set)
  const { opts } = useDrawnLayout();
  const family = opts.fontFamily ?? "Arial";
  const nameFont = useLabelFontUrl(family, needsFallback(pdfs.map((p) => p.name)));

  // the view: where it is, how near, and since when it has been still
  const view = useRef({ zoom: 0, x: 0, y: 0, still: 0, level: new Map<number, number>() });
  const settleTimer = useRef<number | null>(null);
  useEffect(() => () => void (settleTimer.current != null && window.clearTimeout(settleTimer.current)), []);
  // each PDF's motion: a page turned (the one that went), its pages spread or gathered, and its light
  const motion = useRef(new Map<number, Motion>());
  const was = useRef(new Map<number, PdfItem>());
  const reader = readerOf(store);
  for (const p of pdfs) {
    const before = was.current.get(p.id);
    // (the page the column has come to comes on top quietly: it was turned there, not here)
    const quiet = p.reading && reader.id === p.id && reader.page === p.page;
    if (before && before.page !== p.page && !p.spread && !quiet) motion.current.set(p.id, { ...motion.current.get(p.id), turned: { page: before.page, start: performance.now() } });
    const lit = hoveredPdf === p.id || litPdf === p.id;
    const m = motion.current.get(p.id);
    if (!!m?.lit?.on !== lit && (m?.lit || lit)) motion.current.set(p.id, { ...m, lit: { on: lit, start: performance.now(), from: litOf(m, performance.now()) } });
    if (before && !!before.spread !== !!p.spread) motion.current.set(p.id, { ...motion.current.get(p.id), spread: { to: !!p.spread, start: performance.now() } });
    if (before && !!before.icon !== !!p.icon) motion.current.set(p.id, { ...motion.current.get(p.id), icon: { to: !!p.icon, start: performance.now() } });
  }
  was.current = new Map(pdfs.map((p) => [p.id, p]));

  // a PDF just put on the page is brought into view, the view easing to it
  // where it is not all in view already (not one the canvas opened with)
  const newest = useRef<number | null>(null);
  useEffect(() => {
    const top = pdfs.reduce((m, p) => Math.max(m, p.id), 0);
    if (newest.current == null) {
      newest.current = top;
      return;
    }
    if (top <= newest.current) return;
    const added = pdfs.filter((p) => p.id > newest.current!);
    newest.current = top;
    const b = added.map(pdfRoom).reduce((u, x) => ({ x0: Math.min(u.x0, x.x0), x1: Math.max(u.x1, x.x1), y0: Math.min(u.y0, x.y0), y1: Math.max(u.y1, x.y1) }));
    const cam = camera as THREE.OrthographicCamera;
    const a = pageAt(-1, -1, cam);
    const c = pageAt(1, 1, cam);
    // (what can be seen: the column over the canvas's right side left out)
    const cover = store.getState().cover;
    const right = Math.max(a.x, c.x) - cover / cam.zoom;
    const inView = b.x0 >= Math.min(a.x, c.x) && b.x1 <= right && b.y0 >= Math.min(a.y, c.y) && b.y1 <= Math.max(a.y, c.y);
    if (inView) return;
    const pad = 1.12;
    const zoom = Math.min((size.width - cover) / ((b.x1 - b.x0) * pad), size.height / ((b.y1 - b.y0) * pad), cam.zoom);
    setViewGoal(cam, { zoom, x: (b.x0 + b.x1) / 2 + cover / 2 / zoom, y: (b.y0 + b.y1) / 2 });
    invalidate();
  }, [pdfs, camera, size, invalidate]);

  const toWorld = (cx: number, cy: number) => {
    const rect = (gl.domElement as HTMLCanvasElement).getBoundingClientRect();
    const p = pageAt(((cx - rect.left) / rect.width) * 2 - 1, -(((cy - rect.top) / rect.height) * 2 - 1), camera);
    return { x: p.x, y: p.y };
  };

  // which sheets are in view, and the tiles they want at the level the view wants
  useFrame(() => {
    const cam = camera as THREE.OrthographicCamera;
    const v = view.current;
    const now = performance.now();
    // (a glide's tail - well under a pixel a frame, a fraction of a percent of
    // the zoom - is still enough for the tiles: they are asked for then, not
    // once it has quite stopped)
    const zoomed = Math.abs(cam.zoom - v.zoom) > 1e-6 * cam.zoom;
    const moving = Math.abs(cam.zoom - v.zoom) > STILL_ZOOM * cam.zoom || Math.hypot(cam.position.x - v.x, cam.position.y - v.y) * cam.zoom > STILL_PX;
    if (zoomed || moving) {
      // (zoomed: what is drawn the same size on the screen is drawn again at it)
      if (zoomed) setTick((t) => t + 1);
      v.zoom = cam.zoom;
      v.x = cam.position.x;
      v.y = cam.position.y;
    }
    if (moving) {
      v.still = now;
      // (and once the view has been still a moment, a frame, to ask for sharper tiles)
      if (settleTimer.current != null) window.clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(() => invalidate(), SETTLE_MS + 20);
    }
    const settled = now - v.still > SETTLE_MS;
    let animating = false;
    for (const m of motion.current.values()) {
      // (drawn until a little past the end, so that the last frame drawn is the end's)
      if ((m.turned && now - m.turned.start < TURN_MS + 80) || (m.spread && now - m.spread.start < SPREAD_MS + 20 * SPREAD_STAGGER_MS + 80)) animating = true;
    }
    // (a place shown marked, fading)
    const flash = store.getState().pdfFlash;
    if (flash && now - flash.start < FLASH_MS + 80) animating = true;
    for (const m of motion.current.values()) {
      if (m.lit && now - m.lit.start < FADE_MS + 80) animating = true;
      if (m.icon && now - m.icon.start < ICON_MS + 80) animating = true;
      if (m.held && (m.held.let == null || now - m.held.let < HELD_FADE_MS + 80)) animating = true;
    }
    // (the tiles' fading in, and the motions, ask for frames while they last)
    const fading = pics.fading(now);
    // (what moves is worked out as it is drawn: drawn again each frame while it moves)
    if (animating || fading) redraw();
    if (!settled) return;
    const a = pageAt(-1, -1, cam);
    const b = pageAt(1, 1, cam);
    const seen = { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) };
    const mid = { x: (seen.x0 + seen.x1) / 2, y: (seen.y0 + seen.y1) / 2 };
    const dpr = gl.getPixelRatio();
    // pixels of the screen a point of the page takes
    const want = cam.zoom * dpr * POINT;
    let asked = false;
    for (const p of pdfs) {
      // (an icon is its page made small: sharp too, seen near)
      const sheets = p.icon
        ? [{ s: shownSheet(p, p.page)!, page: p.page }]
        : p.spread
          ? spreadSheets(p).map((s, i) => ({ s, page: i }))
          : [{ s: topSheet(p), page: p.page }];
      for (const { s, page } of sheets) {
        if (s.x + s.w / 2 < seen.x0 || s.x - s.w / 2 > seen.x1 || s.y + s.h / 2 < seen.y0 || s.y - s.h / 2 > seen.y1) continue;
        // (the page's units a point, as it is drawn)
        const unit = s.w / p.pages[page][0];
        // (its letters, ready for a press on its words, where they can be read)
        if (!p.icon && want >= READABLE_PX_PER_PT * dpr) textHad(p.sha256, page);
        // (the level: pixels a point, a power of two above what the screen wants; none, where the preview is enough)
        const level = levelFor(want * (unit / POINT), p.pages[page][0]);
        v.level.set(p.id * 100000 + page, level);
        if (!level) continue;
        const left = s.x - s.w / 2;
        const top = s.y + s.h / 2;
        asked =
          pics.ask(
            {
              sha256: p.sha256,
              page,
              size: p.pages[page],
              level,
              part: { x0: (seen.x0 - left) / unit, x1: (seen.x1 - left) / unit, y0: (top - seen.y1) / unit, y1: (top - seen.y0) / unit },
              nearness: (i, j) => Math.hypot(left + ((i + 0.5) * TILE * unit) / level - mid.x, top - ((j + 0.5) * TILE * unit) / level - mid.y),
              stillSince: () => view.current.still,
            },
            now,
          ) || asked;
      }
    }
    // tiles not wanted for a while let go
    pics.letGo(now);
    if (asked) redraw();
  });

  /** Words selected pressed on a stack: carried out as the pointer moves (components/wordsDrag); let go where they were, nothing selected. */
  const liftWords = (p: PdfItem, ev: Pointerish, sel: PdfSelection) => {
    store.getState().beginPanHold(ev.pointerId ?? null);
    let carried = false;
    const onMove = (m: PointerEvent) => {
      if (carried || Math.hypot(m.clientX - ev.clientX, m.clientY - ev.clientY) < CLICK_PX) return;
      carried = true;
      // (from where it was pressed, where the words lie on the screen now)
      const cam = camera as THREE.OrthographicCamera;
      const rect = (gl.domElement as HTMLCanvasElement).getBoundingClientRect();
      void dragWords(store, p, sel, { x: ev.clientX, y: ev.clientY }, {
        pxPerPoint: cam.zoom * POINT,
        at: (page, x, y) => {
          const s = shownSheet(p, page) ?? topSheet(p);
          const wx = s.x - s.w / 2 + x * POINT;
          const wy = s.y + s.h / 2 - y * POINT;
          return { x: rect.left + rect.width / 2 + (wx - cam.position.x) * cam.zoom, y: rect.top + rect.height / 2 - (wy - cam.position.y) * cam.zoom };
        },
      });
    };
    const onUp = (u: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
      store.getState().endPanHold(u.pointerId);
      if (!carried) store.getState().setPdfSel(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, true);
  };

  /** The link, if any, at a point of the page on a PDF's page in view: its top page, or one of its pages spread. */
  const linkOn = (p: PdfItem, q: { x: number; y: number }): PdfLink | null => {
    if (p.icon) return null;
    const sheets = p.spread ? spreadSheets(p).map((s, page) => ({ s, page })) : [{ s: topSheet(p), page: p.page }];
    const hit = sheets.find(({ s }) => Math.abs(q.x - s.x) <= s.w / 2 && Math.abs(q.y - s.y) <= s.h / 2);
    if (!hit) return null;
    const links = linksOf(p.sha256, hit.page, invalidate);
    return links ? linkAt(links, (q.x - (hit.s.x - hit.s.w / 2)) / POINT, (hit.s.y + hit.s.h / 2 - q.y) / POINT) : null;
  };
  /**
   * The words, if any can be read there, under a point of the page on a
   * PDF: on its top page, or a page spread - at a size they can be read on
   * the screen, their letters come.
   */
  const wordsOn = (p: PdfItem, q: { x: number; y: number }): { page: number; t: PageText; x: number; y: number; sheet: Sheet } | null => {
    if (p.icon || (camera as THREE.OrthographicCamera).zoom * POINT < READABLE_PX_PER_PT) return null;
    const sheets = p.spread ? spreadSheets(p).map((s, page) => ({ s, page })) : [{ s: topSheet(p), page: p.page }];
    const hit = sheets.find(({ s }) => Math.abs(q.x - s.x) <= s.w / 2 && Math.abs(q.y - s.y) <= s.h / 2);
    const t = hit ? textHad(p.sha256, hit.page, invalidate) : null;
    if (!hit || !t) return null;
    return { page: hit.page, t, x: (q.x - (hit.s.x - hit.s.w / 2)) / POINT, y: (hit.s.y + hit.s.h / 2 - q.y) / POINT, sheet: hit.s };
  };
  /** Over a link on a PDF, the system's hand (its words are selected by a long press, not the text cursor's drag). */
  const hoverAt = (p: PdfItem | null, q?: { x: number; y: number }) => {
    const want = p && q && linkOn(p, q) ? "pointer" : "";
    const dom = gl.domElement as HTMLCanvasElement;
    if (dom.style.cursor !== want) dom.style.cursor = want;
  };

  /** Whether a point of a PDF is on its rim: not well inside a page of it - by its edges, on the pages under it, or its name. */
  const onRim = (p: PdfItem, q: { x: number; y: number }) => {
    const inset = RIM_PX / Math.max((camera as THREE.OrthographicCamera).zoom, 1e-6);
    const sheets = p.spread ? spreadSheets(p) : [topSheet(p)];
    return !sheets.some((s) => Math.abs(q.x - s.x) <= s.w / 2 - inset && Math.abs(q.y - s.y) <= s.h / 2 - inset);
  };
  /** A PDF taken hold of by a press held on it, lit from where it is held out: or its light let go. */
  const holdPdf = (id: number, held: Motion["held"]) => {
    motion.current.set(id, { ...motion.current.get(id), held });
    redraw();
  };

  /**
   * A press on a PDF. Full size: a drag moves the view, as on empty space;
   * held still a moment, on its words - where they can be read - a selection
   * begins there, the word under the press, drawn on as the pointer goes; on
   * its rim, or anywhere on it where its words are too small to read, it is
   * taken hold of - lit from the pointer out, as a structure is - and the
   * drag then moves it, as one step. An icon follows a drag at once. Let go
   * where it was pressed, on a link, the link is followed.
   */
  const startMove = (p: PdfItem, e: { stopPropagation: () => void }) => {
    const ev = native(e);
    if ((ev.button ?? 0) !== 0) return;
    const st = store.getState();
    // (what is drawn over it is pressed, not it)
    if (st.hovered.atomId != null || st.hovered.bondId != null || st.hovered3d || st.hoveredArrow != null || st.hoveredPlus != null || st.hoveredCaption != null) return;
    e.stopPropagation();
    const q = toWorld(ev.clientX, ev.clientY);
    // (on its words selected, at a size they can be read: the words carried out)
    const w = wordsOn(p, q);
    const sel = st.pdfSel;
    if (w && selects(sel) && sel.id === p.id && onSelected(w.t, sel, w.page, w.x, w.y)) {
      liftWords(p, ev, sel);
      return;
    }
    const off = { x: p.x - q.x, y: p.y - q.y };
    const gesture = `move-${performance.now()}`;
    const readable = (camera as THREE.OrthographicCamera).zoom * POINT >= READABLE_PX_PER_PT;
    // what a hold there does: take hold of it, or begin a selection; an icon is moved at once
    const takes = !p.icon && (onRim(p, q) || !readable);
    const letter = !p.icon && !takes && w ? letterNear(w.t, w.x, w.y) : null;
    let mode: "pressed" | "moving" | "selecting" | "panned" = p.icon ? "moving" : "pressed";
    let selecting: { first: [WordPlace, WordPlace] } | null = null;
    let hold: number | null = null;
    let panHeld = false;
    const holdPan = () => {
      if (panHeld) return;
      panHeld = true;
      store.getState().beginPanHold(ev.pointerId ?? null);
    };
    if (p.icon) holdPan();
    const letHoldGo = () => {
      if (hold != null) window.clearTimeout(hold);
      hold = null;
      if (store.getState().pressHold) store.getState().setPressHold(null);
    };
    if (takes) {
      // (lit from where it is held, as it is held; taken hold of, it moves)
      holdPdf(p.id, { x: q.x - p.x, y: q.y - p.y, start: performance.now() });
      hold = window.setTimeout(() => {
        hold = null;
        mode = "moving";
        holdPan();
        const m = motion.current.get(p.id);
        if (m?.held) holdPdf(p.id, { ...m.held, done: true });
      }, LONG_PRESS_MS);
    } else if (w && letter != null) {
      st.setPressHold({ at: q, start: performance.now() });
      hold = window.setTimeout(() => {
        hold = null;
        store.getState().setPressHold(null);
        mode = "selecting";
        holdPan();
        const [a, b] = wordAt(w.t, letter, w.x);
        selecting = { first: [{ page: w.page, at: a }, { page: w.page, at: b }] };
        store.getState().setPdfSel({ id: p.id, anchor: selecting.first[0], focus: selecting.first[1] });
      }, LONG_PRESS_MS);
    }
    const letLightGo = () => {
      const m = motion.current.get(p.id);
      if (m?.held && m.held.let == null) holdPdf(p.id, { ...m.held, let: performance.now() });
    };
    const onMove = (m: PointerEvent) => {
      if (mode === "selecting" && selecting && w) {
        // (by letters, beyond the word first selected)
        const r = toWorld(m.clientX, m.clientY);
        const x = (r.x - (w.sheet.x - w.sheet.w / 2)) / POINT;
        const y = (w.sheet.y + w.sheet.h / 2 - r.y) / POINT;
        const place: WordPlace = { page: w.page, at: placeAt(w.t, x, y) };
        const [a, b] = selecting.first;
        const within = !placeBefore(place, a) && placeBefore(place, b);
        store.getState().setPdfSel(within ? { id: p.id, anchor: a, focus: b } : { id: p.id, anchor: placeBefore(place, a) ? b : a, focus: place });
        return;
      }
      const away = Math.hypot(m.clientX - ev.clientX, m.clientY - ev.clientY);
      if (mode === "pressed") {
        // (moved before it was held long enough: the view moves, as on empty space)
        if (away < PAN_PX) return;
        mode = "panned";
        letHoldGo();
        letLightGo();
        return;
      }
      if (mode !== "moving" || (p.icon && away < MOV_PX)) return;
      const r = toWorld(m.clientX, m.clientY);
      store.getState().movePdf(p.id, r.x + off.x, r.y + off.y, gesture);
    };
    const onUp = (u: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
      letHoldGo();
      letLightGo();
      if (panHeld) store.getState().endPanHold(u.pointerId);
      const away = Math.hypot(u.clientX - ev.clientX, u.clientY - ev.clientY);
      if (mode === "selecting" || mode === "panned" || away >= CLICK_PX || (mode === "moving" && !p.icon)) return;
      // a click: the words selected let go, a link followed
      store.getState().setPdfSel(null);
      const now = store.getState().pdfs.find((x) => x.id === p.id);
      const link = now ? linkOn(now, toWorld(u.clientX, u.clientY)) : null;
      if (now && link) followLink(store, now, link);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, true);
  };

  const now = performance.now();
  const cam = camera as THREE.OrthographicCamera;
  const px = 1 / Math.max(cam.zoom, 1e-6);
  return (
    <group position={[0, 0, Z]}>
      {pdfs.map((p) => (
        <PdfStack
          key={p.id}
          p={p}
          now={now}
          px={px}
          hovered={hoveredPdf === p.id}
          motion={motion.current.get(p.id)}
          previewOf={(page) => pics.preview(p, page)}
          tilesOf={(page) => pics.tilesOf(p.sha256, page, view.current.level.get(p.id * 100000 + page) ?? 0)}
          marksOf={(page) => marksOn(p, page, pdfSel, found, foundNow, redraw, pdfFlash)}
          onOver={() => store.getState().setHoveredPdf(p.id)}
          onOut={() => {
            hoverAt(null);
            if (store.getState().hoveredPdf === p.id) store.getState().setHoveredPdf(null);
          }}
          onHover={(q) => hoverAt(p, q)}
          onDown={(e) => startMove(p, e)}
          onTurn={(page) => store.getState().turnPdf(p.id, page)}
          size={size}
          type={{ size: opts.fontPx, font: nameFont }}
        />
      ))}
    </group>
  );
}

function PdfStack(props: {
  p: PdfItem;
  now: number;
  px: number;
  hovered: boolean;
  motion?: Motion;
  previewOf: (page: number) => Pic | null;
  tilesOf: (page: number) => Tile[];
  marksOf: (page: number) => Mark[];
  onOver: () => void;
  onOut: () => void;
  onHover: (q: { x: number; y: number }) => void;
  onDown: (e: { stopPropagation: () => void }) => void;
  onTurn: (page: number) => void;
  size: { width: number; height: number };
  /** The drawing's type: its labels' size, in the page's units, and its font, once it is had. */
  type: { size: number; font: string | null };
}) {
  const { p, now, px, motion } = props;
  const top = topSheet(p);
  const spread = spreadSheets(p);
  const under = stackSheets(p);
  // how far its pages are spread: 0 stacked, 1 spread, each page on its way after the one before
  const sm = motion?.spread;
  const spreadAt = (i: number) => {
    if (!sm) return p.spread ? 1 : 0;
    const t = Math.min(1, Math.max(0, (now - sm.start - i * SPREAD_STAGGER_MS) / SPREAD_MS));
    const e = ease(t);
    return sm.to ? e : 1 - e;
  };
  const spreading = !!sm && now - sm.start < SPREAD_MS + p.pages.length * SPREAD_STAGGER_MS;
  const showSpread = p.spread || spreading;
  // how large it is: 1 full size, an icon's size made small, or on its way between them
  const small = iconScale(p);
  const im = motion?.icon;
  const it = im ? ease((now - im.start) / ICON_MS) : 1;
  const k = im ? (im.to ? 1 + (small - 1) * it : small + (1 - small) * it) : p.icon ? small : 1;
  // (how much of an icon it is, 0 to 1: its name going under its middle)
  const iconness = small < 1 ? (1 - k) / (1 - small) : 0;
  const atSize = (node: ReactNode) =>
    k === 1 ? (
      node
    ) : (
      <group position={[p.x, p.y, 0]} scale={[k, k, 1]}>
        <group position={[-p.x, -p.y, 0]}>{node}</group>
      </group>
    );
  // (lit, round all of it: hovered, or its page in the column)
  const lit = litOf(motion, now);
  const full = pdfBounds({ ...p, icon: false });
  const b = showSpread
    ? full
    : { x0: p.x + (full.x0 - p.x) * k, x1: p.x + (full.x1 - p.x) * k, y0: p.y + (full.y0 - p.y) * k, y1: p.y + (full.y1 - p.y) * k };
  const pad = LIT_PAD_PX * px;
  const light = lit > 0.001 && (
    <mesh position={[(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, -0.02]} scale={[b.x1 - b.x0 + 2 * pad, b.y1 - b.y0 + 2 * pad, 1]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial color={COLORS.highlight} transparent opacity={lit} depthWrite={false} toneMapped={false} />
    </mesh>
  );
  const held = motion?.held && <HeldLight b={{ x0: b.x0 - pad, x1: b.x1 + pad, y0: b.y0 - pad, y1: b.y1 + pad }} at={{ x: p.x + motion.held.x, y: p.y + motion.held.y }} held={motion.held} now={now} />;
  // its name under it, in the drawing's type: at its left as a page, as
  // small on the screen however near it is seen; under its middle as an
  // icon, at the size of the drawing's labels, as a file's under its icon -
  // and on its way between them
  const nameX = showSpread ? spread[0].x - spread[0].w / 2 : p.x - (top.w * k) / 2 + ((top.w * k) / 2) * iconness;
  const nameY = showSpread ? Math.min(...spread.map((s) => s.y - s.h / 2)) : b.y0;
  const nameSize = 12 * px * (1 - iconness) + props.type.size * iconness;
  const nameGap = 14 * px * (1 - iconness) + 0.4 * props.type.size * iconness;
  const nameWidth = Math.max(120 * px, top.w) * (1 - iconness) + ICON_NAME_WIDTH * iconness;
  const name = (
    <group position={[nameX, nameY - nameGap, 0.01]}>
      {/* (troika takes a share of the text's width as its anchor; drei's types do not say so) */}
      <Text
        font={props.type.font ?? undefined}
        fontSize={nameSize}
        anchorX={`${50 * iconness}%` as unknown as number}
        anchorY="top"
        color={GRAY}
        maxWidth={nameWidth}
        textAlign={iconness > 0.5 ? "center" : "left"}
      >
        {p.name}
      </Text>
    </group>
  );

  if (showSpread) {
    return (
      <group onPointerOver={props.onOver} onPointerOut={props.onOut} onPointerDown={props.onDown} onPointerMove={(e) => props.onHover(e.point)}>
        {p.pages.map((_, i) => {
          const k = spreadAt(i);
          const from = i === p.page ? top : { ...top, x: top.x + UNDER(i, p), y: top.y - UNDER(i, p) };
          const to = spread[i];
          const lift = Math.sin(Math.PI * k);
          const s: Sheet = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, w: from.w + (to.w - from.w) * k, h: from.h + (to.h - from.h) * k };
          return <Page key={i} s={s} pt={p.pages[i]} lift={lift} z={0.02 * i + 0.2 * lift} now={now} px={px} preview={props.previewOf(i)} tiles={props.tilesOf(i)} marks={props.marksOf(i)} />;
        })}
        {light}
        {held}
        {name}
      </group>
    );
  }

  // turned: the page that went lifts toward the viewer and goes under, fading
  const tm = motion?.turned;
  const tt = tm ? Math.min(1, (now - tm.start) / TURN_MS) : 1;
  const going = tm && tt < 1 ? tm.page : null;
  const forward = tm ? p.page > tm.page : true;
  // (its corners turn its pages full size only)
  const hasNext = p.page < p.pages.length - 1 && k === 1;
  const hasPrev = p.page > 0 && k === 1;
  const fold = FOLD_PX * px;
  // (what is drawn made smaller is drawn with a screen's pixel the larger)
  const inPx = px / k;
  return (
    <group onPointerOver={props.onOver} onPointerOut={props.onOut} onPointerDown={props.onDown} onPointerMove={(e) => props.onHover(e.point)}>
      {atSize(
        <>
          {under.map((s, i) => (
            <BlankSheet key={i} s={s} z={0.01 * i} />
          ))}
          <Page s={top} pt={p.pages[p.page]} lift={0} z={0.06} now={now} px={inPx} preview={props.previewOf(p.page)} tiles={props.tilesOf(p.page)} marks={k === 1 ? props.marksOf(p.page) : undefined} />
      {going != null && (
        <Page
          pt={p.pages[going]}
          s={{
            ...top,
            x: top.x + (forward ? 1 : -1) * ease(tt) * top.w * 0.12,
            y: top.y - ease(tt) * top.h * 0.04,
          }}
          lift={Math.sin(Math.PI * Math.min(1, tt * 1.2))}
          z={0.3}
          opacity={1 - ease(tt)}
          now={now}
          px={inPx}
          preview={props.previewOf(going)}
          tiles={[]}
        />
      )}
        </>,
      )}
      {props.hovered && hasNext && <Fold s={top} size={fold} corner="right" onTurn={() => props.onTurn(p.page + 1)} />}
      {props.hovered && hasPrev && <Fold s={top} size={fold} corner="left" onTurn={() => props.onTurn(p.page - 1)} />}
      {light}
      {held}
      {name}
    </group>
  );
}

// language=GLSL
const HELD_VERTEX = /* glsl */ `
varying vec2 vAt;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vAt = w.xy;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
// language=GLSL
const HELD_FRAGMENT = /* glsl */ `
uniform vec2 uAt;
uniform float uReach;
uniform float uSoft;
uniform float uOpacity;
uniform vec3 uColor;
varying vec2 vAt;
void main() {
  float a = uOpacity * (1.0 - smoothstep(uReach - uSoft, uReach, distance(vAt, uAt)));
  if (a <= 0.0) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}
`;

/**
 * A PDF taken hold of, lit as a structure is: the selection's shade, over
 * it, spreading out from where it is held as the press is held - reaching
 * all of it just as it is taken hold of - and going once it is let go.
 */
function HeldLight({ b, at, held, now }: { b: { x0: number; x1: number; y0: number; y1: number }; at: { x: number; y: number }; held: NonNullable<Motion["held"]>; now: number }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uAt: { value: new THREE.Vector2() },
          uReach: { value: 0 },
          uSoft: { value: 1 },
          uOpacity: { value: 0 },
          uColor: { value: new THREE.Color(COLORS.highlight) },
        },
        vertexShader: HELD_VERTEX,
        fragmentShader: HELD_FRAGMENT,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  // (the farthest of it reached just as it is taken hold of)
  const far = Math.max(...[b.x0, b.x1].flatMap((x) => [b.y0, b.y1].map((y) => Math.hypot(x - at.x, y - at.y))));
  const u = held.done ? 1 : Math.min(1, Math.max(0, (now - held.start - LONG_PRESS_SHOW_MS) / (LONG_PRESS_MS - LONG_PRESS_SHOW_MS)));
  const soft = 0.12 * far;
  const fade = held.let == null ? 1 : Math.max(0, 1 - (now - held.let) / HELD_FADE_MS);
  material.uniforms.uAt.value.set(at.x, at.y);
  material.uniforms.uReach.value = (far + soft) * (1 - (1 - u) ** 3);
  material.uniforms.uSoft.value = soft;
  material.uniforms.uOpacity.value = ALPHA.highlight * SHADE * fade;
  if (fade <= 0) return null;
  return (
    <mesh position={[(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, 0.45]} scale={[b.x1 - b.x0, b.y1 - b.y0, 1]} material={material}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}

/**
 * What moves of a PDF: a page turned (the one that went), its pages spread
 * or gathered, it made an icon or full size, its light coming or going; and
 * it taken hold of by a press held on it - where, from its middle, since
 * when, whether it has been, and when it was let go.
 */
type Motion = {
  turned?: { page: number; start: number };
  spread?: { to: boolean; start: number };
  icon?: { to: boolean; start: number };
  lit?: { on: boolean; start: number; from: number };
  held?: { x: number; y: number; start: number; done?: boolean; let?: number };
};

/** How lit a PDF is now, easing to lit or not. */
function litOf(m: Motion | undefined, now: number): number {
  if (!m?.lit) return 0;
  const to = m.lit.on ? LIT : 0;
  return m.lit.from + (to - m.lit.from) * ease((now - m.lit.start) / FADE_MS);
}

/** Where page `i` lies in the stack before it is spread: on top, or under it. */
const UNDER = (i: number, p: PdfItem) => Math.min(4, Math.abs(i - p.page)) * 0.7;

/** A sheet with nothing on it yet: white, its edge a hairline. */
function BlankSheet({ s, z }: { s: Sheet; z: number }) {
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)), []);
  return (
    <group position={[s.x, s.y, z]}>
      <mesh scale={[s.w, s.h, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
      <lineSegments geometry={edges} scale={[s.w, s.h, 1]}>
        <lineBasicMaterial color={LINE} toneMapped={false} />
      </lineSegments>
    </group>
  );
}

/** The corner of the page on top that folds as the stack is hovered: pressed, the next page - or, on the left, the one before - comes on top. */
function Fold({ s, size, corner, onTurn }: { s: Sheet; size: number; corner: "left" | "right"; onTurn: () => void }) {
  const shape = useMemo(() => {
    const g = new THREE.Shape();
    g.moveTo(0, 0);
    g.lineTo(1, 0);
    g.lineTo(0, 1);
    g.closePath();
    return g;
  }, []);
  const sign = corner === "right" ? -1 : 1;
  const x = corner === "right" ? s.x + s.w / 2 : s.x - s.w / 2;
  const y = s.y - s.h / 2;
  return (
    <group
      position={[x, y, 0.4]}
      scale={[sign * size, size, 1]}
      onPointerDown={(e) => {
        e.stopPropagation();
        onTurn();
      }}
    >
      <mesh>
        <shapeGeometry args={[shape]} />
        <meshBasicMaterial color={BASE} toneMapped={false} />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[new THREE.ShapeGeometry(shape)]} />
        <lineBasicMaterial color={LINE} toneMapped={false} />
      </lineSegments>
    </group>
  );
}
