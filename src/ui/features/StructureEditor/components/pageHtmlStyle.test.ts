import { describe, expect, it } from "vitest";
import { pageHtmlStyle } from "./pageHtmlStyle";

describe("HTML on the page", () => {
  it("takes the pointer, laid flat on the screen, though the layer it goes in passes it through", () => {
    expect(pageHtmlStyle({})).toEqual({ pointerEvents: "auto" });
    expect(pageHtmlStyle({ style: { zIndex: 30 } })).toEqual({ pointerEvents: "auto", zIndex: 30 });
  });

  it("passes it through where it says so - and, turned with the page, leaves it to drei's own pointerEvents", () => {
    expect(pageHtmlStyle({ style: { pointerEvents: "none" } })).toEqual({ pointerEvents: "none" });
    expect(pageHtmlStyle({ transform: true })).toBeUndefined();
    expect(pageHtmlStyle({ transform: true, style: { color: "red" } })).toEqual({ color: "red" });
  });
});
