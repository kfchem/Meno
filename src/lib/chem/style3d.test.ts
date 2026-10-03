import { describe, expect, it } from "vitest";
import {
  acceptStyle3dChoice,
  atomColour,
  atomRadius,
  DEFAULT_STYLE_3D_CHOICE,
  preset3dById,
  STYLE_3D,
  STYLE_3D_FIELDS,
  STYLE_3D_PRESETS,
  style3dOf,
  with3dSetting,
} from "./style3d";

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

describe("a 3D look as chosen", () => {
  it("is its preset, with what was changed laid over it", () => {
    const style = style3dOf({ preset: "glossy", changes: { bondRadius: 0.2 } });
    expect(style.roughness).toBe(preset3dById("glossy").style.roughness);
    expect(style.bondRadius).toBe(0.2);
    expect(style3dOf(DEFAULT_STYLE_3D_CHOICE)).toEqual(STYLE_3D);
  });

  it("no longer counts a setting as changed once it is set back to its preset's value", () => {
    const changed = with3dSetting(DEFAULT_STYLE_3D_CHOICE, "ballScale", 0.3);
    expect(changed.changes).toEqual({ ballScale: 0.3 });
    expect(with3dSetting(changed, "ballScale", STYLE_3D.ballScale).changes).toEqual({});
  });

  it("is read from the settings file as far as it reads, the rest left as its preset has it", () => {
    expect(acceptStyle3dChoice(undefined)).toEqual(DEFAULT_STYLE_3D_CHOICE);
    expect(acceptStyle3dChoice({ preset: "nonesuch", changes: { ballScale: 0.3 } })).toEqual(DEFAULT_STYLE_3D_CHOICE);
    expect(
      acceptStyle3dChoice({
        preset: "space",
        changes: { ballScale: 0.3, bondRadius: 9, bondColor: "#ABCDEF", atoms: "sticks", roughness: "matt", ballSegments: 3 },
      }),
    ).toEqual({ preset: "space", changes: { ballScale: 0.3, bondColor: "#abcdef" } });
  });

  it("has a field for every setting but how smooth the balls and sticks are", () => {
    const shown = new Set(STYLE_3D_FIELDS.map((f) => f.key));
    for (const key of Object.keys(STYLE_3D) as (keyof typeof STYLE_3D)[]) {
      expect(shown.has(key)).toBe(key !== "ballSegments" && key !== "bondSegments");
    }
    // and every preset within the fields' bounds
    for (const p of STYLE_3D_PRESETS) {
      expect(acceptStyle3dChoice({ preset: p.id, changes: p.style }).changes).toEqual(
        Object.fromEntries(Object.entries(p.style).filter(([k]) => shown.has(k as keyof typeof STYLE_3D)).map(([k, v]) => [k, typeof v === "string" ? v.toLowerCase() : v])),
      );
    }
  });
});
