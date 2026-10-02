import { describe, expect, it } from "vitest";
import { namesLaid } from "./names";

describe("namesLaid", () => {
  // OAc (0) under a carbon (1), its bond leaning 20 degrees; a carbon (2)
  // beside it on one side or the other
  const lean = (20 * Math.PI) / 180;
  const laid = (lr: 1 | -1, other: number | null) =>
    namesLaid(
      {
        x: [0, lr * Math.sin(lean), ...(other != null ? [other] : [])],
        y: [0, Math.cos(lean), ...(other != null ? [0] : [])],
        edges: [[0, 1]],
        elements: ["OAc", "C", ...(other != null ? ["C"] : [])],
      },
      1,
    ).get(0)!.left;

  it("reads a name outward from its bond: leftward from one coming in from the right", () => {
    expect(laid(1, null)).toBe(true);
    expect(laid(-1, null)).toBe(false);
  });

  it("reads one on a bond near upright the way with more room", () => {
    expect(laid(1, -0.9)).toBe(false);
    expect(laid(-1, 0.9)).toBe(true);
  });

  it("reads one on a bond further over outward, room or none", () => {
    const flat = namesLaid(
      { x: [0, 0.9, -0.9], y: [0, 0.45, 0], edges: [[0, 1]], elements: ["OAc", "C", "C"] },
      1,
    ).get(0)!.left;
    expect(flat).toBe(true);
  });
});
