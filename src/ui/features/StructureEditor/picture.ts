/**
 * Pictures of a structure for the clipboard, each carrying Meno's record of
 * it so that the structure comes back when the picture is pasted into Meno:
 *
 * - an EMF - vectors, at the style's own size - in Office's own clip format,
 *   which Word and PowerPoint keep as it is on either system and hand back
 *   when the picture is copied again (lib/office/gvml); the record in a
 *   comment of the EMF;
 * - the same EMF on its own, for Windows' other programs;
 * - a PNG at 300 dpi for everything else, the record in a text chunk.
 */
import type { ClipItem } from "../../../lib/clipboard";
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

/** The pictures of `part` that go on the clipboard with it. */
export async function pictureItems(
  part: Model,
  aromatic: Pick<EditorState, "aromaticEnabled" | "aromaticRings">,
  style: DrawingStyle,
): Promise<ClipItem[]> {
  const record = recordText(part);
  const { layout, opts } = drawingLayout(part, aromatic, style);
  const { emf, widthPt, heightPt } = layoutEmf(layout, opts, utf8.encode(EMF_MARK + record));
  const items: ClipItem[] = [
    { flavor: "gvml", bytes: gvmlPicture(emf, "emf", widthPt, heightPt, "Structure") },
    { flavor: "emf", bytes: emf },
  ];
  const png = await rasterized(createSVG(layout, opts), PNG_DPI / 96).catch(() => null);
  if (png) items.push({ flavor: "png", bytes: withText(withDpi(png, PNG_DPI), PNG_KEY, record) });
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

/** An SVG drawn into a PNG, `scale` pixels to the SVG's pixel; null where there is no page to draw it in. */
async function rasterized(svg: string, scale: number): Promise<Uint8Array | null> {
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
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
