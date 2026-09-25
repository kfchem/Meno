import { describe, expect, it } from "vitest";
import {
  ACS_1996,
  bondFraction,
  inPoints,
  layoutOptionsFor,
  ofBond,
  pt,
  resolveStyle,
} from "./style";

describe("drawing style", () => {
  it("is ACS 1996 by default, to the letter", () => {
    expect(ACS_1996.bondLengthPt).toBe(14.4);
    expect(ACS_1996.lineWidth).toEqual(pt(0.6));
    expect(ACS_1996.boldWidth).toEqual(pt(2.0));
    expect(ACS_1996.bondSpacing).toEqual(ofBond(0.18));
    expect(ACS_1996.hashSpacing).toEqual(pt(2.5));
    expect(ACS_1996.fontSize).toEqual(pt(10));
    expect(ACS_1996.ends).toBe("round");
  });

  it("takes a length in points or as a fraction of the bond, alike", () => {
    // 0.6 pt of a 14.4 pt bond is the same line as 1/24 of the bond
    expect(bondFraction(pt(0.6), ACS_1996)).toBeCloseTo(1 / 24, 12);
    expect(bondFraction(ofBond(1 / 24), ACS_1996)).toBeCloseTo(1 / 24, 12);
    expect(inPoints(ofBond(0.18), ACS_1996)).toBeCloseTo(2.592, 12);
    expect(inPoints(pt(2.5), ACS_1996)).toBe(2.5);
  });

  it("keeps a length in points fixed when the bond length changes, and a fraction in step", () => {
    const longer = resolveStyle(ACS_1996, { bondLengthPt: 28.8 });
    expect(inPoints(longer.lineWidth, longer)).toBe(0.6);
    expect(bondFraction(longer.lineWidth, longer)).toBeCloseTo(1 / 48, 12);
    expect(inPoints(longer.bondSpacing, longer)).toBeCloseTo(5.184, 12);
  });

  it("lays styles over one another, the last on top, skipping what a layer leaves unset", () => {
    const doc = { lineWidth: pt(1) };
    const bond = { lineWidth: undefined, ends: "square" as const };
    const s = resolveStyle(ACS_1996, doc, undefined, bond);
    expect(s.lineWidth).toEqual(pt(1));
    expect(s.ends).toBe("square");
    expect(s.boldWidth).toEqual(ACS_1996.boldWidth);
  });

  it("draws with the style's sizes, at the bond length it is given", () => {
    const L = 1.8;
    const o = layoutOptionsFor(ACS_1996, L);
    expect(o.lineWidthPx).toBeCloseTo((0.6 / 14.4) * L, 12);
    expect(o.wedgeWidthPx).toBeCloseTo((2.0 / 14.4) * L, 12);
    expect(o.doubleOffsetPx).toBeCloseTo(0.18 * L, 12);
    // a triple bond's outer lines are one bond spacing out, like a double's
    expect(o.tripleOffsetPx).toBe(o.doubleOffsetPx);
    expect(o.fontPx).toBeCloseTo((10 / 14.4) * L, 12);
    expect(o.joinStyle).toBe("round");
    expect(layoutOptionsFor({ ...ACS_1996, ends: "square" }, L).joinStyle).toBe("sharp");
    // as many hashes as 2.5 pt spacing fits along a 14.4 pt bond
    expect(o.hashCount).toBe(7);
  });
});
