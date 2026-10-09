/**
 * A PDF read in the column, drawn on the canvas (docs/PDF.md, *In the
 * column*, *One canvas*): the column lies over the canvas's right side, its
 * header in HTML (TextColumn), and what is read under it is drawn here, in
 * a view of its own - its pages one under another, as wide as the column,
 * where the column's reader says it is read (pdfColumnReader).
 *
 * The canvas is then drawn in three goes: the page, as ever; the column's
 * part of it, cut off where the column is; and a page on its way between
 * them - rising from the stack and going into the column as it opens,
 * growing to its width, or going back down to the stack as it is closed.
 *
 * The page most in view is the page on top of the stack on the page, and a
 * page turned there is gone to here: the two are one thing.
 */
import * as THREE from "three";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal, useFrame, useThree } from "@react-three/fiber";
import { useEditor, useEditorStore } from "../store";
import type { PdfFlight, PdfItem } from "../store/types";
import { pdfRoom, shownSheet, topSheet } from "../../../../lib/pdf/layout";
import { columnWidthFor } from "../utils/texts";
import { viewBesideColumn } from "./coverLayer";
import { setViewGoal, viewGoalOf } from "./viewGoal";
import { pagesInView } from "../../../../lib/pdf/column";
import { textHad } from "../../../../lib/pdf/text";
import { BASE, levelFor, Page, TILE, usePictures } from "./pdfPictures";
import { FLASH_MS, marksOn } from "./pdfMarks";
import { HEADER_PX, readerOf } from "./pdfColumnReader";
import { ease, SETTLE_MS } from "./Pdfs2D";

/** How long a page takes between the page and the column, in ms. */
export const FLIGHT_MS = 420;

/** A rectangle on the canvas, in CSS pixels from its top left. */
type Rect = { x: number; y: number; w: number; h: number };

export default function PdfColumn() {
  const store = useEditorStore();
  const { camera, size, invalidate } = useThree();
  const open = useEditor((s) => s.textsOpen);
  const shown = useEditor((s) => s.pdfShown);
  const cover = useEditor((s) => s.cover);
  const pdfs = useEditor((s) => s.pdfs);
  const flight = useEditor((s) => s.pdfFlight);
  // (shutting, it goes on showing what it showed as it slides away - and
  // under a text it has gone on to, as that fades in over it)
  const last = useRef<number | null>(null);
  if (open && shown != null) last.current = shown;
  const drawn = open && shown != null ? shown : cover > 0.5 ? last.current : null;
  const pdf = pdfs.find((p) => p.id === drawn) ?? null;
  const flown = flight ? (pdfs.find((p) => p.id === flight.id) ?? null) : null;
  // a PDF read in the column, the column opening on it over most of the
  // canvas: the view eases, as the column opens, so that the PDF is all in
  // what is left in view - smaller, where it would not be
  const rising = flight?.to === "column" ? flight.start : null;
  useLayoutEffect(() => {
    if (rising == null) return;
    const st = store.getState();
    const p = st.pdfs.find((x) => x.id === st.pdfFlight?.id);
    if (!p) return;
    const cam = camera as THREE.OrthographicCamera;
    const goal = viewGoalOf(cam);
    const view = { zoom: goal?.zoom ?? cam.zoom, x: goal?.x ?? cam.position.x, y: goal?.y ?? cam.position.y };
    const to = viewBesideColumn(view, size, { now: st.cover, final: columnWidthFor(size.width, true, st.pdfColumnWidth) }, pdfRoom(p));
    if (!to) return;
    setViewGoal(cam, to);
    invalidate();
    // (as the flight sets off, once)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rising]);
  if (!pdf && !flown) return null;
  return <ColumnPass pdf={pdf} flight={flight && flown ? flight : null} flown={flown} />;
}

function ColumnPass({ pdf, flight, flown }: { pdf: PdfItem | null; flight: PdfFlight | null; flown: PdfItem | null }) {
  const store = useEditorStore();
  const { gl, size, invalidate, camera } = useThree();
  const cover = useEditor((s) => s.cover);
  const width = useEditor((s) => s.columnWidth);
  // (words selected, and places found, marked on the pages)
  const pdfSel = useEditor((s) => s.pdfSel);
  const pdfFind = useEditor((s) => s.pdfFind);
  const pdfFlash = useEditor((s) => s.pdfFlash);
  const pdfLifted = useEditor((s) => s.pdfLifted);
  const [, setTick] = useState(0);
  const redraw = useCallback(() => {
    setTick((t) => t + 1);
    invalidate();
  }, [invalidate]);
  const pics = usePictures(redraw);
  const reader = readerOf(store);
  const tall = Math.max(1, size.height - HEADER_PX);

  // where a page going back to the stack set off from: where it was on the
  // screen as the column began to shut, or went on to something else - it
  // lifts from there, and does not go away with the column
  const from = useRef<{ start: number; rect: Rect } | null>(null);
  if (flight?.to === "page" && from.current?.start !== flight.start && reader.id === flight.id) {
    const { l, top, left } = reader.seen();
    const p = l.pages[flight.page];
    const x0 = size.width - store.getState().cover;
    if (p) from.current = { start: flight.start, rect: { x: x0 + p.x - left, y: HEADER_PX + p.y - top, w: p.w, h: p.h } };
  }
  if (pdf) reader.take(pdf);
  reader.width = width;
  reader.tall = tall;
  useEffect(() => {
    reader.redraw = redraw;
    return () => {
      reader.redraw = () => {};
      reader.letGo();
      pics.held.clear();
    };
  }, [reader, redraw, pics]);
  // (the column sliding, or made wider: drawn again)
  useEffect(() => invalidate(), [cover, width, invalidate]);

  // a page turned on the page - or undone, or gone to from the menu - is gone
  // to here (before the next frame, which would otherwise bring the page the
  // column is on back on top)
  const pageOnTop = pdf?.page;
  const pdfId = pdf?.id;
  useLayoutEffect(() => {
    // (as it is now, not as it was drawn: a page the column came to since is its own)
    const now = store.getState().pdfs.find((p) => p.id === pdfId)?.page;
    if (pageOnTop == null || now !== pageOnTop || now === reader.page) return;
    reader.page = now;
    reader.goTo(now);
  }, [pageOnTop, pdfId, reader, store]);

  const scene = useMemo(() => {
    const s = new THREE.Scene();
    s.background = new THREE.Color(BASE);
    return s;
  }, []);
  const cam = useMemo(() => new THREE.OrthographicCamera(0, 1, 0, -1, 0.1, 100), []);
  const flightScene = useMemo(() => new THREE.Scene(), []);
  const flightCam = useMemo(() => new THREE.OrthographicCamera(0, 1, 0, -1, 0.1, 100), []);
  useEffect(() => {
    cam.position.set(0, 0, 10);
    flightCam.position.set(0, 0, 10);
  }, [cam, flightCam]);

  const clock = useRef({ last: performance.now(), still: 0, levels: new Map<number, number>() });
  useFrame(({ gl: r, scene: page, camera }) => {
    const now = performance.now();
    const c = clock.current;
    const dt = Math.min(0.05, (now - c.last) / 1000);
    c.last = now;
    const st = store.getState();

    // the column: easing where it is sent, the page most in view said as it
    // goes, and on top on the page once it rests
    if (pdf && reader.id === pdf.id) {
      const going = reader.step(dt);
      if (reader.pageNow().changed) reader.tell("page");
      if (going) {
        c.still = now;
        redraw();
      } else {
        const onTop = st.pdfs.find((p) => p.id === pdf.id)?.page;
        if (onTop != null && onTop !== reader.page) st.readToPage(pdf.id, onTop, reader.page);
        // the tiles of the pages in view, once it has been still a moment
        if (now - c.still > SETTLE_MS) askTiles(now);
        else window.setTimeout(() => invalidate(), SETTLE_MS + 20);
      }
      if (pics.fading(now)) redraw();
      // (a place shown marked, fading)
      if (st.pdfFlash && now - st.pdfFlash.start < FLASH_MS + 80) redraw();
    }
    // a page between the page and the column
    if (flight) {
      if (now - flight.start >= FLIGHT_MS) st.endPdfFlight();
      redraw();
    }

    // drawn: the page; the column's part, cut off where it is; the page on its way
    const W = size.width;
    const H = size.height;
    r.autoClear = true;
    r.setScissorTest(false);
    r.setViewport(0, 0, W, H);
    r.render(page, camera);
    const covered = st.cover;
    if (pdf && covered > 0.5) {
      cam.left = 0;
      cam.right = reader.width;
      cam.top = 0;
      cam.bottom = -tall;
      cam.updateProjectionMatrix();
      r.autoClear = false;
      r.setScissorTest(true);
      r.setScissor(W - covered, 0, covered, tall);
      r.setViewport(W - covered, 0, reader.width, tall);
      r.render(scene, cam);
      r.setScissorTest(false);
      r.setViewport(0, 0, W, H);
    }
    if (flight) {
      flightCam.left = 0;
      flightCam.right = W;
      flightCam.top = 0;
      flightCam.bottom = -H;
      flightCam.updateProjectionMatrix();
      r.autoClear = false;
      r.clearDepth();
      r.render(flightScene, flightCam);
    }
    r.autoClear = true;
  }, 1);

  /** The tiles of the column's pages in view asked for at the level the screen wants. */
  const askTiles = (now: number) => {
    if (!pdf) return;
    const { l, top, left } = reader.seen();
    const dpr = gl.getPixelRatio();
    const level = levelFor(l.scale * dpr, Math.max(...pdf.pages.map(([w]) => w)));
    const held = new Set<string>();
    let asked = false;
    for (const i of pagesInView(l, top, tall)) {
      const p = l.pages[i];
      // (its letters, ready for a press on its words)
      textHad(pdf.sha256, i);
      clock.current.levels.set(i, level);
      if (!level) continue;
      const part = {
        x0: (left - p.x) / l.scale,
        x1: (left + reader.width - p.x) / l.scale,
        y0: (top - p.y) / l.scale,
        y1: (top + tall - p.y) / l.scale,
      };
      // (the column's own come first, nearest its middle)
      const mid = { x: left + reader.width / 2, y: top + tall / 2 };
      asked =
        pics.ask(
          {
            sha256: pdf.sha256,
            page: i,
            size: pdf.pages[i],
            level,
            part,
            nearness: (ti, tj) => -0.5 + Math.hypot(p.x + ((ti + 0.5) * TILE * l.scale) / level - mid.x, p.y + ((tj + 0.5) * TILE * l.scale) / level - mid.y) * 1e-6,
            stillSince: () => clock.current.still,
          },
          now,
        ) || asked;
      for (const t of pics.tilesOf(pdf.sha256, i, level)) held.add(t.key);
    }
    pics.held = held;
    if (asked) redraw();
  };

  const now = performance.now();
  // the column's pages in view, and those just beyond, to be ready
  const column = (() => {
    if (!pdf || reader.id !== pdf.id) return null;
    const { l, top, left } = reader.seen();
    // (the page on its way, in or out, is the one flying, not one left in the column)
    const hidden = flight?.id === pdf.id ? flight.page : null;
    return pagesInView(l, top, tall, tall / 2)
      .filter((i) => i !== hidden)
      .map((i) => {
        const p = l.pages[i];
        return (
          <Page
            key={i}
            s={{ x: p.x - left + p.w / 2, y: -(p.y - top + p.h / 2), w: p.w, h: p.h }}
            pt={pdf.pages[i]}
            lift={0}
            z={0}
            now={now}
            px={1}
            preview={pics.preview(pdf, i)}
            tiles={pics.tilesOf(pdf.sha256, i, clock.current.levels.get(i) ?? 0)}
            marks={marksOn(pdf, i, pdfSel, pdfFind?.found ?? [], pdfFind ? (pdfFind.found[pdfFind.now] ?? null) : null, redraw, pdfFlash, pdfLifted)}
          />
        );
      });
  })();

  // the page on its way: from the stack to its place in the column, or back
  const flying = (() => {
    if (!flight || !flown) return null;
    const t = Math.min(1, (now - flight.start) / FLIGHT_MS);
    const k = ease(t);
    const onPage = stackRect(flown, flight.page);
    let inColumn: Rect | null = null;
    const x0 = size.width - store.getState().cover;
    if (flight.to === "column" && reader.id === flight.id) {
      const { l, top, left } = reader.seen();
      const p = l.pages[flight.page];
      if (p) inColumn = { x: x0 + p.x - left, y: HEADER_PX + p.y - top, w: p.w, h: p.h };
    } else if (flight.to === "page" && from.current?.start === flight.start) inColumn = from.current.rect;
    if (!onPage || !inColumn) return null;
    const [a, b] = flight.to === "column" ? [onPage, inColumn] : [inColumn, onPage];
    const r = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k };
    const level = clock.current.levels.get(flight.page) ?? 0;
    return (
      <Page
        s={{ x: r.x + r.w / 2, y: -(r.y + r.h / 2), w: r.w, h: r.h }}
        pt={flown.pages[flight.page]}
        lift={Math.sin(Math.PI * t)}
        z={0}
        now={now}
        px={1}
        preview={pics.preview(flown, flight.page)}
        tiles={pics.tilesOf(flown.sha256, flight.page, level)}
      />
    );
  })();

  /** Where a PDF's page lies on the canvas now: on top of its stack, among its pages spread, or on its icon. */
  function stackRect(p: PdfItem, page: number): Rect | null {
    const s = shownSheet(p, page) ?? topSheet(p);
    if (!s) return null;
    const c = camera as THREE.OrthographicCamera;
    const z = c.zoom || 1;
    return {
      x: size.width / 2 + (s.x - s.w / 2 - c.position.x) * z,
      y: size.height / 2 - (s.y + s.h / 2 - c.position.y) * z,
      w: s.w * z,
      h: s.h * z,
    };
  }

  return (
    <>
      {createPortal(<>{column}</>, scene)}
      {createPortal(<>{flying}</>, flightScene)}
    </>
  );
}
