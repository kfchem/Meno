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

/** What of a PDF its layout needs: its pages' sizes, in points, where its top page's middle lies, which page is on top, whether they are spread, and whether it is made an icon. */
export type PdfPlace = { pages: readonly (readonly [number, number])[]; x: number; y: number; page: number; spread?: boolean; icon?: boolean };

/**
 * The type a PDF's name is set in under its icon, in points: the drawing's
 * labels' in ACS 1996's style. And how many times as tall as it the icon
 * is: as a file's icon is to its name on a desktop - 64 points to 12 in
 * the Finder, 48 pixels to 12 in Explorer.
 */
export const ICON_NAME_PT = 10;
export const ICON_TO_NAME = 5;

/** How tall a PDF made an icon is, in the page's units: five times its name's type, three and a half bonds - a small molecule's height as it is drawn. */
export const ICON_HEIGHT = ICON_TO_NAME * ICON_NAME_PT * POINT;

/** How wide an icon's name may be before it goes onto another line, in the page's units, as a file's under its icon. */
export const ICON_NAME_WIDTH = 2 * ICON_HEIGHT;

/** How much smaller than its printed size a PDF made an icon is drawn: its top page as tall as `ICON_HEIGHT`. */
export function iconScale(p: PdfPlace): number {
  const [, h] = p.pages[p.page] ?? p.pages[0] ?? [612, 792];
  return ICON_HEIGHT / (h * POINT);
}

/** A sheet as it is drawn made `k` times its size about the PDF's middle - an icon's, or one on its way to being one. */
export const shrunk = (s: Sheet, p: PdfPlace, k: number): Sheet => ({ x: p.x + (s.x - p.x) * k, y: p.y + (s.y - p.y) * k, w: s.w * k, h: s.h * k });

/** Where a page of a PDF lies as it is drawn: on its icon, among its pages spread, or on top of its stack - none, where it is not to be seen. */
export function shownSheet(p: PdfPlace, page: number): Sheet | null {
  if (p.icon) return page === p.page ? shrunk(topSheet(p), p, iconScale(p)) : null;
  if (p.spread) return spreadSheets(p)[page] ?? null;
  return page === p.page ? topSheet(p) : null;
}

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

/** What a PDF covers on the page, as it lies: its stack, its pages spread, or its icon. */
export function pdfBounds(p: PdfPlace): { x0: number; y0: number; x1: number; y1: number } {
  const stack = [...stackSheets(p), topSheet(p)];
  const sheets = p.icon ? stack.map((s) => shrunk(s, p, iconScale(p))) : p.spread ? spreadSheets(p) : stack;
  return {
    x0: Math.min(...sheets.map((s) => s.x - s.w / 2)),
    x1: Math.max(...sheets.map((s) => s.x + s.w / 2)),
    y0: Math.min(...sheets.map((s) => s.y - s.h / 2)),
    y1: Math.max(...sheets.map((s) => s.y + s.h / 2)),
  };
}

/** Whether a point of the page lies on a sheet. */
export const onSheet = (s: Sheet, q: { x: number; y: number }) => Math.abs(q.x - s.x) <= s.w / 2 && Math.abs(q.y - s.y) <= s.h / 2;
