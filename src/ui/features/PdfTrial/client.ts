/**
 * The PDF trial (docs/PDF.md, step 0): Meno's PDF reader, PDFium in a
 * process of its own (src-tauri/src/pdf.rs), asked from the window.
 */
import { invoke } from "@tauri-apps/api/core";

export type Opened = { doc: number; pages: [number, number][]; ms: number; round_ms: number; bound_ms: number };

export const openPdf = (path: string) => invoke<Opened>("pdf_open", { path });

/** A part of a page drawn at `scale` (pixels a point): its pixels, RGBA, top row first - and how long it took, in PDFium and all told. */
export type Drawn = { w: number; h: number; pixels: Uint8Array; pdfiumMs: number; totalMs: number; bytes: number };

export async function renderPart(doc: number, page: number, scale: number, x = 0, y = 0, w?: number, h?: number): Promise<Drawn> {
  const t = performance.now();
  const buf = await invoke<ArrayBuffer>("pdf_render", { doc, page, scale, x, y, w: w ?? null, h: h ?? null });
  const view = new DataView(buf);
  const pw = view.getUint32(0, true);
  const ph = view.getUint32(4, true);
  const pdfiumMs = view.getFloat64(8, true);
  return { w: pw, h: ph, pixels: new Uint8Array(buf, 16), pdfiumMs, totalMs: performance.now() - t, bytes: buf.byteLength };
}

export type Hit = { page: number; boxes: [number, number, number, number][] };
export const searchPdf = (doc: number, q: string) => invoke<{ hits: Hit[]; ms: number }>("pdf_search", { doc, q });
