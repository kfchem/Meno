import { describe, expect, it } from "vitest";
import { chargeStep, isCleanUpKey, isDeleteKey, saveIntent, undoIntent } from "./shortcuts";

const key = (over: Partial<Parameters<typeof undoIntent>[0]> = {}) => ({
  key: "z",
  ctrlKey: true,
  ...over,
});

describe("undoIntent", () => {
  it("maps the usual combinations", () => {
    expect(undoIntent(key())).toBe("undo");
    expect(undoIntent(key({ shiftKey: true }))).toBe("redo");
    expect(undoIntent(key({ key: "y" }))).toBe("redo");
    expect(undoIntent(key({ key: "Z" }))).toBe("undo");
    expect(undoIntent(key({ ctrlKey: false, metaKey: true }))).toBe("undo");
  });

  it("ignores keys without the modifier, and other keys", () => {
    expect(undoIntent(key({ ctrlKey: false }))).toBeNull();
    expect(undoIntent(key({ key: "a" }))).toBeNull();
    expect(undoIntent(key({ key: "y", shiftKey: true }))).toBeNull();
  });

  it("leaves single-line inputs and rich-text hosts to the browser", () => {
    expect(undoIntent(key({ target: { tagName: "INPUT" } }))).toBeNull();
    expect(undoIntent(key({ target: { tagName: "SELECT" } }))).toBeNull();
    expect(undoIntent(key({ target: { isContentEditable: true } }))).toBeNull();
  });

  it("claims the text view's textarea, which a document backs", () => {
    expect(undoIntent(key({ target: { tagName: "TEXTAREA" } }))).toBe("undo");
    expect(undoIntent(key({ target: null }))).toBe("undo");
  });
});

describe("saveIntent", () => {
  it("saves on Ctrl/Cmd+S and saves as with Shift", () => {
    expect(saveIntent({ key: "s", ctrlKey: true })).toBe("save");
    expect(saveIntent({ key: "S", metaKey: true })).toBe("save");
    expect(saveIntent({ key: "s", metaKey: true, shiftKey: true })).toBe("saveAs");
  });

  it("leaves other keys and a bare S alone", () => {
    expect(saveIntent({ key: "s" })).toBeNull();
    expect(saveIntent({ key: "a", ctrlKey: true })).toBeNull();
  });
});

describe("isCleanUpKey", () => {
  it("is Ctrl/Cmd+Shift+K, outside text fields", () => {
    expect(isCleanUpKey({ key: "k", metaKey: true, shiftKey: true })).toBe(true);
    expect(isCleanUpKey({ key: "K", ctrlKey: true, shiftKey: true })).toBe(true);
    expect(isCleanUpKey({ key: "k", metaKey: true })).toBe(false);
    expect(isCleanUpKey({ key: "K", shiftKey: true })).toBe(false);
    expect(
      isCleanUpKey({
        key: "k",
        metaKey: true,
        shiftKey: true,
        target: { tagName: "INPUT" },
      }),
    ).toBe(false);
  });
});

describe("isDeleteKey", () => {
  it("is Delete or Backspace on its own, outside text fields", () => {
    expect(isDeleteKey({ key: "Delete" })).toBe(true);
    expect(isDeleteKey({ key: "Backspace" })).toBe(true);
    expect(isDeleteKey({ key: "Backspace", metaKey: true })).toBe(false);
    expect(isDeleteKey({ key: "d" })).toBe(false);
    expect(
      isDeleteKey({ key: "Backspace", target: { tagName: "TEXTAREA" } }),
    ).toBe(false);
  });
});

describe("chargeStep", () => {
  it("is + or - on its own, outside text fields", () => {
    expect(chargeStep({ key: "+" })).toBe(1);
    expect(chargeStep({ key: "+", shiftKey: true })).toBe(1);
    expect(chargeStep({ key: "-" })).toBe(-1);
    expect(chargeStep({ key: "=" })).toBe(0);
    // Ctrl or Cmd with them zoom
    expect(chargeStep({ key: "+", metaKey: true })).toBe(0);
    expect(chargeStep({ key: "-", ctrlKey: true })).toBe(0);
    expect(chargeStep({ key: "-", target: { tagName: "INPUT" } })).toBe(0);
  });
});
