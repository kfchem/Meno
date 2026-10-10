import { describe, expect, it } from "vitest";
import { cellAt, cellOf, cellsWithin, honeycombFrom, keyOf, nearestCell, neighboursOf } from "./honeycomb";

const L = 1.8;
const h = honeycombFrom({ x: 1, y: 2 }, [], L);

describe("the honeycomb a chain is traced on", () => {
  it("starts where the chain does", () => {
    const c = cellAt(h, 0, 0, false);
    expect([c.x, c.y]).toEqual([1, 2]);
    expect(c.key).toBe("0,0,A");
    expect(cellOf(h, "0,0,A")).toEqual(c);
  });

  it("has three bonds at every point, a bond long and 120 degrees apart, each to a point of the other kind", () => {
    for (const c of [cellAt(h, 0, 0, false), cellAt(h, 2, -1, true)]) {
      const ns = neighboursOf(h, c);
      expect(ns).toHaveLength(3);
      for (const o of ns) {
        expect(Math.hypot(o.x - c.x, o.y - c.y)).toBeCloseTo(L, 9);
        expect(o.b).toBe(!c.b);
        // and the bond goes back
        expect(neighboursOf(h, o).map((x) => x.key)).toContain(c.key);
      }
      const angles = ns.map((o) => Math.atan2(o.y - c.y, o.x - c.x)).sort((a, b) => a - b);
      expect(angles[1] - angles[0]).toBeCloseTo((2 * Math.PI) / 3, 9);
      expect(angles[2] - angles[1]).toBeCloseTo((2 * Math.PI) / 3, 9);
    }
  });

  it("with nothing bonded to the start, runs across at 30 degrees, as a drawing's chains do", () => {
    const [first] = neighboursOf(h, cellAt(h, 0, 0, false));
    expect(Math.atan2(first.y - 2, first.x - 1)).toBeCloseTo(Math.PI / 6, 9);
  });

  it("is turned so that a bond the start has already is one of its own", () => {
    const g = honeycombFrom({ x: 0, y: 0 }, [{ x: 0, y: L }], L);
    const ns = neighboursOf(g, cellAt(g, 0, 0, false));
    expect(ns.some((o) => Math.abs(o.x) < 1e-9 && Math.abs(o.y - L) < 1e-9)).toBe(true);
  });

  it("finds the point nearest a place", () => {
    const target = cellAt(h, 3, -2, true);
    expect(nearestCell(h, { x: target.x + 0.3, y: target.y - 0.2 }).key).toBe(target.key);
    expect(nearestCell(h, { x: 1.1, y: 2 }).key).toBe(keyOf(0, 0, false));
  });

  it("gives the points about a place and the bonds among them", () => {
    const { cells, edges } = cellsWithin(h, { x: 1, y: 2 }, 1.01 * L);
    // the start and its three neighbours
    expect(cells).toHaveLength(4);
    expect(edges).toHaveLength(3);
  });
});
