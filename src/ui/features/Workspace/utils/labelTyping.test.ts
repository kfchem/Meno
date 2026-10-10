import { describe, expect, it } from "vitest";
import { labelKey, labelTextOf, readLabel, typedLabel } from "./labelTyping";

describe("labelKey", () => {
  it("starts a label with the letter typed", () => {
    expect(labelKey({ key: "a", code: "KeyA", keyCode: 65 })).toBe("a");
    expect(labelKey({ key: "N", code: "KeyN", keyCode: 78 })).toBe("N");
  });

  it("takes the key pressed, not the input method's, with Japanese input on", () => {
    // WebKit gives an input method's key as "Process" (or the kana) and 229
    expect(labelKey({ key: "Process", code: "KeyA", keyCode: 229 })).toBe("a");
    expect(labelKey({ key: "あ", code: "KeyA", keyCode: 229, isComposing: true })).toBe("a");
  });

  it("starts nothing for other keys", () => {
    expect(labelKey({ key: "1", code: "Digit1", keyCode: 49 })).toBeNull();
    expect(labelKey({ key: "Enter", code: "Enter", keyCode: 13 })).toBeNull();
    expect(labelKey({ key: "Process", code: "Digit1", keyCode: 229 })).toBeNull();
  });
});

describe("typedLabel", () => {
  it("capitalises the first letter where it is to be", () => {
    expect(typedLabel("cl", true)).toBe("Cl");
    expect(typedLabel("cl", false)).toBe("cl");
    expect(typedLabel("", true)).toBe("");
  });

  it("reads full-width letters as the ordinary ones", () => {
    expect(typedLabel("ｃｏｏｈ", true)).toBe("Cooh");
    expect(typedLabel("ＯＭｅ", true)).toBe("OMe");
  });
});

describe("readLabel", () => {
  const isElement = (s: string) => ["C", "N", "O", "Fe", "Na", "Cl", "S"].includes(s);
  it("reads an element with its charge, H and mass number", () => {
    expect(readLabel("N+", isElement)).toEqual({ kind: "element", el: "N", charge: 1 });
    expect(readLabel("O-", isElement)).toEqual({ kind: "element", el: "O", charge: -1 });
    expect(readLabel("NH3+", isElement)).toEqual({ kind: "element", el: "N", charge: 1 });
    expect(readLabel("Fe2+", isElement)).toEqual({ kind: "element", el: "Fe", charge: 2 });
    expect(readLabel("Fe+2", isElement)).toEqual({ kind: "element", el: "Fe", charge: 2 });
    expect(readLabel("N++", isElement)).toEqual({ kind: "element", el: "N", charge: 2 });
    expect(readLabel("O−", isElement)).toEqual({ kind: "element", el: "O", charge: -1 });
    expect(readLabel("13C", isElement)).toEqual({ kind: "element", el: "C", charge: 0, isotope: 13 });
    expect(readLabel("OH", isElement)).toEqual({ kind: "element", el: "O", charge: 0 });
  });

  it("reads a charge alone as one for the atom as it is", () => {
    expect(readLabel("+", isElement)).toEqual({ kind: "charge", charge: 1 });
    expect(readLabel("2-", isElement)).toEqual({ kind: "charge", charge: -2 });
  });

  it("keeps anything else as a label, as typed", () => {
    expect(readLabel("OMe", isElement)).toEqual({ kind: "text", el: "OMe" });
    expect(readLabel("CO2H", isElement)).toEqual({ kind: "text", el: "CO2H" });
    expect(readLabel("Me", isElement)).toEqual({ kind: "text", el: "Me" });
  });
});

describe("labelTextOf", () => {
  it("types an atom's label back as readLabel reads it", () => {
    expect(labelTextOf({ el: "N", charge: 1 })).toBe("N+");
    expect(labelTextOf({ el: "Fe", charge: 2 })).toBe("Fe2+");
    expect(labelTextOf({ el: "O", charge: -1 })).toBe("O-");
    expect(labelTextOf({ el: "C", isotope: 13 })).toBe("13C");
    expect(labelTextOf({ el: "C", charge: 1 })).toBe("C+");
    expect(labelTextOf({ el: "C" })).toBe("");
    expect(labelTextOf({ el: "O" })).toBe("O");
  });
});
