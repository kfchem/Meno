/**
 * A text being edited, as Meno draws it (docs/PDF.md, *A text*): its
 * words, where its lines begin, and what is selected - all as offsets into
 * the text, in UTF-16 code units, as the browser counts them. What is drawn,
 * and where, is the drawing's (ui/features/TextEditor); what typing does to
 * the text, and where the caret goes, is worked out here, the same on every
 * system but for the keys (`keys.ts`).
 */

/** What is selected: where it was begun, and where it is now - the caret, where the two are one. */
export type Sel = { anchor: number; head: number };

/** A part of the text replaced: from, to, and what goes there instead. */
export type Edit = { from: number; to: number; insert: string };

export const caretAt = (at: number): Sel => ({ anchor: at, head: at });
export const selFrom = (s: Sel) => Math.min(s.anchor, s.head);
export const selTo = (s: Sel) => Math.max(s.anchor, s.head);
export const isCaret = (s: Sel) => s.anchor === s.head;

/** Where each line begins: the first at 0, and each after a line's end ("\n"). */
export function lineStartsOf(text: string): number[] {
  const starts = [0];
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) starts.push(i + 1);
  return starts;
}

/** The line an offset lies on. */
export function lineAt(starts: readonly number[], at: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= at) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** A text, and where its lines begin - worked out once a change. */
export class Lines {
  readonly starts: number[];
  constructor(readonly text: string) {
    this.starts = lineStartsOf(text);
  }
  get count(): number {
    return this.starts.length;
  }
  /** Where a line begins, and where it ends - before its "\n". */
  start(line: number): number {
    return this.starts[Math.min(Math.max(line, 0), this.starts.length - 1)];
  }
  end(line: number): number {
    const i = Math.min(Math.max(line, 0), this.starts.length - 1);
    return i + 1 < this.starts.length ? this.starts[i + 1] - 1 : this.text.length;
  }
  line(i: number): string {
    return this.text.slice(this.start(i), this.end(i));
  }
  at(offset: number): number {
    return lineAt(this.starts, offset);
  }
}

/** A text with a part replaced. */
export function applyEdit(text: string, e: Edit): string {
  return text.slice(0, e.from) + e.insert + text.slice(e.to);
}

/** Where a place in the text is after an edit: before it, where it was; in or after it, moved with it. */
export function mapThrough(at: number, e: Edit, after = true): number {
  if (at < e.from || (at === e.from && !after)) return at;
  if (at <= e.to) return e.from + e.insert.length;
  return at + e.insert.length - (e.to - e.from);
}

const graphemes = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
const words = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "word" }) : null;

/** Where a line's letters begin - each as the reader sees one: an emoji with its modifiers, a letter with its accents. */
export function letterStarts(line: string): number[] {
  if (!graphemes) return Array.from({ length: line.length }, (_, i) => i);
  const out: number[] = [];
  for (const s of graphemes.segment(line)) out.push(s.index);
  return out;
}

/** A line's words and what lies between them, in order: each, where it begins and ends, and whether it is a word. */
export function wordsOf(line: string): { start: number; end: number; word: boolean }[] {
  if (!words) {
    const out: { start: number; end: number; word: boolean }[] = [];
    const re = /\w+|\s+|[^\w\s]+/g;
    for (let m = re.exec(line); m; m = re.exec(line)) out.push({ start: m.index, end: m.index + m[0].length, word: /\w/.test(m[0]) });
    return out;
  }
  return Array.from(words.segment(line), (s) => ({ start: s.index, end: s.index + s.segment.length, word: !!s.isWordLike }));
}

/** The letter after a place, or before it: where the caret goes a letter on. */
export function letterStep(lines: Lines, at: number, dir: -1 | 1): number {
  const i = lines.at(at);
  const start = lines.start(i);
  const end = lines.end(i);
  if (dir < 0 && at <= start) return i > 0 ? lines.end(i - 1) : 0;
  if (dir > 0 && at >= end) return i + 1 < lines.count ? lines.start(i + 1) : lines.text.length;
  const bounds = [...letterStarts(lines.line(i)).map((b) => start + b), end];
  if (dir > 0) return bounds.find((b) => b > at) ?? end;
  for (let k = bounds.length - 1; k >= 0; k--) if (bounds[k] < at) return bounds[k];
  return start;
}

/**
 * A word on, or back: back, to the start of the word before; on, to the
 * end of the next word (a Mac's way) or to the start of the next (Windows').
 * A line's end, or its start, is a stop of its own.
 */
export function wordStep(lines: Lines, at: number, dir: -1 | 1, on: "end" | "start"): number {
  const i = lines.at(at);
  const start = lines.start(i);
  const end = lines.end(i);
  if (dir < 0 && at <= start) return i > 0 ? lines.end(i - 1) : 0;
  if (dir > 0 && at >= end) return i + 1 < lines.count ? lines.start(i + 1) : lines.text.length;
  const col = at - start;
  const parts = wordsOf(lines.line(i));
  if (dir < 0) {
    for (let k = parts.length - 1; k >= 0; k--) if (parts[k].word && parts[k].start < col) return start + parts[k].start;
    return start;
  }
  if (on === "end") {
    const next = parts.find((p) => p.word && p.end > col);
    return next ? start + next.end : end;
  }
  // (past what it is in, then past spaces)
  let k = parts.findIndex((p) => p.end > col);
  if (k < 0) return end;
  let to = parts[k].end;
  for (k++; k < parts.length && !parts[k].word && /^\s+$/.test(lines.line(i).slice(parts[k].start, parts[k].end)); k++) to = parts[k].end;
  return start + to;
}

/** The word at a place - or what lies between words there - as two clicks select it. */
export function wordAround(lines: Lines, at: number): [number, number] {
  const i = lines.at(at);
  const start = lines.start(i);
  const col = at - start;
  const parts = wordsOf(lines.line(i));
  if (!parts.length) return [at, at];
  // (on a word's end, the word before it, unless one begins there)
  const hit = parts.find((p) => p.start <= col && col < p.end && p.word) ?? parts.find((p) => p.word && p.end === col) ?? parts.find((p) => p.start <= col && col < p.end) ?? parts[parts.length - 1];
  return [start + hit.start, start + hit.end];
}

/** A line, its end too, as three clicks select it. */
export function lineAround(lines: Lines, at: number): [number, number] {
  const i = lines.at(at);
  return [lines.start(i), i + 1 < lines.count ? lines.start(i + 1) : lines.text.length];
}

/** A paragraph's edge - here a line's - and, from it, the next's: a Mac's Option and an arrow up or down. */
export function paragraphStep(lines: Lines, at: number, dir: -1 | 1): number {
  const i = lines.at(at);
  if (dir < 0) return at > lines.start(i) ? lines.start(i) : lines.start(i - 1);
  return at < lines.end(i) ? lines.end(i) : lines.end(i + 1);
}

/** What a selection holds. */
export function selected(text: string, s: Sel): string {
  return text.slice(selFrom(s), selTo(s));
}

/**
 * A text and what is selected in it, typed into: what is selected
 * replaced, the caret after it. One step, for undoing, holds what was
 * typed in a run - broken where the caret was put elsewhere.
 */
export function typed(text: string, s: Sel, insert: string): { text: string; sel: Sel; edit: Edit } {
  const edit = { from: selFrom(s), to: selTo(s), insert };
  return { text: applyEdit(text, edit), sel: caretAt(edit.from + insert.length), edit };
}

/** Text as it is kept: its line ends as "\n" alone. */
export const plainLines = (text: string) => text.replace(/\r\n?/g, "\n");
