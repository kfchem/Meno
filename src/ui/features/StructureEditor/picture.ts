/**
 * Pictures of a structure for the clipboard, each carrying Meno's record of
 * it so that the structure comes back when the picture is pasted into Meno:
 *
 * - an EMF - vectors, at the style's own size - in Office's own clip format,
 *   which Word and PowerPoint keep as it is on either system and hand back
 *   when the picture is copied again (lib/office/gvml); the record in a
 *   comment of the EMF;
 * - the same EMF on its own, for Windows' other programs;
 * - on Windows, an object for Office to embed, showing that EMF, which a
 *   double-click opens in Meno (made from the record and the EMF by the
 *   app: src-tauri/src/ole.rs);
 * - a PNG at 300 dpi for everything else, the record in a text chunk;
 * - the same picture as a DIB, for Windows' programs that take only a bitmap.
 *
 * Where Meno serves its objects (Windows, installed), the app hands over the
 * object in place of the clip format and the PNG: Word and PowerPoint take
 * either of those before an object, and an object is what opens in Meno.
 */
import type { ClipItem } from "../../../lib/clipboard";
import { dibOf } from "../../../lib/binary/dib";
import { textOf, withDpi, withText } from "../../../lib/binary/png";
import { emfComments, layoutEmf } from "../../../lib/chem/emf";
import { createSVG } from "../../../lib/chem/layout2d";
import type { DrawingStyle } from "../../../lib/chem/style";
import { gvmlImages, gvmlPicture } from "../../../lib/office/gvml";
import { drawingLayout } from "./fileActions";
import type { EditorState, Model } from "./store/types";
import { readRecord, recordText } from "./utils/copyPaste";

/** What marks Meno's record in an EMF's comment, and names it in a PNG. */
const EMF_MARK = "MENO";
const PNG_KEY = "meno-structure";
const PNG_DPI = 300;

const utf8 = new TextEncoder();

type Aromatic = Pick<EditorState, "aromaticEnabled" | "aromaticRings">;

/**
 * Meno's record of `part` and the EMF of it that carries the record - what a
 * copy puts in Office's clip format, and what a document holding the
 * structure as an object keeps and shows.
 */
export function structurePicture(part: Model, aromatic: Aromatic, style: DrawingStyle) {
  const record = recordText(part);
  const { layout, opts } = drawingLayout(part, aromatic, style);
  return { record, layout, opts, ...layoutEmf(layout, opts, utf8.encode(EMF_MARK + record)) };
}

/** The pictures of `part` that go on the clipboard with it. */
export async function pictureItems(part: Model, aromatic: Aromatic, style: DrawingStyle): Promise<ClipItem[]> {
  const { record, layout, opts, emf, widthPt, heightPt } = structurePicture(part, aromatic, style);
  const items: ClipItem[] = [
    { flavor: "gvml", bytes: gvmlPicture(emf, "emf", widthPt, heightPt, "Structure") },
    { flavor: "emf", bytes: emf },
    // (made into an object for Office from this and the EMF, on Windows)
    { flavor: "embed", text: record },
  ];
  const raster = await rasterized(createSVG(layout, opts), PNG_DPI / 96).catch(() => null);
  if (raster) {
    items.push({ flavor: "png", bytes: withText(withDpi(raster.png, PNG_DPI), PNG_KEY, record) });
    items.push({ flavor: "dib", bytes: raster.dib });
  }
  return items;
}

/** The structure a picture on the clipboard carries, if it carries one. */
export async function structureInPicture(item: ClipItem): Promise<Model | null> {
  if (!item.bytes) return null;
  if (item.flavor === "png") return fromPng(item.bytes);
  if (item.flavor !== "gvml") return null;
  for (const { name, data } of await gvmlImages(item.bytes)) {
    const found = /\.emf$/i.test(name) ? fromEmf(data) : /\.png$/i.test(name) ? fromPng(data) : null;
    if (found) return found;
  }
  return null;
}

function fromEmf(emf: Uint8Array): Model | null {
  const decoder = new TextDecoder();
  for (const c of emfComments(emf)) {
    const text = decoder.decode(c);
    if (text.startsWith(EMF_MARK)) return readRecord(text.slice(EMF_MARK.length));
  }
  return null;
}

function fromPng(png: Uint8Array): Model | null {
  const text = textOf(png, PNG_KEY);
  return text ? readRecord(text) : null;
}

/**
 * An SVG drawn at `scale` pixels to the SVG's pixel: as a PNG, and as a DIB
 * for Windows' bitmap-only programs; null where there is no page to draw it in.
 */
async function rasterized(svg: string, scale: number): Promise<{ png: Uint8Array; dib: Uint8Array } | null> {
  if (typeof document === "undefined") return null;
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.ceil(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/png"));
    if (!blob) return null;
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    return {
      png: new Uint8Array(await blob.arrayBuffer()),
      dib: dibOf(pixels, canvas.width, canvas.height, PNG_DPI),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
