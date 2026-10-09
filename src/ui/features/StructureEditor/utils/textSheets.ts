/**
 * A text's sheet on the page (docs/PDF.md, *A text*): as large as its first
 * lines need, at the size they would be printed - Meno's monospaced type at
 * 9 points, a line every 12 - as wide as its longest line among them, up to
 * 80 letters, as tall as its first 40 lines; never smaller than a few
 * lines of 32 letters. Where it lies is its top left (`WorkspaceText.at`),
 * so that a text growing at its end grows down.
 */
import { POINT } from "../../../../lib/pdf/layout";

/** The type on a sheet: its size, and a line's, in points; how wide a letter is, as a share of the size (IBM Plex Mono's 600 units in 1000). */
export const SHEET_TYPE_PT = 9;
export const SHEET_LINE_PT = 12;
export const SHEET_LETTER = 0.6;
/** How far in from a sheet's edges its lines lie, in points. */
export const SHEET_PAD_PT = 12;
/** How many letters across a sheet holds at most and at least, and how many lines. */
export const SHEET_MOST_COLS = 80;
export const SHEET_LEAST_COLS = 32;
export const SHEET_MOST_LINES = 40;
export const SHEET_LEAST_LINES = 3;
/** How many letters apart a tab's stops are, on a sheet as in the column. */
const TAB = 4;

/** A text's sheet: how wide and tall, in world units, and the lines it shows - each cut to what it holds across. */
export type TextSheet = { w: number; h: number; lines: string[]; cols: number };

/** A line as a sheet shows it: its tabs as spaces to the next stop, cut to `cols` letters. */
function shownLine(line: string, cols: number): string {
  let out = "";
  let col = 0;
  for (const ch of line) {
    if (col >= cols) break;
    if (ch === "\t") {
      const n = Math.min(TAB - (col % TAB), cols - col);
      out += " ".repeat(n);
      col += n;
    } else {
      out += ch;
      col++;
    }
  }
  return out;
}

/** How many letters a line takes across, its tabs to their stops. */
function lettersAcross(line: string): number {
  let col = 0;
  for (const ch of line) col += ch === "\t" ? TAB - (col % TAB) : 1;
  return col;
}

/** The sheet a text lies on, on the page. */
export function sheetOf(text: string): TextSheet {
  const all = text.split("\n");
  // (a last line ending the text's last line is none)
  if (all.length > 1 && all[all.length - 1] === "") all.pop();
  const first = all.slice(0, SHEET_MOST_LINES);
  const cols = Math.min(SHEET_MOST_COLS, Math.max(SHEET_LEAST_COLS, ...first.map(lettersAcross)));
  const rows = Math.max(SHEET_LEAST_LINES, first.length);
  const wPt = cols * SHEET_LETTER * SHEET_TYPE_PT + 2 * SHEET_PAD_PT;
  const hPt = rows * SHEET_LINE_PT + 2 * SHEET_PAD_PT;
  return { w: wPt * POINT, h: hPt * POINT, lines: first.map((l) => shownLine(l, cols)), cols };
}

/** Where a sheet lies on the page: left, right, foot and top. */
export function sheetBox(at: { x: number; y: number }, s: Pick<TextSheet, "w" | "h">): { x0: number; x1: number; y0: number; y1: number } {
  return { x0: at.x, x1: at.x + s.w, y0: at.y - s.h, y1: at.y };
}

/** A sheet's middle, where it lies at `at`: what a box or a lasso takes it by. */
export function sheetMiddle(at: { x: number; y: number }, text: string): { x: number; y: number } {
  const s = sheetOf(text);
  return { x: at.x + s.w / 2, y: at.y - s.h / 2 };
}
