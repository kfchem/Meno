/**
 * The field kept out of sight that a text Meno draws is typed through
 * (docs/PDF.md, *A text*): it holds the lines around the caret - so that
 * the IME can convert again a word already written - and what is selected
 * among them, and what is typed into it is read back as an edit of the
 * text. Here, what it holds, and how a change in it is read; the field
 * itself is the drawing's (ui/features/TextEditor/typingField).
 */
import { selFrom, selTo, type Edit, type Lines, type Sel } from "./editing";

/** How many lines around the caret the field holds, before it and after it. */
export const AROUND = 2;
/** How much it holds at most: past it, what is selected is not all in it. */
export const MOST = 4000;

/** What the field holds: from where to where in the text, and what is selected in it, in its own offsets. */
export type FieldWindow = { start: number; end: number; text: string; sel: [number, number]; whole: boolean };

/** What the field holds for a text and its selection: the caret's line and those around it, and what is selected, where it is not too much. */
export function windowOf(lines: Lines, sel: Sel): FieldWindow {
  const caret = lines.at(sel.head);
  let first = Math.max(0, caret - AROUND);
  let last = Math.min(lines.count - 1, caret + AROUND);
  const from = selFrom(sel);
  const to = selTo(sel);
  const withSel = { first: Math.min(first, lines.at(from)), last: Math.max(last, lines.at(to)) };
  const whole = lines.end(withSel.last) - lines.start(withSel.first) <= MOST;
  if (whole) ({ first, last } = withSel);
  let start = lines.start(first);
  let end = lines.end(last);
  // (a line too long cut down about the caret, at the line's start or end where they are near)
  if (end - start > MOST) {
    start = Math.max(start, sel.head - MOST / 2);
    end = Math.min(end, start + MOST);
  }
  const clamp = (n: number) => Math.min(Math.max(n, start), end) - start;
  return { start, end, text: lines.text.slice(start, end), sel: whole ? [clamp(from), clamp(to)] : [clamp(sel.head), clamp(sel.head)], whole };
}

/**
 * What was typed into the field, as an edit of what it held: `before`, with
 * `[a, b)` selected, and `now`. Where the field kept what was before the
 * selection and what was after it, what lies between is what was typed in
 * its place; else, what changed is worked out from both ends.
 */
export function editOf(before: string, a: number, b: number, now: string): Edit | null {
  if (before === now) return null;
  const tail = before.length - b;
  if (now.length >= a + tail && now.startsWith(before.slice(0, a)) && now.endsWith(before.slice(b))) {
    return { from: a, to: b, insert: now.slice(a, now.length - tail) };
  }
  let p = 0;
  const most = Math.min(before.length, now.length);
  while (p < most && before.charCodeAt(p) === now.charCodeAt(p)) p++;
  let s = 0;
  while (s < most - p && before.charCodeAt(before.length - 1 - s) === now.charCodeAt(now.length - 1 - s)) s++;
  return { from: p, to: before.length - s, insert: now.slice(p, now.length - s) };
}

/** An edit of the field's text, as an edit of the whole: moved on by where the field begins. */
export const inText = (e: Edit, start: number): Edit => ({ from: e.from + start, to: e.to + start, insert: e.insert });

/**
 * What a composition the IME begins takes the place of, from its first
 * change: `before` the context's text as it began, `data` the words it
 * said it began on, and the change - `[p, q)` replaced by `text`. Where it
 * puts in again, at the caret, the very words it began on, lying just after
 * or just before the caret - converting again a word the caret is in, as
 * Chromium's EditContext passes it on - those words are what it replaces.
 * `at` is where what it composes lies in the context's text, `tail` how
 * much of that text after it is not its; `[from, to)` what it replaces, in
 * `before`.
 */
export function composingIn(before: string, data: string, p: number, q: number, text: string): { at: number; tail: number; from: number; to: number } {
  if (p === q && data && text === data) {
    // (as much of the words as lies just after the caret - all of them, or what the IME did not take away
    // first - and, where they are not all there, as much as lies just before it)
    const n = data.length;
    let after = 0;
    for (let k = n; k > 0 && !after; k--) if (before.slice(p, p + k) === data.slice(n - k)) after = k;
    let ahead = 0;
    if (after < n) for (let k = n - after; k > 0 && !ahead; k--) if (before.slice(p - k, p) === data.slice(0, k)) ahead = k;
    if (after || ahead) return { at: p, tail: before.length - p, from: p - ahead, to: p + after };
  }
  return { at: p, tail: before.length - q, from: p, to: q };
}

/**
 * Where a composition replaces, in the text as it was before the IME took
 * a part of it away first - `[d0, d1)`, as it does converting again the
 * word before the caret - from where it replaces in the text after:
 * that part, and what the composition replaces, as one.
 */
export function withTakenAway(from: number, to: number, d0: number, d1: number): [number, number] {
  const back = (x: number, end: boolean) => (x < d0 || (x === d0 && !end) ? x : x + (d1 - d0));
  return [Math.min(d0, back(from, false)), Math.max(d1, back(to, true))];
}

/** What the IME has so far, in the context's text: from `at`, all but the `tail` that is not its. */
export const composed = (now: string, at: number, tail: number) => now.slice(at, Math.max(at, now.length - tail));

/**
 * A line as it shows while the IME composes in it: `line`, beginning at
 * `start` in the text, with what the IME has so far (`text`) in place of
 * what it takes the place of (`[from, to)`, in the text's offsets) - and
 * nothing of the line after it where that reaches past the line's end.
 */
export function lineComposing(line: string, start: number, c: { from: number; to: number; text: string }): string {
  return line.slice(0, c.from - start) + c.text + (c.to <= start + line.length ? line.slice(c.to - start) : "");
}
