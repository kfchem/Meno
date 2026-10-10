/**
 * A text's lines, as Meno draws them in the column (docs/PDF.md, *A
 * text*): each drawn by the system's own type into a picture - Meno's
 * monospaced type first, and any letter it lacks from the system's, as a
 * browser takes it - and the pictures are textures. A long line is drawn in
 * bands, so that no picture is wider than WebGL takes. And where each
 * letter of a line lies, measured in the same type, for the caret, what is
 * selected and a click.
 */
import * as THREE from "three";
import { letterStarts } from "../../../lib/text/editing";
import type { Span } from "../../../lib/text/colouring";

/** The type: as the column's text has always been set (App.css, `--font-mono`). */
export const FONT_PX = 14;
export const LINE_PX = 20;
export const FONT_FAMILY = '"IBM Plex Mono", "IBM Plex Sans JP", ui-monospace, monospace';
export const FONT = `${FONT_PX}px ${FONT_FAMILY}`;
/** How many letters apart a tab's stops are. */
export const TAB = 4;
/** How wide a band of a line is, in CSS pixels: a line wider is drawn in several. */
export const BAND_PX = 2048;
/** The colours: words, and the sheet they lie on. */
export const INK = "rgb(31, 35, 40)";
export const PAPER = "#ffffff";
/**
 * The colours of what a text's parts are (lib/text/colouring), from the
 * palette the column's look is taken from (App.css, `--color-gh-*`): its
 * grey for comments, purple for what an output's reader looks for, green
 * for a run that has gone well, and Meno's own attention for an error.
 */
export const TONES: Record<Span["tone"], string> = {
  keyword: "rgb(207, 34, 46)",
  string: "rgb(10, 48, 105)",
  number: "rgb(5, 80, 174)",
  comment: "rgb(89, 99, 110)",
  name: "rgb(130, 80, 223)",
  tag: "rgb(17, 99, 41)",
  attribute: "rgb(5, 80, 174)",
  property: "rgb(5, 80, 174)",
  landmark: "rgb(130, 80, 223)",
  success: "rgb(26, 127, 55)",
  warning: "rgb(154, 103, 0)",
  error: "rgb(205, 69, 96)",
};

let ctx: CanvasRenderingContext2D | null = null;
function measuring(): CanvasRenderingContext2D {
  if (!ctx) {
    ctx = document.createElement("canvas").getContext("2d")!;
    ctx.font = FONT;
  }
  return ctx;
}

const widths = new Map<string, number>();
/** How wide a letter is, in the type. */
function widthOf(letter: string): number {
  let w = widths.get(letter);
  if (w == null) {
    w = measuring().measureText(letter).width;
    widths.set(letter, w);
  }
  return w;
}

/** A line as it is drawn: its tabs as spaces to the next stop. */
export function shown(line: string): string {
  if (!line.includes("\t")) return line;
  let out = "";
  let col = 0;
  for (const ch of line) {
    if (ch === "\t") {
      const n = TAB - (col % TAB);
      out += " ".repeat(n);
      col += n;
    } else {
      out += ch;
      col++;
    }
  }
  return out;
}

/** Where a line's letters lie: each letter's start, in the line's offsets, and how far across it begins - and the line's end. */
export type Placed = { at: number[]; x: number[] };

const placedCache = new Map<string, Placed>();
const MOST_PLACED = 4000;

/** Where a line's letters lie, measured in the type: a tab reaching to the next stop. */
export function placed(line: string): Placed {
  const had = placedCache.get(line);
  if (had) return had;
  const starts = letterStarts(line);
  const at: number[] = [];
  const x: number[] = [];
  let across = 0;
  let col = 0;
  const space = widthOf(" ");
  for (let k = 0; k < starts.length; k++) {
    const letter = line.slice(starts[k], k + 1 < starts.length ? starts[k + 1] : line.length);
    at.push(starts[k]);
    x.push(across);
    if (letter === "\t") {
      const n = TAB - (col % TAB);
      across += n * space;
      col += n;
    } else {
      across += widthOf(letter);
      col++;
    }
  }
  at.push(line.length);
  x.push(across);
  if (placedCache.size > MOST_PLACED) placedCache.delete(placedCache.keys().next().value!);
  placedCache.set(line, { at, x });
  return { at, x };
}

/** How far across a line a place in it lies. */
export function xAt(line: string, col: number): number {
  const p = placed(line);
  let lo = 0;
  let hi = p.at.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (p.at[mid] <= col) lo = mid;
    else hi = mid - 1;
  }
  return p.x[lo];
}

/** The place in a line nearest a point across it: between letters, the nearer edge. */
export function colAt(line: string, x: number): number {
  const p = placed(line);
  if (x <= 0) return 0;
  for (let k = 1; k < p.x.length; k++) if (x < p.x[k]) return x - p.x[k - 1] < p.x[k] - x ? p.at[k - 1] : p.at[k];
  return line.length;
}

/** How wide a line is. */
export const lineWidth = (line: string) => placed(line).x[placed(line).x.length - 1];

/** Where in a line's box its letters stand: the baseline, from its top. */
let baseline: number | null = null;
function baselineOf(c: CanvasRenderingContext2D): number {
  if (baseline == null) {
    const m = c.measureText("Mg");
    const ascent = m.fontBoundingBoxAscent ?? FONT_PX * 0.8;
    const descent = m.fontBoundingBoxDescent ?? FONT_PX * 0.2;
    baseline = (LINE_PX - (ascent + descent)) / 2 + ascent;
  }
  return baseline;
}

/** A picture, and how wide and tall it is, in CSS pixels - a whole number of the screen's. */
type Picture = { texture: THREE.CanvasTexture; w: number; h: number };
const pictures = new Map<string, Picture>();
/** How many pictures are kept: past it, the least lately drawn are let go. */
const MOST_PICTURES = 400;

/**
 * A band of a line drawn, on its sheet: `band` of `BAND_PX` across it, at
 * the screen's resolution - its parts `spans` in their tones, the rest in
 * `ink`. Kept, by what it shows, until it has not been drawn for a while.
 */
export function linePicture(line: string, band: number, dpr: number, ink = INK, paper = PAPER, spans: readonly Span[] = []): Picture | null {
  const text = shown(line);
  const wide = lineWidth(line);
  const left = band * BAND_PX;
  if (left >= wide) return null;
  const toned = spans.map((s) => `${s.from},${s.to},${s.tone}`).join(";");
  const key = `${dpr}\u0000${ink}\u0000${band}\u0000${toned}\u0000${text}`;
  const had = pictures.get(key);
  if (had) {
    // (the latest drawn, last)
    pictures.delete(key);
    pictures.set(key, had);
    return had;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(Math.min(BAND_PX, Math.ceil(wide - left) + 2) * dpr);
  canvas.height = Math.ceil(LINE_PX * dpr);
  const c = canvas.getContext("2d", { alpha: false })!;
  c.fillStyle = paper;
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.scale(dpr, dpr);
  c.font = FONT;
  c.textBaseline = "alphabetic";
  // (the line drawn whole in each colour, kept to that colour's parts: its letters where they would be drawn in one)
  const base = baselineOf(c);
  let at = 0;
  const run = (from: number, to: number, colour: string) => {
    if (to <= from) return;
    const x0 = from === 0 ? -1 : xAt(line, from) - left;
    const x1 = to >= line.length ? wide - left + 2 : xAt(line, to) - left;
    if (x1 <= 0 || x0 >= BAND_PX) return;
    c.save();
    c.beginPath();
    c.rect(x0, 0, x1 - x0, LINE_PX);
    c.clip();
    c.fillStyle = colour;
    c.fillText(text, -left, base);
    c.restore();
  };
  if (!spans.length) {
    c.fillStyle = ink;
    c.fillText(text, -left, base);
  } else {
    for (const s of spans) {
      run(at, s.from, ink);
      run(s.from, s.to, TONES[s.tone]);
      at = s.to;
    }
    run(at, line.length, ink);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const p = { texture, w: canvas.width / dpr, h: canvas.height / dpr };
  pictures.set(key, p);
  while (pictures.size > MOST_PICTURES) {
    const [k, old] = pictures.entries().next().value!;
    old.texture.dispose();
    pictures.delete(k);
  }
  return p;
}

/** The type ready to draw with, once its files have come. */
export async function typeReady(): Promise<void> {
  try {
    await document.fonts.load(FONT, "Ag");
  } catch {
    // (drawn in the system's own until then)
  }
  widths.clear();
  placedCache.clear();
  baseline = null;
  for (const p of pictures.values()) p.texture.dispose();
  pictures.clear();
}
