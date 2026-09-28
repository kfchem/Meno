import { describe, expect, it } from "vitest";
import { looksLikeFingers, wheelReader, type WheelLike } from "./wheel";

const ev = (over: Partial<WheelLike>): WheelLike => ({
  deltaX: 0,
  deltaY: 0,
  deltaMode: 0,
  ctrlKey: false,
  timeStamp: 0,
  ...over,
});

describe("looksLikeFingers", () => {
  it("reads a mouse wheel's notch as a wheel", () => {
    expect(looksLikeFingers(ev({ deltaY: 120 }))).toBe(false); // WebKit, macOS
    expect(looksLikeFingers(ev({ deltaY: -100 }))).toBe(false); // Chromium, Windows
    expect(looksLikeFingers(ev({ deltaY: 3, deltaMode: 1 }))).toBe(false); // lines
  });

  it("reads a smoothly scrolling mouse's notch as a wheel, and a trackpad's start as fingers", () => {
    // measured on macOS (WebKit): a Logitech MX Master 3S, a notch and a spin
    expect(looksLikeFingers(ev({ deltaY: -13 }))).toBe(false);
    expect(looksLikeFingers(ev({ deltaY: -101 }))).toBe(false);
    // a trackpad, slowly and flicked: it begins small whichever
    expect(looksLikeFingers(ev({ deltaY: -1 }))).toBe(true);
    expect(looksLikeFingers(ev({ deltaY: 1 }))).toBe(true);
    expect(looksLikeFingers(ev({ deltaY: 2 }))).toBe(true);
  });

  it("reads small, sideways or fractional steps as fingers", () => {
    expect(looksLikeFingers(ev({ deltaY: 7, deltaX: -2 }))).toBe(true);
    expect(looksLikeFingers(ev({ deltaY: 5 }))).toBe(true);
    expect(looksLikeFingers(ev({ deltaY: 42.5 }))).toBe(true);
    // Shift turns a wheel sideways on Windows: still a wheel
    expect(looksLikeFingers(ev({ deltaX: 100, shiftKey: true }))).toBe(false);
  });
});

describe("wheelReader", () => {
  it("zooms on a pinch, which comes with Ctrl", () => {
    const read = wheelReader();
    expect(read(ev({ deltaY: 2, ctrlKey: true }))).toBe("zoom");
  });

  it("keeps a run's first answer to its end", () => {
    const read = wheelReader();
    // fingers: a small first step, then a large one mid-stroke
    expect(read(ev({ deltaY: 4, timeStamp: 0 }))).toBe("pan");
    expect(read(ev({ deltaY: 120, timeStamp: 16 }))).toBe("pan");
    // a pause, then a wheel's notch: a new run
    expect(read(ev({ deltaY: 120, timeStamp: 600 }))).toBe("zoom");
    expect(read(ev({ deltaY: 4, timeStamp: 650 }))).toBe("zoom");
  });
});
