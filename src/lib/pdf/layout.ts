/**
 * Where a PDF's pages lie on the page (docs/PDF.md, *A PDF*, *On the
 * page*): at the size they are printed at, as the drawing is - a bond
 * 14.4 points long, as the ACS's style prints it, is a bond on the page -
 * stacked, the page on top over the others, or spread out in rows.
 */
import { NOMINAL_BOND_LENGTH } from "../chem/acs";

/** The page's units in a point: a bond printed 14.4 points long is a bond drawn. */
export const POINT = NOMINAL_BOND_LENGTH / 14.4;

/** A rectangle on the page: its middle, and its width and height. */
export type Sheet = { x: number; y: number; w: number; h: number };

/** What of a PDF its layout needs: its pages' sizes, in points, where its top page's middle lies, which page is on top, and whether they are spread. */
export type PdfPlace = { pages: readonly (readonly [number, number])[]; x: number; y: number; page: number; spread?: boolean };

/** How many sheets show under the top one, at most, and how far each lies from the one over it (down and to the right), in the page's units. */
export const UNDER_MOST = 4;
export const UNDER_STEP = 0.7;

/** The sheets of a stack showing, the bottom first: those under the top page - as many as there are, up to `UNDER_MOST` - each the size of the top page. */
export function stackSheets(p: PdfPlace): Sheet[] {
  const [w, h] = p.pages[p.page] ?? p.pages[0] ?? [612, 792];
  const under = Math.min(UNDER_MOST, Math.max(0, p.pages.length - 1));
  const out: Sheet[] = [];
  for (let k = under; k >= 1; k--) out.push({ x: p.x + k * UNDER_STEP, y: p.y - k * UNDER_STEP, w: w * POINT, h: h * POINT });
  return out;
}

/** The top page's sheet, where it is stacked. */
export function topSheet(p: PdfPlace): Sheet {
  const [w, h] = p.pages[p.page] ?? p.pages[0] ?? [612, 792];
  return { x: p.x, y: p.y, w: w * POINT, h: h * POINT };
}

/** The gap between pages spread, in the page's units. */
export const SPREAD_GAP = 4;

/** How many pages a row of a spread holds: four, or fewer for fewer pages. */
export const spreadColumns = (n: number) => Math.max(1, Math.min(4, n));

/**
 * Each page's sheet where the pages are spread: in rows, left to right, the
 * first where the top page lay - its top left where the stack's was - each
 * row as tall as its tallest page.
 */
export function spreadSheets(p: PdfPlace): Sheet[] {
  const top = topSheet(p);
  const left = top.x - top.w / 2;
  let y = top.y + top.h / 2;
  const cols = spreadColumns(p.pages.length);
  const out: Sheet[] = [];
  for (let i = 0; i < p.pages.length; i += cols) {
    const row = p.pages.slice(i, i + cols).map(([w, h]) => ({ w: w * POINT, h: h * POINT }));
    const tall = Math.max(...row.map((r) => r.h));
    let x = left;
    for (const r of row) {
      out.push({ x: x + r.w / 2, y: y - r.h / 2, w: r.w, h: r.h });
      x += r.w + SPREAD_GAP;
    }
    y -= tall + SPREAD_GAP;
  }
  return out;
}

/** What a PDF covers on the page, as it lies: its stack, or its pages spread. */
export function pdfBounds(p: PdfPlace): { x0: number; y0: number; x1: number; y1: number } {
  const sheets = p.spread ? spreadSheets(p) : [...stackSheets(p), topSheet(p)];
  return {
    x0: Math.min(...sheets.map((s) => s.x - s.w / 2)),
    x1: Math.max(...sheets.map((s) => s.x + s.w / 2)),
    y0: Math.min(...sheets.map((s) => s.y - s.h / 2)),
    y1: Math.max(...sheets.map((s) => s.y + s.h / 2)),
  };
}

/** Whether a point of the page lies on a sheet. */
export const onSheet = (s: Sheet, q: { x: number; y: number }) => Math.abs(q.x - s.x) <= s.w / 2 && Math.abs(q.y - s.y) <= s.h / 2;
