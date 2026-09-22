import { describe, expect, it } from "vitest";
import { undoIntent } from "./shortcuts";

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
