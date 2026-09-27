import { describe, expect, it } from "vitest";
import { smallestRings } from "./rings";

describe("smallestRings", () => {
  it("finds naphthalene's two rings, not the ten-membered one round both", () => {
    // two hexagons sharing the bond 0-5
    const edges: [number, number][] = [
      [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0],
      [5, 6], [6, 7], [7, 8], [8, 9], [9, 0],
    ];
    const rings = smallestRings(10, edges);
    expect(rings.map((r) => r.length).sort()).toEqual([6, 6]);
  });

  it("finds five of cubane's six faces, as many as it has independent rings", () => {
    const edges: [number, number][] = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];
    const rings = smallestRings(8, edges);
    expect(rings).toHaveLength(5);
    expect(rings.every((r) => r.length === 4)).toBe(true);
  });

  it("has none for a chain", () => {
    expect(smallestRings(3, [[0, 1], [1, 2]])).toEqual([]);
  });
});
