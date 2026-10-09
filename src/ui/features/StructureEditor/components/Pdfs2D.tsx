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
 * Moved by a drag; the page on top turned by the corner that folds as the
 * stack is hovered, or by the arrow keys over it (StructureCanvas). Turned,
 * the page lifts off toward the viewer and goes under; spread or gathered,
 * the pages lift off one after another and settle in their places.
 */
import * as THREE from "three";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { pageAt } from "../utils/page";
import { setViewGoal } from "./viewGoal";
import { useEditor, useEditorStore } from "../store";
import type { PdfItem } from "../store/types";
import { drawPart, type DrawnPart } from "../../../../lib/pdf/reader";
import { pdfBounds, POINT, spreadSheets, stackSheets, topSheet, type Sheet } from "../../../../lib/pdf/layout";

/** Meno's hairline and its grey (App.css: --color-gh-line, --color-gh-gray, --color-gh-base). */
const LINE = "#d1d9e0";
const GRAY = "#59636e";
const BASE = "#f6f8fa";
/** Eased in and out, cubic: what is lifted rises and settles. */
const ease = (u: number) => {
  const t = Math.min(Math.max(u, 0), 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

/** Where PDFs lie: under the drawing, which is drawn over them. */
const Z = -0.4;
/** A tile's side, in pixels. */
const TILE = 512;
/** A page's first picture: this many pixels across, whatever its size. */
const PREVIEW_PX = 360;
/** How long the view stays still before sharper tiles are asked for, in ms - still being under these a frame: a share of the zoom, and pixels moved. */
const SETTLE_MS = 90;
const STILL_ZOOM = 0.003;
const STILL_PX = 0.5;
/** How long things take: a tile fading in, a page turned, a page spread or gathered, in ms. */
const FADE_MS = 160;
const TURN_MS = 380;
const SPREAD_MS = 460;
const SPREAD_STAGGER_MS = 45;
/** The corner that folds, on the screen, in pixels. */
const FOLD_PX = 30;

type Pointerish = { button?: number; clientX: number; clientY: number; pointerId?: number };
const native = (e: unknown): Pointerish => ((e as { nativeEvent?: Pointerish }).nativeEvent ?? (e as Pointerish));

/** A picture of a page or a part of one, as WebGL has it, and when it came. */
type Pic = { tex: THREE.Texture; born: number };

function textureOf(d: DrawnPart, mip: boolean): THREE.Texture {
  const tex = new THREE.Texture(d.bitmap);
  // (taken apart upside down already: lib/pdf/reader)
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = mip;
  tex.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/** The pictures drawn of the PDFs' pages, kept while the canvas is: previews by page, tiles by level and place. */
class Pictures {
  previews = new Map<string, Pic | "asked">();
  tiles = new Map<string, Pic | "asked">();
  /** When each tile was last wanted, so that those long unwanted are let go. */
  wanted = new Map<string, number>();
  dispose(): void {
    for (const p of [...this.previews.values(), ...this.tiles.values()]) if (p !== "asked") p.tex.dispose();
    this.previews.clear();
    this.tiles.clear();
  }
}

export default function Pdfs2D() {
  const pdfs = useEditor((s) => s.pdfs);
  const hoveredPdf = useEditor((s) => s.hoveredPdf);
  const store = useEditorStore();
  const { camera, gl, invalidate, size } = useThree();
  const pics = useMemo(() => new Pictures(), []);
  useEffect(() => () => pics.dispose(), [pics]);
  const [, setTick] = useState(0);
  const redraw = () => {
    setTick((t) => t + 1);
    invalidate();
  };

  // the view: where it is, how near, and since when it has been still
  const view = useRef({ zoom: 0, x: 0, y: 0, still: 0, level: new Map<number, number>() });
  const settleTimer = useRef<number | null>(null);
  useEffect(() => () => void (settleTimer.current != null && window.clearTimeout(settleTimer.current)), []);
  // each PDF's motion: a page turned (the one that went), and its pages spread or gathered
  const motion = useRef(new Map<number, { turned?: { page: number; start: number }; spread?: { to: boolean; start: number } }>());
  const was = useRef(new Map<number, PdfItem>());
  for (const p of pdfs) {
    const before = was.current.get(p.id);
    if (before && before.page !== p.page && !p.spread) motion.current.set(p.id, { ...motion.current.get(p.id), turned: { page: before.page, start: performance.now() } });
    if (before && !!before.spread !== !!p.spread) motion.current.set(p.id, { ...motion.current.get(p.id), spread: { to: !!p.spread, start: performance.now() } });
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
    const b = added.map(pdfBounds).reduce((u, x) => ({ x0: Math.min(u.x0, x.x0), x1: Math.max(u.x1, x.x1), y0: Math.min(u.y0, x.y0), y1: Math.max(u.y1, x.y1) }));
    const cam = camera as THREE.OrthographicCamera;
    const a = pageAt(-1, -1, cam);
    const c = pageAt(1, 1, cam);
    const inView = b.x0 >= Math.min(a.x, c.x) && b.x1 <= Math.max(a.x, c.x) && b.y0 >= Math.min(a.y, c.y) && b.y1 <= Math.max(a.y, c.y);
    if (inView) return;
    const pad = 1.12;
    const zoom = Math.min(size.width / ((b.x1 - b.x0) * pad), size.height / ((b.y1 - b.y0) * pad), cam.zoom);
    setViewGoal(cam, { zoom, x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 });
    invalidate();
  }, [pdfs, camera, size, invalidate]);

  const toWorld = (cx: number, cy: number) => {
    const rect = (gl.domElement as HTMLCanvasElement).getBoundingClientRect();
    const p = pageAt(((cx - rect.left) / rect.width) * 2 - 1, -(((cy - rect.top) / rect.height) * 2 - 1), camera);
    return { x: p.x, y: p.y };
  };

  /** A page's preview, asked for the first time it is wanted. */
  const previewOf = (p: PdfItem, page: number): Pic | null => {
    const key = `${p.sha256}:${page}`;
    const had = pics.previews.get(key);
    if (had && had !== "asked") return had;
    if (!had) {
      pics.previews.set(key, "asked");
      const [w] = p.pages[page];
      void drawPart({ sha256: p.sha256, page, scale: PREVIEW_PX / w }, () => -1)
        .then((d) => {
          if (!d) return pics.previews.delete(key);
          pics.previews.set(key, { tex: textureOf(d, true), born: performance.now() });
          redraw();
        })
        .catch(() => pics.previews.delete(key));
    }
    return null;
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
    // (the tiles' fading in, and the motions, ask for frames while they last)
    let fading = false;
    for (const t of pics.tiles.values()) if (t !== "asked" && now - t.born < FADE_MS + 80) fading = true;
    for (const t of pics.previews.values()) if (t !== "asked" && now - t.born < FADE_MS + 80) fading = true;
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
      const sheets = p.spread ? spreadSheets(p).map((s, i) => ({ s, page: i })) : [{ s: topSheet(p), page: p.page }];
      for (const { s, page } of sheets) {
        if (s.x + s.w / 2 < seen.x0 || s.x - s.w / 2 > seen.x1 || s.y + s.h / 2 < seen.y0 || s.y - s.h / 2 > seen.y1) continue;
        const [pw] = p.pages[page];
        const previewScale = PREVIEW_PX / pw;
        // (the level: pixels a point, a power of two above what the screen wants; none, where the preview is enough)
        const level = want <= previewScale * 1.15 ? 0 : Math.min(32, Math.pow(2, Math.ceil(Math.log2(want))));
        v.level.set(p.id * 100000 + page, level);
        if (!level) continue;
        const [w, h] = p.pages[page];
        const left = Math.max(0, ((seen.x0 - (s.x - s.w / 2)) / POINT) * level);
        const right = Math.min(w * level, ((seen.x1 - (s.x - s.w / 2)) / POINT) * level);
        const top = Math.max(0, (((s.y + s.h / 2) - seen.y1) / POINT) * level);
        const bottom = Math.min(h * level, (((s.y + s.h / 2) - seen.y0) / POINT) * level);
        for (let j = Math.floor(top / TILE); j * TILE < bottom; j++)
          for (let i = Math.floor(left / TILE); i * TILE < right; i++) {
            const key = `${p.sha256}:${page}:${level}:${i}:${j}`;
            pics.wanted.set(key, now);
            if (pics.tiles.has(key)) continue;
            pics.tiles.set(key, "asked");
            asked = true;
            const cx = s.x - s.w / 2 + ((i + 0.5) * TILE * POINT) / level;
            const cy = s.y + s.h / 2 - ((j + 0.5) * TILE * POINT) / level;
            void drawPart(
              { sha256: p.sha256, page, scale: level, x: i * TILE, y: j * TILE, w: TILE, h: TILE },
              () => Math.hypot(cx - mid.x, cy - mid.y),
              () => (pics.wanted.get(key) ?? 0) >= view.current.still,
            )
              .then((d) => {
                // (dropped, the view having moved on: asked for again where it is still wanted)
                if (!d) {
                  pics.tiles.delete(key);
                  invalidate();
                  return;
                }
                pics.tiles.set(key, { tex: textureOf(d, false), born: performance.now() });
                redraw();
              })
              .catch(() => pics.tiles.delete(key));
          }
      }
    }
    // tiles not wanted for a while let go
    for (const [key, t] of pics.tiles) {
      if (t === "asked" || now - (pics.wanted.get(key) ?? 0) < 4000) continue;
      t.tex.dispose();
      pics.tiles.delete(key);
      pics.wanted.delete(key);
    }
    if (asked) redraw();
  });

  /** A press on a PDF: it follows the pointer, as one step. */
  const startMove = (p: PdfItem, e: { stopPropagation: () => void }) => {
    const ev = native(e);
    if ((ev.button ?? 0) !== 0) return;
    const st = store.getState();
    // (what is drawn over it is pressed, not it)
    if (st.hovered.atomId != null || st.hovered.bondId != null || st.hovered3d || st.hoveredArrow != null || st.hoveredPlus != null || st.hoveredCaption != null) return;
    e.stopPropagation();
    const q = toWorld(ev.clientX, ev.clientY);
    const off = { x: p.x - q.x, y: p.y - q.y };
    const gesture = `move-${performance.now()}`;
    st.beginPanHold(ev.pointerId ?? null);
    const onMove = (m: PointerEvent) => {
      const r = toWorld(m.clientX, m.clientY);
      store.getState().movePdf(p.id, r.x + off.x, r.y + off.y, gesture);
    };
    const onUp = (u: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
      store.getState().endPanHold(u.pointerId);
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
          previewOf={(page) => previewOf(p, page)}
          tilesOf={(page) => {
            const level = view.current.level.get(p.id * 100000 + page) ?? 0;
            const out: { key: string; pic: Pic; i: number; j: number; level: number }[] = [];
            if (!level) return out;
            for (const [key, t] of pics.tiles) {
              if (t === "asked" || !key.startsWith(`${p.sha256}:${page}:`)) continue;
              const [, , l, i, j] = key.split(":").map(Number);
              // (the level wanted, over the one before it where that is all there is yet)
              if (l === level || l === level / 2) out.push({ key, pic: t, i, j, level: l });
            }
            return out.sort((x, y) => x.level - y.level);
          }}
          onOver={() => store.getState().setHoveredPdf(p.id)}
          onOut={() => store.getState().hoveredPdf === p.id && store.getState().setHoveredPdf(null)}
          onDown={(e) => startMove(p, e)}
          onTurn={(page) => store.getState().turnPdf(p.id, page)}
          size={size}
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
  motion?: { turned?: { page: number; start: number }; spread?: { to: boolean; start: number } };
  previewOf: (page: number) => Pic | null;
  tilesOf: (page: number) => { key: string; pic: Pic; i: number; j: number; level: number }[];
  onOver: () => void;
  onOut: () => void;
  onDown: (e: { stopPropagation: () => void }) => void;
  onTurn: (page: number) => void;
  size: { width: number; height: number };
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
  const name = (
    <group position={[showSpread ? spread[0].x - spread[0].w / 2 : top.x - top.w / 2, (showSpread ? Math.min(...spread.map((s) => s.y - s.h / 2)) : top.y - top.h / 2 - 0.7 * Math.min(4, p.pages.length - 1)) - 14 * px, 0.01]} scale={[px, px, 1]}>
      <Text fontSize={12} anchorX="left" anchorY="top" color={GRAY} maxWidth={Math.max(120, (top.w / px) * 1.0)}>
        {p.name}
      </Text>
    </group>
  );

  if (showSpread) {
    return (
      <group onPointerOver={props.onOver} onPointerOut={props.onOut} onPointerDown={props.onDown}>
        {p.pages.map((_, i) => {
          const k = spreadAt(i);
          const from = i === p.page ? top : { ...top, x: top.x + UNDER(i, p), y: top.y - UNDER(i, p) };
          const to = spread[i];
          const lift = Math.sin(Math.PI * k);
          const s: Sheet = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, w: from.w + (to.w - from.w) * k, h: from.h + (to.h - from.h) * k };
          return <Page key={i} page={i} s={s} lift={lift} z={0.02 * i + 0.2 * lift} now={now} px={px} previewOf={props.previewOf} tilesOf={props.tilesOf} />;
        })}
        {name}
      </group>
    );
  }

  // turned: the page that went lifts toward the viewer and goes under, fading
  const tm = motion?.turned;
  const tt = tm ? Math.min(1, (now - tm.start) / TURN_MS) : 1;
  const going = tm && tt < 1 ? tm.page : null;
  const forward = tm ? p.page > tm.page : true;
  const hasNext = p.page < p.pages.length - 1;
  const hasPrev = p.page > 0;
  const fold = FOLD_PX * px;
  return (
    <group onPointerOver={props.onOver} onPointerOut={props.onOut} onPointerDown={props.onDown}>
      {under.map((s, k) => (
        <BlankSheet key={k} s={s} z={0.01 * k} />
      ))}
      <Page page={p.page} s={top} lift={0} z={0.06} now={now} px={px} previewOf={props.previewOf} tilesOf={props.tilesOf} />
      {going != null && (
        <Page
          page={going}
          s={{
            ...top,
            x: top.x + (forward ? 1 : -1) * ease(tt) * top.w * 0.12,
            y: top.y - ease(tt) * top.h * 0.04,
          }}
          lift={Math.sin(Math.PI * Math.min(1, tt * 1.2))}
          z={0.3}
          opacity={1 - ease(tt)}
          now={now}
          px={px}
          previewOf={props.previewOf}
          tilesOf={() => []}
        />
      )}
      {props.hovered && hasNext && <Fold s={top} size={fold} corner="right" onTurn={() => props.onTurn(p.page + 1)} />}
      {props.hovered && hasPrev && <Fold s={top} size={fold} corner="left" onTurn={() => props.onTurn(p.page - 1)} />}
      {name}
    </group>
  );
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

/** A page: its sheet, its preview and the tiles drawn of it; lifted, larger and with its shadow under it. */
function Page(props: {
  page: number;
  s: Sheet;
  lift: number;
  z: number;
  opacity?: number;
  now: number;
  px: number;
  previewOf: (page: number) => Pic | null;
  tilesOf: (page: number) => { key: string; pic: Pic; i: number; j: number; level: number }[];
}) {
  const { page, s, lift, now } = props;
  const opacity = props.opacity ?? 1;
  const preview = props.previewOf(page);
  const tiles = props.tilesOf(page);
  const grow = 1 + 0.04 * lift;
  const left = -s.w / 2;
  const topY = s.h / 2;
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)), []);
  const fade = (born: number) => Math.min(1, (now - born) / FADE_MS) * opacity;
  return (
    <group position={[s.x, s.y + lift * 6 * props.px, props.z]} scale={[grow, grow, 1]}>
      {lift > 0.01 && (
        <mesh position={[8 * props.px * lift, -10 * props.px * lift, -0.005]} scale={[s.w, s.h, 1]}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.12 * lift * opacity} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      <mesh scale={[s.w, s.h, 1]}>
        <planeGeometry args={[1, 1]} />
        {/* (see-through from the first where it is to fade: a material's being so is set as it is made) */}
        <meshBasicMaterial color="#ffffff" transparent={props.opacity != null} opacity={opacity} toneMapped={false} />
      </mesh>
      {preview && (
        <mesh scale={[s.w, s.h, 1]} position={[0, 0, 0.001]}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial map={preview.tex} transparent opacity={fade(preview.born)} toneMapped={false} />
        </mesh>
      )}
      {tiles.map((t) => {
        const img = t.pic.tex.image as { width: number; height: number };
        const tw = (img.width / t.level) * POINT;
        const th = (img.height / t.level) * POINT;
        const x = left + ((t.i * TILE) / t.level) * POINT + tw / 2;
        const y = topY - ((t.j * TILE) / t.level) * POINT - th / 2;
        return (
          <mesh key={t.key} position={[x, y, 0.002 + 0.0001 * Math.log2(t.level)]} scale={[tw, th, 1]}>
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial map={t.pic.tex} transparent opacity={fade(t.pic.born)} toneMapped={false} />
          </mesh>
        );
      })}
      <lineSegments geometry={edges} scale={[s.w, s.h, 1]} position={[0, 0, 0.003]}>
        <lineBasicMaterial color={LINE} transparent opacity={opacity} toneMapped={false} />
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
