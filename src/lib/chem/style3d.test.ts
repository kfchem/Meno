import { describe, expect, it } from "vitest";
import { STYLE_3D, atomColour, atomRadius } from "./style3d";

describe("the 3D style", () => {
  it("draws balls a fifth of the van der Waals radius, as the 3D viewer did", () => {
    expect(atomRadius("C", STYLE_3D)).toBeCloseTo(0.34, 9);
    expect(atomRadius("H", STYLE_3D)).toBeCloseTo(0.22, 9);
    expect(atomRadius("C", { ...STYLE_3D, atoms: "space" })).toBeCloseTo(1.7, 9);
  });
  it("colours atoms by element, an unknown one grey", () => {
    expect(atomColour("O")).toBe("#FF0D0D");
    expect(atomColour("Xx")).toBe("#cccccc");
  });
});
