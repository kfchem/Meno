/**
 * A PDF page's figures (docs/PDF.md, *Taking things out*): where they lie,
 * worked out from what the page is made of as PDFium reads it - its words,
 * its paths, its pictures - each where it lies (`pdf_objects`, 20 bytes a
 * thing: what it is, and its box in points from the page's top left).
 *
 * A figure is where pictures and drawn paths lie together, near enough to
 * one another to be one; and the words over it and right beside it - its
 * labels - are its too. A rule across a column, or the page's own frame,
 * is no figure.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";

/** A box on a page, in points from its top left: left, top, right, bottom. */
export type Box = [number, number, number, number];

/** What a page is made of: each thing, what it is and where it lies. */
export type PageObject = { kind: "text" | "path" | "image" | "shading" | "form"; box: Box };

const KINDS = [undefined, "text", "path", "image", "shading", "form"] as const;

/** A page's things, from what the reader answers: 20 bytes each (src-tauri/src/pdf.rs, `objects`). */
export function pageObjectsOf(buf: ArrayBuffer): PageObject[] {
  const v = new DataView(buf);
  const out: PageObject[] = [];
  for (let i = 0; i + 20 <= buf.byteLength; i += 20) {
    const kind = KINDS[v.getUint32(i, true)];
    if (!kind) continue;
    const box = [0, 1, 2, 3].map((k) => v.getFloat32(i + 4 + k * 4, true)) as Box;
    if (box.every(Number.isFinite)) out.push({ kind, box });
  }
  return out;
}

const had = new Map<string, Box[] | "asked">();

/** A page's figures, if they have been worked out - asked for, the first time, and `came` called once they have. */
export function figuresHad(sha256: string, page: number, came: () => void = () => {}): Box[] | null {
  const key = `${sha256}:${page}`;
  const h = had.get(key);
  if (h && h !== "asked") return h;
  if (!h) {
    had.set(key, "asked");
    figuresOn(sha256, page)
      .then(() => came())
      .catch(() => had.delete(key));
  }
  return null;
}

/** A page's figures, worked out once and kept. */
export async function figuresOn(sha256: string, page: number): Promise<Box[]> {
  const key = `${sha256}:${page}`;
  const h = had.get(key);
  if (h && h !== "asked") return h;
  const objects = isTauri() ? pageObjectsOf(await invoke<ArrayBuffer>("pdf_objects", { sha: sha256, page })) : [];
  const figures = figuresOf(objects);
  had.set(key, figures);
  return figures;
}

/** How near pictures and paths are to be one figure's, in points; how near words to be its labels; how large a figure is at the least, one way and the other. */
const JOIN_PT = 8;
const LABEL_PT = 6;
const LEAST_PT = 24;
const LEAST_THICK_PT = 4;
/** A thin thing - a rule - at most this thick, at least this long, is no part of a figure, in points; nor anything over most of the page. */
const RULE_THICK_PT = 1.5;
const RULE_LONG_PT = 150;
const MOST_OF_PAGE = 0.8;

const grow = (b: Box, d: number): Box => [b[0] - d, b[1] - d, b[2] + d, b[3] + d];
const meet = (a: Box, b: Box) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
const union = (a: Box, b: Box): Box => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];

/** Boxes joined where they meet, `d` points apart at most, until none meet: each the box round its group. */
function joined(boxes: Box[], d: number): Box[] {
  let out = boxes.slice();
  for (let changed = true; changed; ) {
    changed = false;
    const next: Box[] = [];
    for (const b of out) {
      const k = next.findIndex((n) => meet(grow(n, d / 2), grow(b, d / 2)));
      if (k < 0) next.push(b);
      else {
        next[k] = union(next[k], b);
        changed = true;
      }
    }
    out = next;
  }
  return out;
}

/**
 * The figures on a page, from what it is made of: its pictures and paths,
 * joined where they lie within `JOIN_PT` of one another - not a rule nor
 * what covers most of the page - each at least `LEAST_PT` one way and
 * `LEAST_THICK_PT` the other (a chain drawn flat is a figure, a word's
 * underline none), or holding a picture; and each widened to take the words over it or
 * right beside it, its labels, but not a column's lines of words beside it.
 */
export function figuresOf(objects: readonly PageObject[]): Box[] {
  const all = objects.map((o) => o.box);
  const page: Box = all.length ? all.reduce(union) : [0, 0, 0, 0];
  const pageArea = Math.max(1, (page[2] - page[0]) * (page[3] - page[1]));
  const drawn = objects.filter((o) => {
    if (o.kind === "text") return false;
    const [x0, y0, x1, y1] = o.box;
    const w = x1 - x0;
    const h = y1 - y0;
    if (w <= 0 && h <= 0) return false;
    if (Math.min(w, h) <= RULE_THICK_PT && Math.max(w, h) >= RULE_LONG_PT) return false;
    return w * h < MOST_OF_PAGE * pageArea;
  });
  const pictures = drawn.filter((o) => o.kind === "image").map((o) => o.box);
  const groups = joined(
    drawn.map((o) => o.box),
    JOIN_PT,
  ).filter((g) => {
    const [w, h] = [g[2] - g[0], g[3] - g[1]];
    return (Math.max(w, h) >= LEAST_PT && Math.min(w, h) >= LEAST_THICK_PT) || pictures.some((p) => meet(p, g));
  });
  // (its labels: words over it, or beside it - none as wide as most of it, as a column's line is)
  const words = objects.filter((o) => o.kind === "text").map((o) => o.box);
  const labelled = groups.map((g) => words.reduce((b, w) => (meet(grow(g, LABEL_PT), w) && w[2] - w[0] < 0.6 * (g[2] - g[0]) ? union(b, w) : b), g));
  return joined(labelled, 0);
}

/** The figure, if any, a point of a page lies in, in points from its top left. */
export function figureAt(figures: readonly Box[], x: number, y: number): Box | null {
  return figures.find(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1) ?? null;
}
