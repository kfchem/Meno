import { describe, expect, it } from "vitest";
import { layoutMetrics, ringIrregularity } from "./metrics";

/** A regular polygon's atoms and bonds, bond length 1. */
function polygon(k: number, cx = 0, cy = 0, turn = 0) {
  const r = 1 / (2 * Math.sin(Math.PI / k));
  const x = Array.from({ length: k }, (_, i) => cx + r * Math.cos(turn + (i * 2 * Math.PI) / k));
  const y = Array.from({ length: k }, (_, i) => cy + r * Math.sin(turn + (i * 2 * Math.PI) / k));
  const edges = Array.from({ length: k }, (_, i) => [i, (i + 1) % k] as [number, number]);
  return { x, y, edges };
}

describe("layoutMetrics", () => {
  it("finds nothing wrong with a regular hexagon", () => {
    const m = layoutMetrics(polygon(6));
    expect(m.bondSpread).toBeCloseTo(0, 9);
    expect(m.ringError).toBeCloseTo(0, 9);
    expect(m.overlaps + m.crossings + m.clashes).toBe(0);
  });

  it("measures a squashed ring, and bonds that vary", () => {
    const h = polygon(6);
    const squashed = { ...h, y: h.y.map((v) => v * 0.6) };
    const m = layoutMetrics(squashed);
    expect(m.ringError).toBeGreaterThan(0.1);
    expect(m.bondSpread).toBeGreaterThan(0.05);
  });

  it("counts atoms on top of each other, and crossing bonds", () => {
    // two bonds crossing in an X, and a fifth atom right by the first
    const m = layoutMetrics({
      x: [0, 1, 0, 1, 0.05],
      y: [0, 1, 1, 0, 0.02],
      edges: [[0, 1], [2, 3]],
    });
    expect(m.crossings).toBe(1);
    expect(m.overlaps).toBeGreaterThanOrEqual(1);
  });

  it("takes a zigzag chain's angles as right, and a straight one's as wrong", () => {
    const h = Math.sqrt(3) / 2;
    const zig = {
      x: [0, h, 2 * h, 3 * h],
      y: [0, 0.5, 0, 0.5],
      edges: [[0, 1], [1, 2], [2, 3]] as [number, number][],
    };
    expect(layoutMetrics(zig).angleError).toBeCloseTo(0, 6);
    const straight = { ...zig, y: [0, 0, 0, 0] };
    expect(layoutMetrics(straight).angleError).toBeCloseTo(60, 6);
    // unless it is a triple bond, which is straight
    expect(layoutMetrics({ ...straight, orders: [1, 3, 1] }).angleError).toBeCloseTo(0, 6);
  });

  it("sees a ring's shape whatever it is turned to", () => {
    const h = polygon(6, 3, 4, 0.7);
    expect(ringIrregularity(h.x, h.y, [0, 1, 2, 3, 4, 5], 1)).toBeCloseTo(0, 9);
    expect(ringIrregularity(h.x, h.y, [5, 4, 3, 2, 1, 0], 1)).toBeCloseTo(0, 9);
  });
});

describe("what a chemist sees in a macrocycle, wedges and labels", () => {
  it("takes a zigzag macrocycle as right and a round one as wrong", () => {
    const round = polygon(14);
    expect(layoutMetrics(round).macroAngleError).toBeGreaterThan(30);
    // naphthalene's outline as a ten-membered ring: every angle 120° or 240°
    const h = Math.sqrt(3) / 2;
    const x = [0, -h, -h, 0, h, 2 * h, 3 * h, 3 * h, 2 * h, h];
    const y = [1, 0.5, -0.5, -1, -0.5, -1, -0.5, 0.5, 1, 0.5];
    const edges = x.map((_, i) => [i, (i + 1) % x.length] as [number, number]);
    expect(layoutMetrics({ x, y, edges }).macroAngleError).toBeCloseTo(0, 6);
  });

  it("counts wedges on ring bonds, and labels that crowd", () => {
    const h = polygon(6);
    // a seventh atom off the ring, its bond wedged; one on the ring too
    const x = [...h.x, h.x[0] + 1];
    const y = [...h.y, h.y[0]];
    const edges = [...h.edges, [0, 6] as [number, number]];
    const m = layoutMetrics({ x, y, edges, wedged: [0, 6] });
    expect(m.ringWedges).toBe(1);
    const labels = layoutMetrics({
      x: [0, 0.6],
      y: [0, 0],
      edges: [],
      labelled: [true, true],
    });
    expect(labels.crowdedLabels).toBe(1);
  });
});
