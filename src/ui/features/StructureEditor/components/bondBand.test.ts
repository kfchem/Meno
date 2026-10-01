import { describe, expect, it } from "vitest";
import { bandAround, hull, squareBand } from "./bondBand";

type P = { x: number; y: number };
const even = (h: number) => ({ left1: h, right1: h, left2: h, right2: h });

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

// a bond along +x, from (0, 0) to (2, 0): +y is its left
const p = { x: 0, y: 0 };
const q = { x: 2, y: 0 };
const line = 0.04;
const margin = 0.1;
const plainHalf = line + margin;
const ext = 0.06;

describe("the band round a bond under the pointer", () => {
  it("is a plain bond's capsule, ext past either atom", () => {
    const band = bandAround(p, q, even(line), margin, plainHalf, ext, 1);
    const [lo, hi] = acrossAt(band, 1);
    expect(lo).toBeCloseTo(-plainHalf, 3);
    expect(hi).toBeCloseTo(plainHalf, 3);
    const xs = band.map((v) => v.x);
    expect(Math.min(...xs)).toBeCloseTo(-ext, 3);
    expect(Math.max(...xs)).toBeCloseTo(2 + ext, 3);
  });

  it("widens with a wedge to its broad end, the margin past it all the way", () => {
    const broad = 0.2;
    const band = bandAround(p, q, { left1: line, right1: line, left2: broad, right2: broad }, margin, plainHalf, ext, 1);
    // as a plain bond's at the narrow end
    expect(acrossAt(band, 0.2)[1]).toBeLessThan(plainHalf + 0.02);
    // and past the broad end at the atom by most of the margin
    const [lo, hi] = acrossAt(band, 2);
    expect(hi).toBeGreaterThan(broad + margin / 2);
    expect(lo).toBeLessThan(-(broad + margin / 2));
  });

  it("takes in a double bond's second line on its side only", () => {
    const second = 0.3;
    const reach = { left1: line + second, right1: line, left2: line + second, right2: line };
    const [lo, hi] = acrossAt(bandAround(p, q, reach, margin, plainHalf, ext, 1), 1);
    expect(hi).toBeCloseTo(second + line + margin, 3);
    expect(lo).toBeCloseTo(-(line + margin), 3);
  });

  it("shrinks as a whole as it comes in and goes", () => {
    const [lo, hi] = acrossAt(bandAround(p, q, even(line), margin, plainHalf / 2, ext, 0.5), 1);
    expect(hi).toBeCloseTo(plainHalf / 2, 3);
    expect(lo).toBeCloseTo(-plainHalf / 2, 3);
  });

  it("hulls points anticlockwise, without the ones inside", () => {
    const h = hull([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: 0.5, y: 0.5 },
    ]);
    expect(h).toHaveLength(4);
    let area = 0;
    for (let i = 0; i < h.length; i++) {
      const a = h[i];
      const b = h[(i + 1) % h.length];
      area += a.x * b.y - b.x * a.y;
    }
    expect(area).toBeGreaterThan(0);
  });
});

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

describe("the selection's band along a bond", () => {
  it("is a plain bond's rectangle, square at either atom", () => {
    const band = squareBand(p, q, even(line), margin);
    expect(band).toHaveLength(4);
    expect(area2(band)).toBeGreaterThan(0);
    const [lo, hi] = acrossAt(band, 1);
    expect(lo).toBeCloseTo(-plainHalf, 6);
    expect(hi).toBeCloseTo(plainHalf, 6);
    const xs = band.map((v) => v.x);
    expect(Math.min(...xs)).toBeCloseTo(0, 6);
    expect(Math.max(...xs)).toBeCloseTo(2, 6);
  });

  it("widens with a wedge to its broad end, the margin past it all the way", () => {
    const broad = 0.2;
    const band = squareBand(p, q, { left1: line, right1: line, left2: broad, right2: broad }, margin);
    expect(acrossAt(band, 0)[1]).toBeCloseTo(plainHalf, 6);
    const [lo, hi] = acrossAt(band, 2);
    expect(hi).toBeCloseTo(broad + margin, 6);
    expect(lo).toBeCloseTo(-(broad + margin), 6);
  });

  it("takes in a double bond's second line on its side only", () => {
    const second = 0.3;
    const reach = { left1: line + second, right1: line, left2: line + second, right2: line };
    const [lo, hi] = acrossAt(squareBand(p, q, reach, margin), 1);
    expect(hi).toBeCloseTo(second + line + margin, 6);
    expect(lo).toBeCloseTo(-(line + margin), 6);
  });

  it("knows a bond's left from the way it runs", () => {
    // the same bond the other way round: its left is now -y
    const reach = { left1: 0.5, right1: line, left2: 0.5, right2: line };
    const band = squareBand(q, p, reach, margin);
    expect(area2(band)).toBeGreaterThan(0);
    const [lo, hi] = acrossAt(band, 1);
    expect(lo).toBeCloseTo(-(0.5 + margin), 6);
    expect(hi).toBeCloseTo(line + margin, 6);
  });
});
