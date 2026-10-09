/**
 * PDFs (docs/PDF.md), as the window reaches them: PDFium, in a process of
 * Meno's own (src-tauri/src/pdf.rs), which holds each PDF in Meno's cache by
 * its SHA-256 and draws parts of its pages.
 *
 * Pictures come back as PNGs - a page is mostly white, so a tile is a
 * quarter of its pixels' size or less, and carrying bytes to the window is
 * what takes the time, above all on Windows - and are taken apart off the
 * main thread (`createImageBitmap`), upside down, as WebGL takes them.
 * Requests wait their turn, at most a few at once, nearest first; one no
 * longer wanted before its turn is dropped.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";

/** A PDF held: what it is known by, its size, and each page's width and height, in points. */
export type HeldPdf = { sha256: string; size: number; pages: [number, number][] };

/** A PDF on the disk, held. */
export const holdPdfPath = (path: string) => invoke<HeldPdf>("pdf_hold_path", { path });

/** A PDF's bytes held - dropped, pasted, or kept in a workspace's file. */
export const holdPdfBytes = (bytes: Uint8Array) => invoke<HeldPdf>("pdf_hold_bytes", bytes);

/** A PDF held, as its bytes: what a workspace's file keeps. */
export async function pdfBytes(sha256: string): Promise<Uint8Array> {
  return new Uint8Array(await invoke<ArrayBuffer>("pdf_bytes", { sha: sha256 }));
}

/** PDFs being held, by SHA-256: drawing one waits for it (a workspace's file opened holds its PDFs as it opens). */
const holding = new Map<string, Promise<unknown>>();

/** Each PDF a workspace's file keeps, held as it opens (lib/doc/menoFile). */
export function holdPdfsOf(file: { files: { sha256: string; media: string }[]; data(sha256: string): Uint8Array | null }): void {
  if (!isTauri()) return;
  for (const f of file.files) {
    if (f.media !== "application/pdf" || holding.has(f.sha256)) continue;
    const bytes = file.data(f.sha256);
    if (bytes) holding.set(f.sha256, holdPdfBytes(bytes).catch(() => undefined));
  }
}

/** A part of a page drawn: its picture, as WebGL takes it, its size in pixels, and how long PDFium took. */
export type DrawnPart = { bitmap: ImageBitmap; w: number; h: number; ms: number };

/** What is asked to be drawn: a page's part at a scale, in pixels a point. */
export type PartAsk = { sha256: string; page: number; scale: number; x?: number; y?: number; w?: number; h?: number };

async function draw(ask: PartAsk): Promise<DrawnPart> {
  await holding.get(ask.sha256);
  const buf = await invoke<ArrayBuffer>("pdf_render", {
    sha: ask.sha256,
    page: ask.page,
    scale: ask.scale,
    x: Math.round(ask.x ?? 0),
    y: Math.round(ask.y ?? 0),
    w: ask.w != null ? Math.round(ask.w) : null,
    h: ask.h != null ? Math.round(ask.h) : null,
    packed: true,
  });
  const view = new DataView(buf);
  const w = view.getUint32(0, true);
  const h = view.getUint32(4, true);
  const ms = view.getFloat32(8, true);
  const packed = view.getUint32(12, true) === 1;
  const body = new Uint8Array(buf, 16);
  const bitmap = packed
    ? await createImageBitmap(new Blob([body], { type: "image/png" }), { imageOrientation: "flipY", premultiplyAlpha: "none" })
    : await createImageBitmap(new ImageData(new Uint8ClampedArray(body.buffer, body.byteOffset, body.byteLength), w, h), { imageOrientation: "flipY" });
  return { bitmap, w, h, ms };
}

/** How many parts are drawn at once: PDFium draws one at a time, and the rest are on their way. */
const AT_ONCE = 3;

type Waiting = { ask: PartAsk; nearness: () => number; wanted: () => boolean; resolve: (d: DrawnPart | null) => void; reject: (e: unknown) => void };
const queue: Waiting[] = [];
let running = 0;

function pump(): void {
  while (running < AT_ONCE && queue.length) {
    // (the nearest first; one no longer wanted dropped)
    queue.sort((a, b) => a.nearness() - b.nearness());
    const next = queue.shift()!;
    if (!next.wanted()) {
      next.resolve(null);
      continue;
    }
    running++;
    draw(next.ask)
      .then(next.resolve, next.reject)
      .finally(() => {
        running--;
        pump();
      });
  }
}

/**
 * A part of a page drawn, when its turn comes: `nearness` orders the
 * queue (smaller first), and one no longer `wanted` when its turn comes is
 * not drawn - it comes to null.
 */
export function drawPart(ask: PartAsk, nearness: () => number = () => 0, wanted: () => boolean = () => true): Promise<DrawnPart | null> {
  return new Promise((resolve, reject) => {
    queue.push({ ask, nearness, wanted, resolve, reject });
    pump();
  });
}
