import { describe, expect, it } from "vitest";
import { labelKey, typedLabel } from "./labelTyping";

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
