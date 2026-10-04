import { describe, expect, it } from "vitest";
import { glideAt, partsOf, planGlide, type Pt } from "./glide";

/** A bent chain of four atoms. */
const chain = new Map<number, Pt>([
  [1, { x: 0, y: 0 }],
  [2, { x: 1.3, y: 0.75 }],
  [3, { x: 2.6, y: 0 }],
  [4, { x: 3.9, y: 0.75 }],
]);
const turned = (m: Map<number, Pt>, angle: number, dx = 0, dy = 0, over = false) =>
  new Map(
    [...m].map(([id, p]) => {
      const y = over ? -p.y : p.y;
      return [id, { x: Math.cos(angle) * p.x - Math.sin(angle) * y + dx, y: Math.sin(angle) * p.x + Math.cos(angle) * y + dy }];
    }),
  );
const close = (a: Map<number, Pt>, b: Map<number, Pt>) => {
  for (const [id, p] of b) {
    expect(a.get(id)!.x).toBeCloseTo(p.x, 9);
    expect(a.get(id)!.y).toBeCloseTo(p.y, 9);
  }
};
const gap = (m: Map<number, Pt>, a: number, b: number) => Math.hypot(m.get(a)!.x - m.get(b)!.x, m.get(a)!.y - m.get(b)!.y);

describe("a drawing going to a new shape", () => {
  it("starts where it was and ends where it is to be", () => {
    for (const to of [turned(chain, 2.5, 4, -1), turned(chain, 0.3, 0, 0, true), turned(chain, Math.PI)]) {
      const plan = planGlide(chain, to, [[1, 2, 3, 4]]);
      close(glideAt(plan, chain, 0), chain);
      close(glideAt(plan, chain, 1), to);
    }
  });

  it("turns as a whole rather than folding through itself", () => {
    const to = turned(chain, Math.PI, 1, 2);
    const plan = planGlide(chain, to, [[1, 2, 3, 4]]);
    const half = glideAt(plan, chain, 0.5);
    // half way round, the chain is as long as ever
    expect(gap(half, 1, 4)).toBeCloseTo(gap(chain, 1, 4), 9);
    expect(plan.parts[0].over).toBe(false);
  });

  it("turns over like a page: on a line half way", () => {
    const to = turned(chain, 0, 0, 0, true);
    const plan = planGlide(chain, to, [[1, 2, 3, 4]]);
    expect(plan.parts[0].over).toBe(true);
    const half = glideAt(plan, chain, 0.5);
    const ys = [...half.values()].map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1e-9);
  });

  it("moves each structure by itself", () => {
    const two = new Map<number, Pt>([...chain, [9, { x: 10, y: 10 }], [10, { x: 11.5, y: 10 }]]);
    const to = new Map<number, Pt>([...turned(chain, Math.PI / 2), [9, { x: 10, y: 10 }], [10, { x: 11.5, y: 10 }]]);
    const plan = planGlide(two, to, partsOf([...two.keys()].map((id) => ({ id })), [
      { a: 1, b: 2 },
      { a: 2, b: 3 },
      { a: 3, b: 4 },
      { a: 9, b: 10 },
    ]));
    // the one that did not move stays put the whole way
    const mid = glideAt(plan, two, 0.4);
    expect(mid.get(9)).toEqual({ x: 10, y: 10 });
  });
});
