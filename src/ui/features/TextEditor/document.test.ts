import { describe, expect, it } from "vitest";
import { createTextDocument, textToTabData } from "./document";

describe("text document", () => {
  it("opens with the tab's text", () => {
    expect(createTextDocument({ text: "hello" }).getState()).toBe("hello");
  });

  it("falls back to empty text for a new or malformed tab", () => {
    expect(createTextDocument(undefined).getState()).toBe("");
    expect(createTextDocument({}).getState()).toBe("");
    expect(createTextDocument({ text: 42 }).getState()).toBe("");
  });

  it("starts clean and becomes dirty on the first edit", () => {
    const doc = createTextDocument({ text: "a" });
    expect(doc.history().dirty).toBe(false);
    doc.edit("type", () => "ab", { coalesceKey: "type" });
    expect(doc.history()).toMatchObject({ dirty: true, undoDepth: 1 });
    doc.undo();
    expect(doc.getState()).toBe("a");
    expect(doc.history().dirty).toBe(false);
  });

  it("mirrors the document into tab data", () => {
    expect(textToTabData("hello")).toEqual({ text: "hello" });
  });
});
