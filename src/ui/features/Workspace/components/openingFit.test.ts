import { describe, expect, it } from "vitest";
import { opensWith } from "./openingFit";

describe("the fit a canvas opens with", () => {
  const at = (o: Partial<Parameters<typeof opensWith>[0]>) => opensWith({ firstView: false, firstContent: false, asked: false, fittedBefore: false, ...o });

  it("is the fit of what it holds as its view comes up - a file read before the view was there", () => {
    expect(at({ firstView: true, firstContent: true })).toBe(true);
  });

  it("is the fit of the first thing it is given, asked for after the view came up empty - a file read in Meno's worker", () => {
    expect(at({ firstContent: true, asked: true })).toBe(true);
  });

  it("is no other: not one asked for after something was drawn there, nor after a fit", () => {
    // (drawn first, then Fit: a fit that fits whole)
    expect(at({ firstContent: false, asked: true })).toBe(false);
    expect(at({ firstContent: true, asked: true, fittedBefore: true })).toBe(false);
    // (the first bond drawn on an empty canvas asks for none)
    expect(at({ firstContent: true, asked: false })).toBe(false);
  });
});
