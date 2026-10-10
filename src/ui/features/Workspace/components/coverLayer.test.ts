import { describe, expect, it } from "vitest";
import { viewBesideColumn } from "./coverLayer";
import { COLUMN_NARROWEST, COLUMN_WIDTH, columnWidthFor } from "../utils/texts";

const size = { width: 1280, height: 800 };

describe("the column's width", () => {
  it("is three quarters of the canvas for a PDF, a text's own for a text, as dragged once dragged - within its least and most", () => {
    expect(columnWidthFor(1280, true, null)).toBe(960);
    expect(columnWidthFor(1280, false, null)).toBe(COLUMN_WIDTH);
    expect(columnWidthFor(1280, true, 500)).toBe(500);
    expect(columnWidthFor(1280, true, 5000)).toBeCloseTo(1280 * 0.85);
    expect(columnWidthFor(1280, false, 10)).toBe(COLUMN_NARROWEST);
  });
});

describe("the view as the column opens on a PDF", () => {
  // (the view at zoom 2, its middle at the page's origin: 640 by 400 of the page seen)
  const view = { zoom: 2, x: 0, y: 0 };

  it("is left as it is where the PDF will be all in what is left in view", () => {
    // (the column covering 960 of 1280: 160 of the page left in view, once the view has followed by 240)
    const left = 960 / 2 / 2 - 320;
    expect(viewBesideColumn(view, size, { now: 0, final: 960 }, { x0: left + 30, x1: left + 100, y0: -50, y1: 50 })).toBeNull();
    // (one that will be under the column: brought out)
    expect(viewBesideColumn(view, size, { now: 0, final: 960 }, { x0: left + 200, x1: left + 260, y0: -50, y1: 50 })).not.toBeNull();
  });

  it("is made smaller, never larger, so that the PDF is all in what is left, in its middle once the view has followed", () => {
    const b = { x0: -150, x1: 150, y0: -210, y1: 210 };
    const to = viewBesideColumn(view, size, { now: 0, final: 960 }, b)!;
    expect(to.zoom).toBeLessThan(view.zoom);
    // (what the following adds: half of what the column comes to cover)
    const x = to.x + 960 / 2 / to.zoom;
    // (the middle of what is left in view: 160 pixels right of the canvas's left)
    const middle = x - size.width / 2 / to.zoom + (size.width - 960) / 2 / to.zoom;
    expect(middle).toBeCloseTo(0);
    expect((b.x1 - b.x0) * to.zoom).toBeLessThanOrEqual(size.width - 960);
    // (from a text's column already open, as far as is left to follow)
    const from = viewBesideColumn(view, size, { now: 440, final: 960 }, b)!;
    expect(from.x + (960 - 440) / 2 / from.zoom).toBeCloseTo(x);
    // (a tiny PDF out of view: brought in, not made larger)
    const far = viewBesideColumn(view, size, { now: 0, final: 960 }, { x0: 500, x1: 501, y0: 0, y1: 1 })!;
    expect(far.zoom).toBe(view.zoom);
  });
});
