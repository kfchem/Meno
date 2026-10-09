import { describe, expect, it } from "vitest";
import { figureAt, figuresOf, pageObjectsOf, type Box, type PageObject } from "./figures";

const path = (box: Box): PageObject => ({ kind: "path", box });
const text = (box: Box): PageObject => ({ kind: "text", box });

/** A structure drawn as a paper draws one: short bonds, near one another, its atoms' labels over and beside them. */
function structureAt(x: number, y: number): PageObject[] {
  const bonds: PageObject[] = [];
  for (let i = 0; i < 6; i++) bonds.push(path([x + i * 12, y + (i % 2) * 7, x + i * 12 + 12, y + (i % 2) * 7 + 7]));
  return [...bonds, text([x - 9, y + 2, x - 1, y + 10]), text([x + 70, y + 20, x + 80, y + 28])];
}

describe("a PDF page's figures", () => {
  it("are read from the reader's answer: what each thing is and where it lies, 20 bytes each", () => {
    const buf = new ArrayBuffer(60);
    const v = new DataView(buf);
    [
      [2, 1, 2, 3, 4],
      [3, 5, 6, 7, 8],
      [9, 0, 0, 1, 1],
    ].forEach((row, i) => {
      v.setUint32(i * 20, row[0], true);
      row.slice(1).forEach((n, k) => v.setFloat32(i * 20 + 4 + k * 4, n, true));
    });
    expect(pageObjectsOf(buf)).toEqual([
      { kind: "path", box: [1, 2, 3, 4] },
      { kind: "image", box: [5, 6, 7, 8] },
    ]);
  });

  it("are where pictures and paths lie together, with their labels", () => {
    const figures = figuresOf(structureAt(100, 300));
    expect(figures).toHaveLength(1);
    // (the bonds, and the labels beside them)
    expect(figures[0]).toEqual([91, 300, 180, 328]);
  });

  it("are each their own where they lie apart; a picture, however small, is one", () => {
    const figures = figuresOf([...structureAt(100, 300), ...structureAt(100, 500), { kind: "image", box: [300, 100, 316, 112] }]);
    expect(figures).toHaveLength(3);
    expect(figureAt(figures, 120, 510)).toEqual(figures.find((f) => f[1] === 500));
    expect(figureAt(figures, 10, 10)).toBeNull();
  });

  it("are no rule, no page's frame, and do not take a column's lines of words beside them", () => {
    const rule = path([72, 60, 523, 61]);
    const frame = path([0, 0, 595, 842]);
    const line = text([60, 330, 400, 340]);
    const figures = figuresOf([rule, frame, line, ...structureAt(100, 300), text([0, 0, 595, 842])]);
    expect(figures).toEqual([[91, 300, 180, 328]]);
    expect(figuresOf([rule, frame])).toEqual([]);
  });
});
