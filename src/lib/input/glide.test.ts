import { describe, expect, it } from "vitest";
import { glideSpeed, recentMoves } from "./glide";

describe("a motion let go", () => {
  it("goes on as fast as its latest moves went", () => {
    // 0.1 every 16 ms: about 6 a second
    const moves = [0, 16, 32, 48, 64].map((t) => ({ t, d: 0.1 }));
    expect(glideSpeed(moves, 70, 80)).toBeCloseTo(0.4 / 0.064, 6);
  });

  it("stops where it was held still before it was let go, or moved once", () => {
    const moves = [0, 16, 32].map((t) => ({ t, d: 0.1 }));
    expect(glideSpeed(moves, 200, 80)).toBe(0);
    expect(glideSpeed([{ t: 0, d: 1 }], 1, 80)).toBe(0);
  });

  it("counts only its latest moves", () => {
    const moves = [0, 50, 100, 116].map((t) => ({ t, d: 1 }));
    expect(recentMoves(moves, 120, 64).map((m) => m.t)).toEqual([100, 116]);
  });
});
