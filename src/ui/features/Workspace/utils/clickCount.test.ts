import { describe, expect, it } from "vitest";
import { clickClock, doubleClickedSince, noteClick, pressOnEmpty } from "./clickCount";

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

describe("presses on empty space", () => {
  it("count a second soon after a first, near it, as a double-click's", () => {
    const first = { t: 0, x: 100, y: 100, count: 1 };
    expect(pressOnEmpty(null, { t: 0, x: 0, y: 0 }, 500)).toBe(1);
    expect(pressOnEmpty(first, { t: 300, x: 103, y: 102 }, 500)).toBe(2);
    // (too late, or too far)
    expect(pressOnEmpty(first, { t: 600, x: 100, y: 100 }, 500)).toBe(1);
    expect(pressOnEmpty(first, { t: 300, x: 120, y: 100 }, 500)).toBe(1);
  });

  it("count a third as a first: three ask for nothing two did not", () => {
    expect(pressOnEmpty({ t: 0, x: 100, y: 100, count: 2 }, { t: 200, x: 100, y: 100 }, 500)).toBe(1);
  });
});
