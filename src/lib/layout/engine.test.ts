import { describe, expect, it } from "vitest";
import { layout2D } from "./engine";
import { macrocycleShape } from "./macrocycle";
import { layoutMetrics } from "./metrics";
import type { LayoutBond, LayoutInput } from "./perceive";

/** Carbons joined by the bonds given, as [a, b, order?]. */
function carbons(n: number, bonds: [number, number, number?][], extra: Partial<LayoutBond>[] = []): LayoutInput {
  return {
    atoms: Array.from({ length: n }, () => ({ el: "C" })),
    bonds: bonds.map(([a, b, order], i) => ({ a, b, order: order ?? 1, ...extra[i] })),
  };
}

const ring = (from: number, size: number): [number, number][] =>
  Array.from({ length: size }, (_, i) => [from + i, from + ((i + 1) % size)]);

const bondLengths = (input: LayoutInput) => {
  const { x, y } = layout2D(input);
  return input.bonds.map(({ a, b }) => Math.hypot(x[a] - x[b], y[a] - y[b]));
};

const measure = (input: LayoutInput) => {
  const { x, y } = layout2D(input);
  return layoutMetrics({
    x,
    y,
    edges: input.bonds.map(({ a, b }) => [a, b] as const),
    orders: input.bonds.map((b) => b.order),
  });
};

describe("layout2D", () => {
  it("draws benzene as a regular hexagon with two sides upright", () => {
    const benzene = carbons(6, ring(0, 6).map(([a, b], i) => [a, b, i % 2 ? 2 : 1]));
    for (const l of bondLengths(benzene)) expect(l).toBeCloseTo(1, 6);
    const { x } = layout2D(benzene);
    // an apex at the top and bottom, and two atoms on each upright side
    const xs = x.map((v) => (Math.abs(v) < 1e-9 ? 0 : v).toFixed(4));
    expect(new Set(xs).size).toBe(3);
    expect(measure(benzene).tilt).toBeCloseTo(0, 6);
  });

  it("draws a chain as a level zigzag", () => {
    const hexane = carbons(6, [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
    ]);
    const m = measure(hexane);
    expect(m.angleError).toBeCloseTo(0, 6);
    expect(m.chainTilt).toBeCloseTo(0, 6);
    expect(m.tilt).toBeCloseTo(0, 6);
  });

  it("draws a double bond cis or trans as it is", () => {
    for (const cis of [true, false]) {
      const butene = carbons(4, [[0, 1], [1, 2, 2], [2, 3]], [
        {},
        { stereo: { refs: [0, 3], cis } },
        {},
      ]);
      const { x, y } = layout2D(butene);
      const side = (i: number) =>
        Math.sign((x[2] - x[1]) * (y[i] - y[1]) - (y[2] - y[1]) * (x[i] - x[1]));
      expect(side(0) === side(3)).toBe(cis);
    }
  });

  it("fuses rings on a shared side", () => {
    const naphthalene = carbons(10, [...ring(0, 6), [1, 6], [6, 7], [7, 8], [8, 9], [9, 2]]);
    for (const l of bondLengths(naphthalene)) expect(l).toBeCloseTo(1, 6);
    const m = measure(naphthalene);
    expect(m.ringError).toBeCloseTo(0, 6);
    expect(m.overlaps + m.crossings).toBe(0);
  });

  it("points a substituent straight out of its ring", () => {
    const methylcyclohexane = carbons(7, [...ring(0, 6), [0, 6]]);
    const { x, y } = layout2D(methylcyclohexane);
    const cx = x.slice(0, 6).reduce((s, v) => s + v, 0) / 6;
    const cy = y.slice(0, 6).reduce((s, v) => s + v, 0) / 6;
    // on the line from the centre through its ring atom, a bond further out
    expect(Math.hypot(x[6] - cx, y[6] - cy)).toBeCloseTo(2, 6);
  });

  it("sets a steroid as it is always drawn: A and B in a row, C and D above to the right", () => {
    // gonane, C1 to C17 as atoms 0 to 16
    const c = (k: number) => k - 1;
    const bonds: [number, number][] = [
      [c(1), c(2)], [c(2), c(3)], [c(3), c(4)], [c(4), c(5)], [c(5), c(10)], [c(10), c(1)],
      [c(5), c(6)], [c(6), c(7)], [c(7), c(8)], [c(8), c(9)], [c(9), c(10)],
      [c(9), c(11)], [c(11), c(12)], [c(12), c(13)], [c(13), c(14)], [c(14), c(8)],
      [c(14), c(15)], [c(15), c(16)], [c(16), c(17)], [c(17), c(13)],
    ];
    const gonane = carbons(17, bonds);
    const m = measure(gonane);
    expect(m.ringOrder).toBe(0);
    const { x, y } = layout2D(gonane);
    // ring A (C1-C5, C10) lower left of ring D (C13-C17)
    const mid = (ks: number[]) => ({
      x: ks.reduce((s, k) => s + x[c(k)], 0) / ks.length,
      y: ks.reduce((s, k) => s + y[c(k)], 0) / ks.length,
    });
    const a = mid([1, 2, 3, 4, 5, 10]);
    const d = mid([13, 14, 15, 16, 17]);
    expect(a.x).toBeLessThan(d.x);
    expect(a.y).toBeLessThan(d.y);
  });

  it("draws a macrocycle as a closed zigzag, not a round polygon", () => {
    const shape = macrocycleShape(14);
    for (let i = 0; i < 14; i++) {
      const p = shape[i];
      const q = shape[(i + 1) % 14];
      expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeCloseTo(1, 6);
    }
    const m = measure(carbons(14, ring(0, 14)));
    expect(m.macroAngleError).toBeCloseTo(0, 6);
    // lying wide
    expect(m.macroAspect).toBeLessThan(1);
  });

  it("sets the pieces of a salt side by side", () => {
    const input: LayoutInput = {
      atoms: [{ el: "Na", charge: 1 }, { el: "C" }, { el: "C" }, { el: "O" }, { el: "O", charge: -1 }],
      bonds: [
        { a: 1, b: 2, order: 1 },
        { a: 2, b: 3, order: 2 },
        { a: 2, b: 4, order: 1 },
      ],
    };
    const { x, y } = layout2D(input);
    for (let i = 1; i < 5; i++) {
      expect(Math.hypot(x[0] - x[i], y[0] - y[i])).toBeGreaterThan(1);
    }
  });
});
