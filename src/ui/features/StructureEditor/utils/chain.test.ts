import { describe, expect, it } from "vitest";
import { endChain, followChain, regularRing, ringsOf, startChain, type Chain } from "./chain";
import { cellOf } from "./honeycomb";
import type { Pt } from "./honeycomb";

const L = 1.8;

/** The pointer led along points, a little at a time. */
function lead(c: Chain, points: Pt[], steps = 12): Chain {
  let at = c.trail[c.trail.length - 1];
  for (const p of points) {
    for (let i = 1; i <= steps; i++) c = followChain(c, { x: at.x + ((p.x - at.x) * i) / steps, y: at.y + ((p.y - at.y) * i) / steps });
    at = p;
  }
  return c;
}

/** Points round a circle about `centre`, from the angle `from`, `turns` of the way round. */
const round = (centre: Pt, r: number, from: number, turns: number, n = 48): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = from + (2 * Math.PI * turns * i) / n;
    return { x: centre.x + r * Math.cos(a), y: centre.y + r * Math.sin(a) };
  });

describe("a chain traced on its honeycomb", () => {
  it("zigzags along it towards the pointer, a bond a step", () => {
    const c = lead(startChain({ x: 0, y: 0 }, [], L), [{ x: 4 * L * Math.cos(Math.PI / 6), y: 0 }]);
    expect(c.walk.length).toBeGreaterThanOrEqual(4);
    const pts = c.walk.map((k) => cellOf(c.honeycomb, k));
    for (let i = 1; i < pts.length; i++) expect(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)).toBeCloseTo(L, 9);
    // across, up and down by half a bond
    expect(Math.max(...pts.map((p) => Math.abs(p.y)))).toBeCloseTo(L / 2, 9);
  });

  it("takes its bonds back when led back the way it came, and draws no ring for that", () => {
    const out = lead(startChain({ x: 0, y: 0 }, [], L), [{ x: 3 * L, y: 0 }]);
    const back = lead(out, [{ x: 0.2 * L, y: 0 }]);
    expect(back.walk).toEqual(["0,0,A"]);
    expect(ringsOf(back)).toEqual([]);
  });

  it("takes its bonds back when led back a little beside the way it came, and closes no ring for that", () => {
    // (as led in the app: from a methyl, its bond up and a little right, out
    // and back again a little lower; the way back as near going on beside
    // the chain as going back along it)
    const k = L / 98;
    const at = (x: number, y: number): Pt => ({ x: (x - 824) * k, y: -(y - 1146) * k });
    for (const steps of [7, 20, 40]) {
      const c0 = startChain(at(824, 1146), [at(843, 1050)], L);
      const out = lead(c0, [at(1324, 1180)], steps);
      const back = lead(out, [at(1060, 1160)], steps);
      expect(new Set(back.walk).size).toBe(back.walk.length);
      expect(out.walk.slice(0, back.walk.length)).toEqual(back.walk);
      expect(ringsOf(back)).toEqual([]);
    }
  });

  it("closes a six-membered ring when led round a hexagon of it", () => {
    const c0 = startChain({ x: 0, y: 0 }, [], L);
    // the hexagon above the start: its centre one bond straight up
    const centre = { x: 0, y: L };
    const c = lead(c0, round(centre, L, -Math.PI / 2, 1.02, 60), 3);
    expect(c.walk[0]).toBe("0,0,A");
    expect(c.walk[c.walk.length - 1]).toBe("0,0,A");
    expect(new Set(c.walk).size).toBe(6);
  });

  it("draws a ring of as many members as a loop back to it is long, on the side it went round", () => {
    const c0 = startChain({ x: 0, y: 0 }, [], L);
    // round a loop about as long as five bonds, from the start and back to it
    const rr = (5 * L) / (2 * Math.PI);
    const centre = { x: 0.2 * rr, y: Math.sqrt(1 - 0.04) * rr };
    const from = Math.atan2(-centre.y, -centre.x);
    const c = endChain(lead(c0, round(centre, rr, from, -1, 60), 3));
    const rings = ringsOf(c);
    expect(rings).toHaveLength(1);
    expect(rings[0].points.length + 1).toBe(5);
    expect(rings[0].at).toBe(0);
    // on the loop's side: above the start
    expect(rings[0].points.reduce((y, p) => y + p.y, 0)).toBeGreaterThan(0);
  });

  it("draws no larger a ring for a loop traced with a trembling hand", () => {
    const c0 = startChain({ x: 0, y: 0 }, [], L);
    const rr = (5 * L) / (2 * Math.PI);
    const centre = { x: 0.2 * rr, y: Math.sqrt(1 - 0.04) * rr };
    const from = Math.atan2(-centre.y, -centre.x);
    // each point of the way a little off it, to one side and back
    const shaky = round(centre, rr, from, -1, 60).flatMap((p) => [{ x: p.x - 0.08 * L, y: p.y }, p]);
    const rings = ringsOf(endChain(lead(c0, shaky, 1)));
    expect(rings).toHaveLength(1);
    expect(rings[0].points.length + 1).toBe(5);
  });

  it("draws no ring for a way out and back that encloses only a sliver", () => {
    const out = lead(startChain({ x: 0, y: 0 }, [], L), [{ x: 3 * L, y: 0 }]);
    const back = endChain(lead(out, [{ x: 3 * L, y: -0.35 * L }, { x: 0.1 * L, y: -0.35 * L }]));
    expect(ringsOf(back)).toEqual([]);
  });

  it("keeps a ring the chain goes on from, and lets it go when led back past it", () => {
    let c = startChain({ x: 0, y: 0 }, [], L);
    const out = lead(c, [{ x: 2 * L, y: 0 }]);
    const head = cellOf(out.honeycomb, out.walk[out.walk.length - 1]);
    const centre = { x: head.x, y: head.y + L * 0.9 };
    c = lead(out, round(centre, L * 0.9, -Math.PI / 2, 1.0, 60), 3);
    c = lead(c, [{ x: head.x + 2 * L, y: head.y - 0.2 * L }]);
    expect(c.rings.length).toBe(1);
    const back = lead(c, [{ x: 0, y: 0 }]);
    expect(ringsOf(back)).toEqual([]);
  });
});

describe("a regular ring on a bond", () => {
  it("has the bond as a side, its atoms a bond apart, on the side asked for", () => {
    const pts = regularRing({ x: 0, y: 0 }, { x: L, y: 0 }, 5, { x: 0.5, y: -3 });
    expect(pts).toHaveLength(4);
    expect(pts[0].x).toBeCloseTo(L, 9);
    const all = [{ x: 0, y: 0 }, ...pts];
    for (let i = 0; i < all.length; i++) {
      const p = all[i];
      const q = all[(i + 1) % all.length];
      expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeCloseTo(L, 9);
    }
    expect(pts.every((p) => p.y <= 1e-9)).toBe(true);
  });
});
