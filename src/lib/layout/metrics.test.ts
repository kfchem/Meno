import { describe, expect, it } from "vitest";
import { layoutMetrics, ringIrregularity, scoreParts } from "./metrics";

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

/** Turns a drawing through `deg` degrees about the origin. */
function turned<T extends { x: number[]; y: number[] }>(g: T, deg: number): T {
  const t = (deg * Math.PI) / 180;
  return {
    ...g,
    x: g.x.map((v, i) => v * Math.cos(t) - g.y[i] * Math.sin(t)),
    y: g.x.map((v, i) => v * Math.sin(t) + g.y[i] * Math.cos(t)),
  };
}

/** A zigzag of `k` bonds, bond length 1, running level to the right. */
function zigzag(k: number) {
  const h = Math.sqrt(3) / 2;
  const x = Array.from({ length: k + 1 }, (_, i) => i * h);
  const y = Array.from({ length: k + 1 }, (_, i) => (i % 2 ? 0.5 : 0));
  const edges = Array.from({ length: k }, (_, i) => [i, i + 1] as [number, number]);
  return { x, y, edges };
}

describe("how a drawing sits", () => {
  it("measures how far it is turned off the lattice", () => {
    // pointed at the top, two sides upright: square
    const h = polygon(6, 0, 0, Math.PI / 2);
    expect(layoutMetrics(h).tilt).toBeCloseTo(0, 6);
    expect(layoutMetrics(turned(h, 10)).tilt).toBeCloseTo(10, 1);
    // turned a whole step of the lattice, it is square again
    expect(layoutMetrics(turned(h, 30)).tilt).toBeCloseTo(0, 1);
  });

  it("takes the largest ring system as the frame, and a ring hung off it askew as askew", () => {
    // naphthalene, square, with a benzene ring hung off it turned 13 degrees
    const s3 = Math.sqrt(3) / 2;
    const nx = [0, s3, s3, 0, -s3, -s3, 2 * s3, 2 * s3, 3 * s3, 3 * s3];
    const ny = [1, 0.5, -0.5, -1, -0.5, 0.5, 1, -1, 0.5, -0.5];
    const nEdges: [number, number][] = [
      [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0],
      [1, 6], [6, 8], [8, 9], [9, 7], [7, 2],
    ];
    const ring = turned(polygon(6, 0, 0, Math.PI / 2), 13);
    // hung from atom 0 of naphthalene, straight up, by one bond
    const top = ring.y.indexOf(Math.min(...ring.y));
    const dx = -ring.x[top];
    const dy = 2 - ring.y[top];
    const x = [...nx, ...ring.x.map((v) => v + dx)];
    const y = [...ny, ...ring.y.map((v) => v + dy)];
    const edges = [
      ...nEdges,
      ...ring.edges.map(([a, b]) => [a + 10, b + 10] as [number, number]),
      [0, 10 + top] as [number, number],
    ];
    const m = layoutMetrics({ x, y, edges });
    expect(m.tilt).toBeCloseTo(0, 6);
    expect(m.gridError).toBeGreaterThan(3);
  });

  it("takes a chain running level as right, and one running up the page as wrong", () => {
    const z = zigzag(8);
    expect(layoutMetrics(z).chainTilt).toBeCloseTo(0, 6);
    // turned a lattice step, still on the lattice, but running up at 60 degrees
    const up = turned(z, 60);
    expect(layoutMetrics(up).tilt).toBeCloseTo(0, 1);
    expect(layoutMetrics(up).chainTilt).toBeCloseTo(60, 1);
  });

  it("lets a short chain hung on a ring run straight out from it", () => {
    // a propyl group on the top of an upright hexagon, running up
    const h = polygon(6, 0, 0, Math.PI / 2);
    const s3 = Math.sqrt(3) / 2;
    const top = h.y.indexOf(Math.max(...h.y));
    const x = [...h.x, 0, s3, s3];
    const y = [...h.y, 2, 2.5, 3.5];
    const edges = [...h.edges, [top, 6], [6, 7], [7, 8]] as [number, number][];
    expect(layoutMetrics({ x, y, edges }).chainTilt).toBeCloseTo(0, 6);
  });

  it("reads an acid at the end of a chain on the right, and leaves one on a ring alone", () => {
    // a zigzag with a carboxylic acid on its left end
    const z = zigzag(6);
    const elements = z.x.map(() => "C");
    const x = [...z.x, -Math.sqrt(3) / 2, 0];
    const y = [...z.y, 0.5, -1];
    const edges = [...z.edges, [0, 7], [0, 8]] as [number, number][];
    const orders = [...z.edges.map(() => 1), 1, 2];
    const acid = {
      x,
      y,
      edges,
      orders,
      elements: [...elements, "O", "O"],
      hydrogens: [...elements.map(() => 2), 1, 0],
    };
    expect(layoutMetrics(acid).readingOrder).toBe(1);
    // turned round, the acid is on the right
    expect(layoutMetrics(turned(acid, 180)).readingOrder).toBe(0);
  });

  it("adds up its parts to the score", () => {
    const m = layoutMetrics(turned(zigzag(8), 20));
    const sum = Object.values(scoreParts(m)).reduce((a, b) => a + b, 0);
    expect(m.score).toBeCloseTo(sum, 9);
    expect(m.score).toBeGreaterThan(0);
  });
});
