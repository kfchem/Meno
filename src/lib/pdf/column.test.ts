import { describe, expect, it } from "vitest";
import { atOf, COLUMN_GAP, COLUMN_MARGIN, columnLayout, deepest, pageInView, pagesInView, pageUnder, pointOf, pointOn, topOf } from "./column";

const A4: [number, number] = [595, 842];
const WIDE: [number, number] = [842, 595];

describe("a PDF's pages in the column", () => {
  it("lie one under another, the widest as wide as the column, its margins aside, each in the middle", () => {
    const l = columnLayout([A4, WIDE, A4], 440, 1);
    expect(l.width).toBe(440);
    expect(l.pages[1].w).toBeCloseTo(440 - 2 * COLUMN_MARGIN);
    expect(l.pages[0].w).toBeCloseTo((595 / 842) * (440 - 2 * COLUMN_MARGIN));
    expect(l.pages[0].x + l.pages[0].w / 2).toBeCloseTo(220);
    expect(l.pages[0].y).toBe(COLUMN_MARGIN);
    expect(l.pages[1].y).toBeCloseTo(l.pages[0].y + l.pages[0].h + COLUMN_GAP);
    expect(l.height).toBeCloseTo(l.pages[2].y + l.pages[2].h + COLUMN_MARGIN);
  });

  it("larger than the column, are wider than it, from its margin", () => {
    const l = columnLayout([A4], 440, 2);
    expect(l.pages[0].w).toBeCloseTo(2 * (440 - 2 * COLUMN_MARGIN));
    expect(l.width).toBeCloseTo(l.pages[0].w + 2 * COLUMN_MARGIN);
    expect(l.pages[0].x).toBeCloseTo(COLUMN_MARGIN);
  });

  it("are read so many pages down: a page gone to has its top just under the column's top, and widths keep the place", () => {
    const sizes = Array.from({ length: 6 }, () => A4);
    const l = columnLayout(sizes, 440, 1);
    expect(topOf(l, 0)).toBe(0);
    expect(topOf(l, 3)).toBeCloseTo(l.pages[3].y - COLUMN_GAP / 2);
    for (const at of [0, 0.25, 1.5, 4.75]) expect(atOf(l, topOf(l, at))).toBeCloseTo(at);
    // (a hair short of a page's place, still that hair short: what is eased toward it comes there)
    expect(topOf(l, atOf(l, topOf(l, 3) - 0.1))).toBeCloseTo(topOf(l, 3) - 0.1, 3);
    // (half way down the third page, however wide the column)
    const wider = columnLayout(sizes, 800, 1);
    const mid = (k: typeof l) => (topOf(k, 2.5) - k.pages[2].y) / k.pages[2].h;
    expect(mid(wider)).toBeCloseTo(mid(l), 2);
  });

  it("show the page most in view, the first of those as much", () => {
    const l = columnLayout(Array.from({ length: 4 }, () => A4), 440, 1);
    const h = l.pages[0].h;
    expect(pageInView(l, 0, h)).toBe(0);
    expect(pageInView(l, l.pages[1].y + h * 0.6, h)).toBe(2);
    // (small, all of two in view: the first)
    const small = columnLayout(Array.from({ length: 4 }, () => A4), 440, 0.25);
    expect(pageInView(small, 0, 2000)).toBe(0);
    expect(pagesInView(l, 0, h)).toEqual([0]);
    expect(pagesInView(l, 0, h + 2 * COLUMN_MARGIN)).toEqual([0, 1]);
    expect(pagesInView(l, 0, h, 2 * h)).toEqual([0, 1, 2]);
    expect(deepest(l, h)).toBeCloseTo(l.height - h);
  });

  it("find where a point is on a page, and where that point is again", () => {
    const l = columnLayout([A4, A4], 440, 1.5);
    const p = l.pages[1];
    const at = pointOn(l, p.x + p.w * 0.3, p.y + p.h * 0.7);
    expect(at.page).toBe(1);
    expect(at.u).toBeCloseTo(0.3);
    expect(at.v).toBeCloseTo(0.7);
    const back = pointOf(l, at);
    expect(back.x).toBeCloseTo(p.x + p.w * 0.3);
    expect(back.y).toBeCloseTo(p.y + p.h * 0.7);
    expect(pageUnder(l, p.x + 1, p.y + 1)).toBe(1);
    expect(pageUnder(l, 1, p.y + 1)).toBeNull();
  });
});
