import { describe, expect, it } from "vitest";
import { snapBond } from "./extendSnap";

const deg = (a: number) => ((((a * 180) / Math.PI) % 360) + 360) % 360;

describe("snapBond", () => {
  it("holds a bond from a bare atom to the 30-degree grid", () => {
    const b = snapBond({ x: 0, y: 0 }, [], { x: 10, y: 3 }, 1);
    expect(deg(b.angle)).toBeCloseTo(30, 6); // 16.7°: nearer 30 than 0
    expect(b.trigonalTo).toBeUndefined();
  });

  it("takes 120 degrees to a bond already there when the pointer is near it", () => {
    // a bond to the left (180°); 120° from it is 60° or 300°
    const tip = { x: 0, y: 0 };
    const left = [{ x: -1, y: 0 }];
    const b = snapBond(tip, left, { x: Math.cos(1.2), y: Math.sin(1.2) }, 1); // ~69°
    expect(deg(b.angle)).toBeCloseTo(60, 6);
    expect(deg(b.trigonalTo!)).toBeCloseTo(180, 6);
    expect(b.end.x).toBeCloseTo(0.5, 6);
  });

  it("does it off the grid too, for a bond that is not on it", () => {
    // a bond at 10°: 120° from it is 130°, which is no grid angle
    const n = [{ x: Math.cos((10 * Math.PI) / 180), y: Math.sin((10 * Math.PI) / 180) }];
    const b = snapBond({ x: 0, y: 0 }, n, { x: -1, y: 1.1 }, 1); // ~132°
    expect(deg(b.angle)).toBeCloseTo(130, 6);
  });

  it("falls back to the grid away from 120 degrees", () => {
    const b = snapBond({ x: 0, y: 0 }, [{ x: -1, y: 0 }], { x: 1, y: 0.05 }, 1);
    expect(deg(b.angle)).toBeCloseTo(0, 6); // straight on: an alkyne, say
    expect(b.trigonalTo).toBeUndefined();
  });

  it("does not point 120 degrees onto another bond", () => {
    // bonds at 0° and 120°: from 0°, +120° is the other bond, so 240° only
    const n = [
      { x: 1, y: 0 },
      { x: Math.cos((2 * Math.PI) / 3), y: Math.sin((2 * Math.PI) / 3) },
    ];
    const b = snapBond({ x: 0, y: 0 }, n, { x: -0.5, y: -0.9 }, 1); // ~241°
    expect(deg(b.angle)).toBeCloseTo(240, 6);
  });
});

describe("keeping bonds apart", () => {
  it("does not point a bond along, or 30 degrees from, one already there", () => {
    // a bond at 210°; the pointer at 185° would be 180° on the grid, 30° off it
    const n = [{ x: Math.cos((210 * Math.PI) / 180), y: Math.sin((210 * Math.PI) / 180) }];
    const p = { x: Math.cos((185 * Math.PI) / 180), y: Math.sin((185 * Math.PI) / 180) };
    expect(deg(snapBond({ x: 0, y: 0 }, n, p, 1).angle)).toBeCloseTo(150, 6);
  });
});

