/**
 * A PDF's words (docs/PDF.md, *Text*, *Search*): each page's letters as
 * PDFium reads them, each where it lies on the page, and what a reader does
 * with them - the place between letters nearest the pointer, a word, a line,
 * the letters between two places as boxes to mark and as words to copy,
 * and the places a search finds.
 *
 * PDFium puts letters of its own among the page's: a space between words it
 * finds apart, a line's end ("\r\n"), and, for a word broken by a hyphen at
 * a line's end, U+0002 in place of the hyphen. Those have no box. Words
 * copied, and words searched, read a line's end as a space and a word so
 * broken whole - PDFium's own search does not (the trial, step 0) - while
 * a hyphen PDFium left as it was at a line's end is a word's own, as in
 * Diels-Alder, and kept, the line's end after it read as nothing.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";

/** A page's letters: each one's character, and its box - left, top, right, bottom, in points from the page's top left; all naught, none. */
export type PageText = { codes: Uint32Array; boxes: Float32Array };

/** A page's letters, from what the reader answers: 20 bytes each (src-tauri/src/pdf.rs, `pdf_text`). */
export function pageTextOf(buf: ArrayBuffer): PageText {
  const view = new DataView(buf);
  const n = Math.floor(buf.byteLength / 20);
  const codes = new Uint32Array(n);
  const boxes = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    codes[i] = view.getUint32(i * 20, true);
    for (let k = 0; k < 4; k++) boxes[i * 4 + k] = view.getFloat32(i * 20 + 4 + k * 4, true);
  }
  return { codes, boxes };
}

/** A page's letters from a string and boxes: for tests, and for what is not read from a PDF. */
export function pageTextFrom(text: string, boxes: readonly (readonly [number, number, number, number] | null)[]): PageText {
  const chars = [...text];
  const codes = new Uint32Array(chars.map((c) => c.codePointAt(0)!));
  const b = new Float32Array(chars.length * 4);
  chars.forEach((_, i) => boxes[i]?.forEach((v, k) => (b[i * 4 + k] = v)));
  return { codes, boxes: b };
}

const had = new Map<string, PageText | "asked">();
const waiting = new Map<string, Promise<PageText>>();

/** A page's letters, read once and kept. */
export function textOf(sha256: string, page: number): Promise<PageText> {
  const key = `${sha256}:${page}`;
  const h = had.get(key);
  if (h && h !== "asked") return Promise.resolve(h);
  let w = waiting.get(key);
  if (!w) {
    w = isTauri()
      ? invoke<ArrayBuffer>("pdf_text", { sha: sha256, page }).then((buf) => {
          const t = pageTextOf(buf);
          had.set(key, t);
          return t;
        })
      : Promise.resolve(pageTextOf(new ArrayBuffer(0)));
    waiting.set(key, w);
    w.catch(() => undefined).finally(() => waiting.delete(key));
  }
  return w;
}

/** A page's letters, if they have come - asked for, the first time, and `came` called once they have. */
export function textHad(sha256: string, page: number, came: () => void = () => {}): PageText | null {
  const key = `${sha256}:${page}`;
  const h = had.get(key);
  if (h && h !== "asked") return h;
  if (!h) {
    had.set(key, "asked");
    textOf(sha256, page)
      .then(() => came())
      .catch(() => had.delete(key));
  }
  return null;
}

const LINE_END = 10;
const RETURN = 13;
const BROKEN = 2;
const SPACE = 32;

const boxOf = (t: PageText, i: number) => [t.boxes[i * 4], t.boxes[i * 4 + 1], t.boxes[i * 4 + 2], t.boxes[i * 4 + 3]] as const;
const hasBox = (t: PageText, i: number) => t.boxes[i * 4 + 2] > t.boxes[i * 4] || t.boxes[i * 4 + 3] > t.boxes[i * 4 + 1];

/** A line of a page: its first letter and the one after its last, and the box round its letters. */
export type Line = { start: number; end: number; x0: number; y0: number; x1: number; y1: number };

const linesKept = new WeakMap<PageText, Line[]>();

/** A page's lines, as PDFium ends them, each with the box round its letters - those with none left out. */
export function linesOf(t: PageText): Line[] {
  const kept = linesKept.get(t);
  if (kept) return kept;
  const out: Line[] = [];
  let start = 0;
  const close = (end: number) => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = start; i < end; i++) {
      if (!hasBox(t, i)) continue;
      const [a, b, c, d] = boxOf(t, i);
      x0 = Math.min(x0, a);
      y0 = Math.min(y0, b);
      x1 = Math.max(x1, c);
      y1 = Math.max(y1, d);
    }
    if (x1 > x0) out.push({ start, end, x0, y0, x1, y1 });
  };
  for (let i = 0; i < t.codes.length; i++) {
    if (t.codes[i] !== LINE_END) continue;
    close(i + 1);
    start = i + 1;
  }
  close(t.codes.length);
  linesKept.set(t, out);
  return out;
}

/** The letter, if any, whose box holds a point of the page, in points - within `slack` of it. */
export function letterAt(t: PageText, x: number, y: number, slack = 0.5): number | null {
  for (let i = 0; i < t.codes.length; i++) {
    if (!hasBox(t, i)) continue;
    const [a, b, c, d] = boxOf(t, i);
    if (x >= a - slack && x <= c + slack && y >= b - slack && y <= d + slack) return i;
  }
  return null;
}

/**
 * The place between letters nearest a point of the page: on the line the
 * point is on, or the nearest line - before a letter whose middle is to the
 * right of the point, after the last whose middle is to its left. Above
 * every line, the page's first place; below, its last.
 */
export function placeAt(t: PageText, x: number, y: number): number {
  const lines = linesOf(t);
  if (!lines.length) return 0;
  let line = lines[0];
  let near = Infinity;
  for (const l of lines) {
    const dy = y < l.y0 ? l.y0 - y : y > l.y1 ? y - l.y1 : 0;
    const dx = x < l.x0 ? l.x0 - x : x > l.x1 ? x - l.x1 : 0;
    const d = dy * 4 + dx;
    if (d < near) {
      near = d;
      line = l;
    }
  }
  let at = line.start;
  for (let i = line.start; i < line.end; i++) {
    if (!hasBox(t, i)) continue;
    const [a, , c] = boxOf(t, i);
    if (x >= (a + c) / 2) at = i + 1;
    else break;
  }
  // (after a line's last letter, before its end)
  while (at > line.start && (t.codes[at - 1] === LINE_END || t.codes[at - 1] === RETURN)) at--;
  return at;
}

const WORDISH = /[\p{L}\p{N}_'’‐-]/u;
const isWordish = (t: PageText, i: number) => WORDISH.test(String.fromCodePoint(t.codes[i]));

/** The word a letter is in: its first letter and the one after its last - or the letter alone, if it is no word's. */
export function wordAt(t: PageText, i: number): [number, number] {
  if (i < 0 || i >= t.codes.length) return [i, i];
  if (!isWordish(t, i)) return [i, i + 1];
  let a = i;
  let b = i + 1;
  while (a > 0 && isWordish(t, a - 1)) a--;
  while (b < t.codes.length && isWordish(t, b)) b++;
  return [a, b];
}

/** The line a letter is on: its first letter and the one after its last, its end left out. */
export function lineAt(t: PageText, i: number): [number, number] {
  const l = linesOf(t).find((x) => i >= x.start && i < x.end) ?? { start: i, end: i + 1 };
  let end = l.end;
  while (end > l.start && (t.codes[end - 1] === LINE_END || t.codes[end - 1] === RETURN)) end--;
  return [l.start, end];
}

/** The boxes to mark the letters from `a` to before `b` with: one a line, as tall as the line, from the first marked letter's left to the last's right. */
export function marksBetween(t: PageText, a: number, b: number): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  if (b <= a) return out;
  for (const l of linesOf(t)) {
    if (l.end <= a || l.start >= b) continue;
    let x0 = Infinity;
    let x1 = -Infinity;
    for (let i = Math.max(a, l.start); i < Math.min(b, l.end); i++) {
      if (!hasBox(t, i)) continue;
      const [p, , q] = boxOf(t, i);
      x0 = Math.min(x0, p);
      x1 = Math.max(x1, q);
    }
    if (x1 > x0) out.push([x0, l.y0, x1, l.y1]);
  }
  return out;
}

/** The words from letter `a` to before `b`, as they are copied: a line's end a space, a word broken at one whole. */
export function wordsBetween(t: PageText, a: number, b: number): string {
  let out = "";
  for (let i = Math.max(0, a); i < Math.min(b, t.codes.length); i++) {
    const c = t.codes[i];
    if (c === BROKEN) {
      // (the hyphen PDFium read as a word's break, and the line's end after it)
      while (i + 1 < b && (t.codes[i + 1] === RETURN || t.codes[i + 1] === LINE_END)) i++;
      continue;
    }
    if (c === RETURN || c === LINE_END) {
      if (out && !out.endsWith(" ") && !out.endsWith("-")) out += " ";
      continue;
    }
    out += String.fromCodePoint(c);
  }
  return out.trim();
}

/**
 * A page's words as they are searched: lower case, a line's end a space,
 * runs of space one, a word broken at a line's end whole - or, `hyphened`,
 * with its hyphen, for a word such as Diels-Alder broken there - each
 * letter of it pointing back to the page's.
 */
export function searchable(t: PageText, hyphened = false): { text: string; back: number[] } {
  let text = "";
  const back: number[] = [];
  const lineEnd = (k: number) => t.codes[k] === RETURN || t.codes[k] === LINE_END;
  for (let i = 0; i < t.codes.length; i++) {
    const c = t.codes[i];
    if (c === BROKEN || (c === 0x2d && lineEnd(i + 1))) {
      if (c !== BROKEN || hyphened) {
        text += "-";
        back.push(i);
      }
      while (i + 1 < t.codes.length && lineEnd(i + 1)) i++;
      continue;
    }
    const space = c === RETURN || c === LINE_END || c === SPACE || c === 9 || c === 0xa0;
    if (space) {
      if (text && !text.endsWith(" ")) {
        text += " ";
        back.push(i);
      }
      continue;
    }
    for (const ch of String.fromCodePoint(c).toLowerCase()) {
      text += ch;
      back.push(i);
    }
  }
  return { text, back };
}

const searchKept = new WeakMap<PageText, { text: string; back: number[] }[]>();

/** What is searched for, as it is matched: lower case, its runs of space one. */
export const searchOf = (q: string) => q.toLowerCase().replace(/\s+/g, " ").trim();

/** Where on a page a search finds what is asked: each place's first letter and the one after its last. */
export function findIn(t: PageText, q: string): [number, number][] {
  const want = searchOf(q);
  if (!want) return [];
  let kept = searchKept.get(t);
  if (!kept) searchKept.set(t, (kept = [searchable(t), searchable(t, true)]));
  // (a word broken at a line's end found whole, and - asked with a hyphen - with it)
  const seen = new Set<string>();
  const out: [number, number][] = [];
  for (const s of want.includes("-") ? kept : kept.slice(0, 1))
    for (let at = s.text.indexOf(want); at >= 0; at = s.text.indexOf(want, at + 1)) {
      // (a letter that is several when lower case, as "İ", counts once)
      const place: [number, number] = [s.back[at], s.back[at + want.length - 1] + 1];
      if (seen.has(place.join())) continue;
      seen.add(place.join());
      out.push(place);
    }
  return out.sort((a, b) => a[0] - b[0]);
}
