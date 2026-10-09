/**
 * The PDF trial (docs/PDF.md, step 0), kept off main: one canvas drawing a
 * workspace and a column, each a view of its own; a PDF's stack on the
 * page, its top page sharpening in tiles as it is zoomed into; the column
 * its pages one under another; a page rising from the stack into the
 * column; and what each step took, shown at the top left.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrthographicCamera, View } from "@react-three/drei";
import { openPdf, renderPart, searchPdf, type Drawn, type Hit, type Opened } from "./client";

const COLUMN_W = 440;
const MARGIN = 12;
const TILE = 512;
const DPR = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function textureOf(d: Drawn, mip: boolean): THREE.DataTexture {
  const tex = new THREE.DataTexture(d.pixels, d.w, d.h, THREE.RGBAFormat);
  tex.flipY = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = mip;
  tex.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

type Metrics = Record<string, string>;
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);

/** How fast pictures came from the reader: bytes over the time not spent in PDFium. */
function throughput(ds: Drawn[]): string {
  const bytes = ds.reduce((n, d) => n + d.bytes, 0);
  const ms = ds.reduce((n, d) => n + Math.max(0.01, d.totalMs - d.pdfiumMs), 0);
  return `${(bytes / 1e6 / (ms / 1000)).toFixed(0)} MB/s`;
}

type Rect = { x: number; y: number; w: number; h: number };
type Flight = { from: Rect; to: Rect; start: number; back: boolean };

export default function PdfTrial({ path, onClose }: { path: string; onClose: () => void }) {
  const container = useRef<HTMLDivElement>(null!);
  const workspaceEl = useRef<HTMLDivElement>(null!);
  const columnEl = useRef<HTMLDivElement>(null!);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [preview, setPreview] = useState<THREE.DataTexture | null>(null);
  const [metrics, setMetrics] = useState<Metrics>({});
  const note = (m: Metrics) => setMetrics((x) => ({ ...x, ...m }));
  const [columnOpen, setColumnOpen] = useState(false);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [hits, setHits] = useState<Hit[]>([]);
  const [query, setQuery] = useState("");
  const pageRectRef = useRef<() => Rect | null>(() => null);
  const columnScroll = useRef(0);

  useEffect(() => {
    let gone = false;
    (async () => {
      try {
        const o = await openPdf(path);
        if (gone) return;
        setOpened(o);
        note({ "reader bound": `${o.bound_ms.toFixed(0)} ms`, "opened": `${o.ms.toFixed(1)} ms in PDFium, ${o.round_ms.toFixed(0)} ms all told, ${o.pages.length} pages` });
        const [w] = o.pages[0];
        const d = await renderPart(o.doc, 0, 440 / w);
        if (gone) return;
        setPreview(textureOf(d, true));
        note({ "preview (440 px)": `${d.pdfiumMs.toFixed(1)} ms in PDFium, ${d.totalMs.toFixed(1)} ms all told` });
      } catch (e) {
        note({ error: String(e) });
      }
    })();
    return () => {
      gone = true;
    };
  }, [path]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (columnOpen) closeColumn();
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const columnTarget = (): Rect | null => {
    const c = columnEl.current?.getBoundingClientRect();
    const box = container.current?.getBoundingClientRect();
    if (!c || !box || !opened) return null;
    const [w, h] = opened.pages[0];
    const width = COLUMN_W - 2 * MARGIN;
    return { x: box.width - COLUMN_W + MARGIN, y: c.top - box.top + MARGIN - columnScroll.current, w: width, h: (width * h) / w };
  };

  const openColumn = () => {
    const from = pageRectRef.current();
    setColumnOpen(true);
    // (the column's place is known once it has opened: the page flies there)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const to = columnTarget();
        if (from && to) setFlight({ from, to, start: performance.now(), back: false });
      }),
    );
  };
  const closeColumn = () => {
    const from = columnTarget();
    const to = pageRectRef.current();
    if (from && to) setFlight({ from, to, start: performance.now(), back: true });
    setColumnOpen(false);
  };

  const search = async () => {
    if (!opened || !query.trim()) return setHits([]);
    const r = await searchPdf(opened.doc, query);
    setHits(r.hits);
    note({ search: `${JSON.stringify(query)}: ${r.hits.length} found in ${r.ms.toFixed(1)} ms (all pages)` });
  };

  return (
    <div ref={container} className="fixed inset-0 z-[100] bg-white flex select-none">
      <div ref={workspaceEl} className="relative flex-1 bg-white">
        <View className="absolute inset-0">
          {opened && preview && (
            <WorkspaceScene
              opened={opened}
              preview={preview}
              el={workspaceEl}
              hidden={!!flight || columnOpen}
              note={note}
              onOpen={openColumn}
              pageRect={(f) => (pageRectRef.current = f)}
              container={container}
            />
          )}
        </View>
      </div>
      <div
        className="relative h-full border-l border-gh-line bg-white overflow-hidden"
        style={{ width: columnOpen ? COLUMN_W : 0, transition: "width 260ms cubic-bezier(0.2,0,0,1)" }}
      >
        <header className="h-11 flex items-center gap-2 px-2 border-b border-gh-line" style={{ width: COLUMN_W }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void search()}
            placeholder="Find in PDF"
            className="h-7 flex-1 rounded-md border border-gh-line px-2 text-sm outline-none"
          />
          <button onClick={closeColumn} className="h-7 px-2 rounded-md border border-gh-line text-sm">
            Close
          </button>
        </header>
        <div ref={columnEl} className="absolute left-0 right-0 bottom-0 top-11" style={{ width: COLUMN_W }}>
          <View className="absolute inset-0">
            {opened && columnOpen && <ColumnScene opened={opened} el={columnEl} note={note} scroll={columnScroll} hidden={!!flight} hits={hits} />}
          </View>
        </div>
      </div>
      <View className="absolute inset-0 pointer-events-none" index={3}>
        {flight && preview && <FlightScene flight={flight} texture={preview} onDone={() => setFlight(null)} container={container} />}
      </View>
      <Canvas
        eventSource={container}
        dpr={DPR}
        flat
        frameloop="always"
        gl={{ antialias: true }}
        style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 101 }}
      >
        <View.Port />
        <FrameMeter note={note} />
      </Canvas>
      <div className="fixed top-2 left-2 z-[102] max-w-[620px] rounded-md bg-white/90 border border-gh-line p-2 text-[11px] leading-4 font-mono pointer-events-none">
        <div className="font-semibold">PDF trial - {path.split(/[\\/]/).pop()}</div>
        {Object.entries(metrics).map(([k, v]) => (
          <div key={k}>
            {k}: {v}
          </div>
        ))}
        <div className="text-gh-gray">Wheel: zoom. Drag: move. Double-click the PDF: read in the column. Esc: close.</div>
      </div>
    </div>
  );
}

/** The time between frames, over the last two seconds: the slowest one in twenty. */
function FrameMeter({ note }: { note: (m: Metrics) => void }) {
  const times = useRef<number[]>([]);
  const last = useRef(0);
  useFrame((_, dt) => {
    times.current.push(dt * 1000);
    if (times.current.length > 120) times.current.shift();
    const now = performance.now();
    if (now - last.current > 1000) {
      last.current = now;
      const sorted = [...times.current].sort((a, b) => a - b);
      note({ frames: `median ${median(sorted).toFixed(1)} ms, 95th ${sorted[Math.floor(sorted.length * 0.95)]?.toFixed(1)} ms` });
    }
  });
  return null;
}

type TileKey = string;

function WorkspaceScene(p: {
  opened: Opened;
  preview: THREE.DataTexture;
  el: React.RefObject<HTMLDivElement>;
  hidden: boolean;
  note: (m: Metrics) => void;
  onOpen: () => void;
  pageRect: (f: () => Rect | null) => void;
  container: React.RefObject<HTMLDivElement>;
}) {
  const { camera, size } = useThree();
  const [w, h] = p.opened.pages[0];
  const view = useRef({ x: 0, y: 0, zoom: 0.6, goalZoom: 0.6, anchor: { x: 0, y: 0 }, changed: 0 });
  const [tiles, setTiles] = useState<Map<TileKey, { level: number; mesh: { x: number; y: number; w: number; h: number }; tex: THREE.DataTexture; born: number }>>(new Map());
  const asked = useRef(new Set<TileKey>());
  const inFlight = useRef(0);
  const tileTimes = useRef<Drawn[]>([]);
  const [level, setLevel] = useState(0);

  // the page's place on the screen, in the container's pixels, for the flight
  useEffect(() => {
    p.pageRect(() => {
      const r = p.el.current?.getBoundingClientRect();
      const box = p.container.current?.getBoundingClientRect();
      if (!r || !box) return null;
      const v = view.current;
      const cx = r.left - box.left + r.width / 2 + (-w / 2 - v.x) * v.zoom;
      const cy = r.top - box.top + r.height / 2 - (h / 2 - v.y) * v.zoom;
      return { x: cx, y: cy, w: w * v.zoom, h: h * v.zoom };
    });
  });

  // wheel zooms about the pointer, a drag moves the view, a double-click opens the column
  useEffect(() => {
    const el = p.el.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const v = view.current;
      v.goalZoom = Math.min(40, Math.max(0.15, v.goalZoom * Math.exp(-e.deltaY * 0.0025)));
      v.anchor = { x: e.clientX - r.left - r.width / 2, y: -(e.clientY - r.top - r.height / 2) };
      v.changed = performance.now();
    };
    let drag: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => (drag = { x: e.clientX, y: e.clientY });
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      const v = view.current;
      v.x -= (e.clientX - drag.x) / v.zoom;
      v.y += (e.clientY - drag.y) / v.zoom;
      drag = { x: e.clientX, y: e.clientY };
      v.changed = performance.now();
    };
    const onUp = () => (drag = null);
    const onDbl = () => p.onOpen();
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    el.addEventListener("dblclick", onDbl);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      el.removeEventListener("dblclick", onDbl);
    };
  }, [p.el, p.onOpen]);

  useFrame((_, dt) => {
    const v = view.current;
    const cam = camera as THREE.OrthographicCamera;
    // (the zoom eases to where the wheel sent it, about the pointer)
    const k = 1 - Math.exp(-dt * 14);
    const before = { x: v.x + v.anchor.x / v.zoom, y: v.y + v.anchor.y / v.zoom };
    v.zoom += (v.goalZoom - v.zoom) * k;
    v.x = before.x - v.anchor.x / v.zoom;
    v.y = before.y - v.anchor.y / v.zoom;
    cam.zoom = v.zoom;
    cam.position.set(v.x, v.y, 100);
    cam.updateProjectionMatrix();

    // sharper tiles once the zoom has settled: the level a pixel of the screen wants, in powers of two
    const settled = performance.now() - v.changed > 160 && Math.abs(v.goalZoom - v.zoom) / v.zoom < 0.01;
    const want = v.zoom * DPR;
    const lv = want <= (440 / w) * 1.15 ? 0 : Math.min(16, Math.pow(2, Math.ceil(Math.log2(want))));
    if (settled && lv !== level) setLevel(lv);
    if (!settled || lv === 0) return;
    // the tiles in view at that level, nearest the middle first
    const half = { x: size.width / 2 / v.zoom, y: size.height / 2 / v.zoom };
    const left = Math.max(0, (v.x - half.x + w / 2) * lv);
    const right = Math.min(w * lv, (v.x + half.x + w / 2) * lv);
    const top = Math.max(0, (h / 2 - (v.y + half.y)) * lv);
    const bottom = Math.min(h * lv, (h / 2 - (v.y - half.y)) * lv);
    const want_: { i: number; j: number; d: number }[] = [];
    for (let j = Math.floor(top / TILE); j * TILE < bottom; j++)
      for (let i = Math.floor(left / TILE); i * TILE < right; i++) {
        const key = `${lv}:${i}:${j}`;
        if (asked.current.has(key)) continue;
        const cx = (i + 0.5) * TILE / lv - w / 2 - v.x;
        const cy = h / 2 - (j + 0.5) * TILE / lv - v.y;
        want_.push({ i, j, d: cx * cx + cy * cy });
      }
    want_.sort((a, b) => a.d - b.d);
    for (const t of want_) {
      if (inFlight.current >= 4) break;
      const key = `${lv}:${t.i}:${t.j}`;
      asked.current.add(key);
      inFlight.current++;
      void renderPart(p.opened.doc, 0, lv, t.i * TILE, t.j * TILE, TILE, TILE).then((d) => {
        inFlight.current--;
        tileTimes.current.push(d);
        const tw = d.w / lv;
        const th = d.h / lv;
        setTiles((m) =>
          new Map(m).set(key, {
            level: lv,
            mesh: { x: -w / 2 + (t.i * TILE) / lv + tw / 2, y: h / 2 - (t.j * TILE) / lv - th / 2, w: tw, h: th },
            tex: textureOf(d, false),
            born: performance.now(),
          }),
        );
        const ds = tileTimes.current;
        p.note({
          tiles: `${ds.length} at ${lv}x; a tile: median ${median(ds.map((x) => x.pdfiumMs)).toFixed(1)} ms in PDFium, ${median(ds.map((x) => x.totalMs)).toFixed(1)} ms all told; ${throughput(ds)}`,
        });
      });
    }
  });

  const stack = Math.min(5, p.opened.pages.length);
  return (
    <>
      <OrthographicCamera makeDefault position={[0, 0, 100]} zoom={0.6} />
      <color attach="background" args={["#ffffff"]} />
      {Array.from({ length: stack - 1 }, (_, k) => stack - 1 - k).map((i) => (
        <group key={i} position={[i * 3, -i * 3, -i * 0.5]}>
          <mesh>
            <planeGeometry args={[w, h]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          <lineSegments>
            <edgesGeometry args={[new THREE.PlaneGeometry(w, h)]} />
            <lineBasicMaterial color="#d0d7de" />
          </lineSegments>
        </group>
      ))}
      <group visible={!p.hidden}>
        <mesh position={[0, 0, 0]}>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial map={p.preview} toneMapped={false} />
        </mesh>
        {[...tiles.values()]
          .filter((t) => t.level === level)
          .map((t, k) => (
            <Tile key={k} t={t} />
          ))}
        <lineSegments position={[0, 0, 0.3]}>
          <edgesGeometry args={[new THREE.PlaneGeometry(w, h)]} />
          <lineBasicMaterial color="#d0d7de" />
        </lineSegments>
      </group>
    </>
  );
}

/** A tile, fading up over the soft page as it comes. */
function Tile({ t }: { t: { mesh: Rect; tex: THREE.DataTexture; born: number } }) {
  const mat = useRef<THREE.MeshBasicMaterial>(null!);
  useFrame(() => {
    const a = Math.min(1, (performance.now() - t.born) / 180);
    if (mat.current) mat.current.opacity = a;
  });
  return (
    <mesh position={[t.mesh.x, t.mesh.y, 0.1]}>
      <planeGeometry args={[t.mesh.w, t.mesh.h]} />
      <meshBasicMaterial ref={mat} map={t.tex} transparent opacity={0} toneMapped={false} />
    </mesh>
  );
}

function ColumnScene(p: {
  opened: Opened;
  el: React.RefObject<HTMLDivElement>;
  note: (m: Metrics) => void;
  scroll: React.MutableRefObject<number>;
  hidden: boolean;
  hits: Hit[];
}) {
  const { camera, size } = useThree();
  const width = COLUMN_W - 2 * MARGIN;
  const layout = useMemo(() => {
    let y = MARGIN;
    return p.opened.pages.map(([w, h]) => {
      const scale = width / w;
      const top = y;
      y += h * scale + MARGIN;
      return { top, scale, height: h * scale, pw: w, ph: h };
    });
  }, [p.opened, width]);
  const [textures, setTextures] = useState<Map<number, THREE.DataTexture>>(new Map());
  const asked = useRef(new Set<number>());
  const firstTimes = useRef<Drawn[]>([]);
  const goal = useRef(0);

  useEffect(() => {
    const el = p.el.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const end = layout[layout.length - 1];
      goal.current = Math.max(0, Math.min(end.top + end.height - size.height + MARGIN, goal.current + e.deltaY));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [p.el, layout, size.height]);

  useFrame((_, dt) => {
    const cam = camera as THREE.OrthographicCamera;
    p.scroll.current += (goal.current - p.scroll.current) * (1 - Math.exp(-dt * 18));
    // (pixels of the column, y down: the camera's top left is the column's)
    cam.left = 0;
    cam.right = size.width;
    cam.top = 0;
    cam.bottom = -size.height;
    cam.zoom = 1;
    cam.position.set(0, -p.scroll.current, 100);
    cam.updateProjectionMatrix();
    // pages in view, and the next ones, drawn whole at the column's width
    const lo = p.scroll.current - size.height * 0.5;
    const hi = p.scroll.current + size.height * 1.5;
    layout.forEach((l, i) => {
      if (l.top + l.height < lo || l.top > hi || asked.current.has(i)) return;
      asked.current.add(i);
      void renderPart(p.opened.doc, i, l.scale * DPR).then((d) => {
        if (firstTimes.current.length < 6) firstTimes.current.push(d);
        setTextures((m) => new Map(m).set(i, textureOf(d, false)));
        const ds = firstTimes.current;
        p.note({ "column pages": `${ds.length}: median ${median(ds.map((x) => x.pdfiumMs)).toFixed(1)} ms in PDFium, ${median(ds.map((x) => x.totalMs)).toFixed(1)} ms all told (${ds[0].w}x${ds[0].h}); ${throughput(ds)}` });
      });
    });
  });

  return (
    <>
      <OrthographicCamera makeDefault manual position={[0, 0, 100]} />
      <color attach="background" args={["#f6f8fa"]} />
      <group visible={!p.hidden}>
        {layout.map((l, i) => (
          <group key={i} position={[MARGIN + width / 2, -(l.top + l.height / 2), 0]}>
            <mesh>
              <planeGeometry args={[width, l.height]} />
              <meshBasicMaterial key={textures.has(i) ? "page" : "blank"} color="#ffffff" map={textures.get(i) ?? null} toneMapped={false} />
            </mesh>
          </group>
        ))}
        {p.hits.flatMap((hit, k) => {
          const l = layout[hit.page];
          return hit.boxes.map(([x0, y0, x1, y1], b) => (
            <mesh key={`${k}-${b}`} position={[MARGIN + ((x0 + x1) / 2) * l.scale, -(l.top + (l.ph - (y0 + y1) / 2) * l.scale), 1]}>
              <planeGeometry args={[Math.max(1, (x1 - x0) * l.scale), Math.max(1, (y1 - y0) * l.scale)]} />
              <meshBasicMaterial color="#f9c513" transparent opacity={0.45} />
            </mesh>
          ));
        })}
      </group>
    </>
  );
}

/** A page going from the stack into the column, or back: lifted toward the viewer on the way, its shadow under it. */
function FlightScene(p: { flight: Flight; texture: THREE.Texture; onDone: () => void; container: React.RefObject<HTMLDivElement> }) {
  const { camera, size } = useThree();
  const page = useRef<THREE.Mesh>(null!);
  const shadow = useRef<THREE.Mesh>(null!);
  const shadowMat = useRef<THREE.MeshBasicMaterial>(null!);
  const done = useRef(false);
  useFrame(() => {
    const cam = camera as THREE.OrthographicCamera;
    cam.left = 0;
    cam.right = size.width;
    cam.top = 0;
    cam.bottom = -size.height;
    cam.zoom = 1;
    cam.position.set(0, 0, 100);
    cam.updateProjectionMatrix();
    const t = Math.min(1, (performance.now() - p.flight.start) / 560);
    const e = ease(t);
    const { from, to } = p.flight;
    const r = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e, h: from.h + (to.h - from.h) * e };
    const lift = Math.sin(Math.PI * e);
    const s = 1 + 0.07 * lift;
    page.current.position.set(r.x + r.w / 2, -(r.y + r.h / 2) + 6 * lift, 2);
    page.current.scale.set(r.w * s, r.h * s, 1);
    shadow.current.position.set(r.x + r.w / 2 + 10 * lift, -(r.y + r.h / 2) - 12 * lift, 1);
    shadow.current.scale.set(r.w * (1 + 0.02 * lift), r.h * (1 + 0.02 * lift), 1);
    shadowMat.current.opacity = 0.16 * lift;
    if (t >= 1 && !done.current) {
      done.current = true;
      p.onDone();
    }
  });
  return (
    <>
      <OrthographicCamera makeDefault manual position={[0, 0, 100]} />
      <mesh ref={shadow}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial ref={shadowMat} color="#000000" transparent opacity={0} />
      </mesh>
      <mesh ref={page}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={p.texture} toneMapped={false} />
      </mesh>
    </>
  );
}
