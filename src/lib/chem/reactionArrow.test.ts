import { describe, expect, it } from "vitest";
import { arrowMeasures, arrowOutline, type ArrowMeasures } from "./reactionArrow";
import { ACS_1996, MENO, ofBond, pt, resolveStyle } from "./style";

type P = { x: number; y: number };

/** Twice the outline's area, positive when it runs anticlockwise. */
function area2(outline: P[]): number {
  let a = 0;
  for (let i = 0; i < outline.length; i++) {
    const u = outline[i];
    const v = outline[(i + 1) % outline.length];
    a += u.x * v.y - v.x * u.y;
  }
  return a;
}

/** How far the outline reaches across, below and above, where it crosses `x`. */
function acrossAt(outline: P[], x: number): [number, number] {
  const ys: number[] = [];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    if ((a.x - x) * (b.x - x) > 0 || a.x === b.x) continue;
    ys.push(a.y + ((x - a.x) * (b.y - a.y)) / (b.x - a.x));
  }
  return [Math.min(...ys), Math.max(...ys)];
}

/** Whether `p` is inside the outline (even-odd). */
function inside(outline: P[], p: P): boolean {
  let hit = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[i];
    const b = outline[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

// an arrow along +x, from (0, 0) to its point at (10, 0)
const from = { x: 0, y: 0 };
const to = { x: 10, y: 0 };
const plain: ArrowMeasures = { thickness: 0.2, headLength: 2, headWidth: 1.2, inset: 0, round: false };

describe("a reaction arrow's measures", () => {
  it("come from the style, at the drawing's bond length", () => {
    const m = arrowMeasures(ACS_1996, 1.8);
    // 0.6 pt of a 14.4 pt bond, 5 pt and 3.6 pt
    expect(m.thickness).toBeCloseTo((0.6 / 14.4) * 1.8, 9);
    expect(m.headLength).toBeCloseTo((5 / 14.4) * 1.8, 9);
    expect(m.headWidth).toBeCloseTo((3.6 / 14.4) * 1.8, 9);
    expect(m.inset).toBe(0);
    expect(m.round).toBe(false);
    expect(arrowMeasures(MENO, 1.8).round).toBe(true);
  });

  it("take the arrow's own line thickness over the bonds'", () => {
    const style = resolveStyle(ACS_1996, {
      reactionArrowThickness: pt(1.2),
      reactionArrowHeadWidth: ofBond(0.5),
      reactionArrowHeadInset: 0.3,
    });
    const m = arrowMeasures(style, 1.8);
    expect(m.thickness).toBeCloseTo((1.2 / 14.4) * 1.8, 9);
    expect(m.headWidth).toBeCloseTo(0.9, 9);
    expect(m.inset).toBe(0.3);
  });
});

describe("a reaction arrow's outline", () => {
  it("is a line into a triangle, running anticlockwise", () => {
    const o = arrowOutline(from, to, plain);
    expect(area2(o)).toBeGreaterThan(0);
    // the line, as thick as it is
    expect(acrossAt(o, 4)).toEqual([-0.1, 0.1]);
    // the head: as wide as it is at its back, to its point
    const [lo, hi] = acrossAt(o, 8.0001);
    expect(hi).toBeCloseTo(0.6, 3);
    expect(lo).toBeCloseTo(-0.6, 3);
    expect(Math.max(...o.map((p) => p.x))).toBe(10);
    expect(Math.min(...o.map((p) => p.x))).toBe(0);
  });

  it("draws the back of the head in towards its point, by its notch", () => {
    const o = arrowOutline(from, to, { ...plain, inset: 0.5 });
    expect(area2(o)).toBeGreaterThan(0);
    // its back corners are where a triangle's are
    expect(o).toContainEqual({ x: 8, y: 0.6 });
    expect(o).toContainEqual({ x: 8, y: -0.6 });
    // the line runs into the head as far as the drawn-in back, beside it
    const join = 8 + 1 * (1 - 0.1 / 0.6);
    expect(o).toContainEqual({ x: join, y: 0.1 });
    // and just in front of its back, beside the line, there is nothing
    const behind = { x: 8.3, y: 0.3 };
    expect(inside(o, behind)).toBe(false);
    expect(inside(arrowOutline(from, to, plain), behind)).toBe(true);
  });

  it("rounds its tail in a style with round ends", () => {
    const o = arrowOutline(from, to, { ...plain, round: true });
    expect(area2(o)).toBeGreaterThan(0);
    expect(Math.min(...o.map((p) => p.x))).toBeCloseTo(-0.1, 3);
  });

  it("is all head when the arrow is shorter than its head", () => {
    const o = arrowOutline(from, { x: 1, y: 0 }, plain);
    expect(o).toHaveLength(3);
    expect(area2(o)).toBeGreaterThan(0);
    expect(o).toContainEqual({ x: 0, y: 0.6 });
    expect(o).toContainEqual({ x: 1, y: 0 });
    // with a notch, what of the line there is fills it beside the line
    const notched = arrowOutline(from, { x: 1, y: 0 }, { ...plain, inset: 0.25 });
    expect(area2(notched)).toBeGreaterThan(0);
    expect(Math.min(...notched.map((p) => p.x))).toBe(0);
    expect(inside(notched, { x: 0.1, y: 0 })).toBe(true);
    expect(inside(notched, { x: 0.1, y: 0.3 })).toBe(false);
  });

  it("keeps the head no narrower than the line", () => {
    const o = arrowOutline(from, to, { ...plain, thickness: 2, headWidth: 1 });
    const [lo, hi] = acrossAt(o, 8.0001);
    expect(hi).toBeCloseTo(1, 3);
    expect(lo).toBeCloseTo(-1, 3);
  });

  it("points the way it is drawn", () => {
    const o = arrowOutline({ x: 0, y: 0 }, { x: 0, y: -10 }, plain);
    expect(area2(o)).toBeGreaterThan(0);
    expect(Math.min(...o.map((p) => p.y))).toBeCloseTo(-10, 9);
  });

  it("is nothing for an arrow of no length", () => {
    expect(arrowOutline(from, from, plain)).toEqual([]);
  });
});
