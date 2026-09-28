import { describe, expect, it } from "vitest";
import { clickClock, doubleClickedSince, noteClick } from "./clickCount";

describe("clickCount", () => {
  it("tells a double-click's second click that came after a moment", () => {
    const since = clickClock();
    noteClick(1);
    expect(doubleClickedSince(since)).toBe(false);
    noteClick(2);
    expect(doubleClickedSince(since)).toBe(true);
  });

  it("does not count a double-click from before the moment", () => {
    noteClick(2);
    const since = clickClock() + 1;
    expect(doubleClickedSince(since)).toBe(false);
  });
});
