import { describe, expect, it } from "vitest";
import { FRAMES, grow, sidesOf } from "./assemble";
import { layout2D } from "./engine";
import { macrocycleShape } from "./macrocycle";
import { layoutMetrics } from "./metrics";
import { perceive, type LayoutBond, type LayoutInput } from "./perceive";
import { solidOf } from "./cage";

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

  it("draws a cis double bond in a long chain as a step in a straight chain", () => {
    // octadec-9-ene, cis: the chain either side of C9=C10 on one line
    const bonds: [number, number, number?][] = Array.from({ length: 17 }, (_, i) => [i, i + 1, i === 8 ? 2 : 1]);
    const chain = carbons(18, bonds, bonds.map((_, i) => (i === 8 ? { stereo: { refs: [7, 10], cis: true } } : {})));
    // as it is grown, in every frame - before anything is tried the other way
    const mol = perceive(chain);
    for (const frame of FRAMES) {
      const pos = grow(mol, mol.pieces[0], new Map(), frame, sidesOf(mol));
      const axis = (from: number, to: number) =>
        Math.atan2(pos.get(to)!.y - pos.get(from)!.y, pos.get(to)!.x - pos.get(from)!.x);
      const turn = Math.abs(Math.atan2(Math.sin(axis(0, 8) - axis(10, 17)), Math.cos(axis(0, 8) - axis(10, 17))));
      expect(Math.min(turn, Math.PI - turn)).toBeLessThan((10 * Math.PI) / 180);
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

  it("sets a macrocycle that runs through rings round a circle, the rings regular", () => {
    // three benzene rings joined para to para by CH2CH2 bridges: a ring of rings
    const bonds: [number, number, number?][] = [];
    for (let k = 0; k < 3; k++) {
      const b = k * 8;
      for (const [i, j] of ring(b, 6)) bonds.push([i, j, (i - b) % 2 ? 2 : 1]);
      // para positions b+0 and b+3; the bridge b+6, b+7 to the next ring's b+0
      bonds.push([b + 3, b + 6], [b + 6, b + 7], [b + 7, ((k + 1) % 3) * 8]);
    }
    const cyclophane = carbons(24, bonds);
    for (const l of bondLengths(cyclophane)) expect(l).toBeCloseTo(1, 3);
    const m = measure(cyclophane);
    expect(m.ringError).toBeCloseTo(0, 3);
    expect(m.overlaps + m.crossings).toBe(0);
  });

  it("draws adamantane as it is always drawn: a chair, its axial bonds upright to the fourth bridgehead", () => {
    // four bridgeheads (0-3), six CH2 between them
    const cage = carbons(10, [
      [0, 4], [4, 1], [1, 5], [5, 2], [2, 6], [6, 0],
      [0, 7], [7, 3], [1, 8], [8, 3], [2, 9], [9, 3],
    ]);
    const { x, y, depth } = layout2D(cage);
    for (const l of bondLengths(cage)) expect(l).toBeCloseTo(1, 3);
    const upright = cage.bonds.filter(({ a, b }) => Math.abs(x[a] - x[b]) < 1e-6);
    expect(upright).toHaveLength(3);
    // one bond passes behind another, and is drawn broken there
    const m = layoutMetrics({ x, y, edges: cage.bonds.map(({ a, b }) => [a, b] as const) });
    expect(m.crossings).toBe(1);
    expect(m.overlaps).toBe(0);
    expect(depth.every((d) => d != null)).toBe(true);
  });

  it("draws norbornane as a boat with its bridge above it", () => {
    // bridgeheads 0 and 3; the bridge 6
    const norbornane = carbons(7, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 6], [6, 3]]);
    const { x, y } = layout2D(norbornane);
    expect(Math.max(...y)).toBeCloseTo(y[6], 6);
    // straight above the front bridgehead, a bond's length from the back one
    const lengths = [0, 3].map((h) => Math.hypot(x[6] - x[h], y[6] - y[h])).sort((p, q) => p - q);
    expect(lengths[0]).toBeCloseTo(1, 3);
    expect(lengths[1]).toBeCloseTo(Math.sqrt(3), 3);
    expect([0, 3].some((h) => Math.abs(x[6] - x[h]) < 1e-6)).toBe(true);
  });

  it("draws a cage as the solid it is, not its mirror image", () => {
    // camphor: C1 (0) with its methyl (8), the ketone at C2 (1), C4 (3) the
    // other bridgehead, C7 (6) with its two methyls - and each hand of it
    for (const volume of [1, -1] as const) {
      const skeleton = carbons(11, [
        [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 6], [6, 3], [1, 7, 2], [0, 8], [6, 9], [6, 10],
      ]);
      const camphor: LayoutInput = {
        ...skeleton,
        atoms: skeleton.atoms.map((a, i) =>
          i === 7 ? { el: "O" } : i === 3 ? { el: "C", tetra: { neighbours: [2, 4, 6, -1], volume } } : a,
        ),
      };
      const mol = perceive(camphor);
      const solid = solidOf(mol, mol.systems[0]);
      const { x, y, depth } = layout2D(camphor);
      // the linear map that takes the solid (about its middle) to the drawing
      // (x, y and depth) best turns it the right way: a mirror would not
      const atoms = mol.systems[0].atoms;
      const mid = (f: (a: number) => number) => atoms.reduce((s, a) => s + f(a), 0) / atoms.length;
      const from = atoms.map((a) => {
        const p = solid.get(a)!;
        return [0, 1, 2].map((k) => p[k] - mid((b) => solid.get(b)![k]));
      });
      const to = atoms.map((a) => [x[a] - mid((b) => x[b]), y[a] - mid((b) => y[b]), depth[a]! - mid((b) => depth[b]!)]);
      const cross = (u: number, v: number) => from.reduce((s, p, i) => s + p[u] * to[i][v], 0);
      const M = [0, 1, 2].map((u) => [0, 1, 2].map((v) => cross(u, v)));
      const det =
        M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) -
        M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) +
        M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
      expect(det).toBeGreaterThan(0);
    }
  });

  it("draws a cage from above, its back at the top, however the frame is set", () => {
    for (const volume of [1, -1] as const) {
      const skeleton = carbons(11, [
        [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 6], [6, 3], [1, 7, 2], [0, 8], [6, 9], [6, 10],
      ]);
      const camphor: LayoutInput = {
        ...skeleton,
        atoms: skeleton.atoms.map((a, i) =>
          i === 7 ? { el: "O" } : i === 3 ? { el: "C", tetra: { neighbours: [2, 4, 6, -1], volume } } : a,
        ),
      };
      const { y, depth } = layout2D(camphor);
      // round the six-membered ring the cage is drawn on, the higher on the
      // page the further from the viewer
      const cage = [0, 1, 2, 3, 4, 5];
      const my = cage.reduce((s, a) => s + y[a], 0) / cage.length;
      const md = cage.reduce((s, a) => s + depth[a]!, 0) / cage.length;
      const together = cage.reduce((s, a) => s + (y[a] - my) * (depth[a]! - md), 0);
      expect(together).toBeLessThan(0);
    }
  });

  it("draws an H at a centre hemmed in by rings clear of every bond", () => {
    // perhydrophenalene: the centre (0) in three rings, its H drawn
    const bonds: [number, number][] = [
      [0, 1], [0, 5], [0, 9], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10], [10, 11],
      [11, 12], [12, 1],
    ];
    const skeleton = carbons(13, bonds);
    const input: LayoutInput = {
      ...skeleton,
      atoms: skeleton.atoms.map((a, i) => (i === 0 ? { el: "C", tetra: { neighbours: [1, 5, 9, -1], volume: 1 } } : a)),
    };
    const { x, y, hydrogens } = layout2D(input);
    const h = hydrogens.find((d) => d.on === 0)!;
    expect(h).toBeDefined();
    for (let a = 1; a < 13; a++) expect(Math.hypot(x[a] - h.at.x, y[a] - h.at.y)).toBeGreaterThan(0.6);
    for (const [a, b] of bonds) {
      if (a === 0 || b === 0) continue;
      const vx = x[b] - x[a];
      const vy = y[b] - y[a];
      const k = Math.max(0, Math.min(1, ((h.at.x - x[a]) * vx + (h.at.y - y[a]) * vy) / (vx * vx + vy * vy)));
      expect(Math.hypot(h.at.x - x[a] - k * vx, h.at.y - y[a] - k * vy)).toBeGreaterThan(0.4);
    }
  });

  it("draws a ring system with a ring fused on a side flat, its bridge across a ring", () => {
    // 9,10-dihydro-9,10-ethanoanthracene: the bridge (14, 15) across the
    // middle ring of an anthracene
    const bonds: [number, number, number?][] = [
      [0, 2], [2, 3, 2], [3, 4], [4, 5, 2], [5, 6], [6, 7, 2], [7, 2], [7, 1],
      [0, 8], [8, 9, 2], [9, 10], [10, 11, 2], [11, 12], [12, 13, 2], [13, 8], [13, 1],
      [0, 14], [14, 15], [15, 1],
    ];
    const input = carbons(16, bonds);
    const { x, y, depth, solid } = layout2D(input);
    expect(solid.some((s) => s)).toBe(false);
    for (const l of bondLengths(input)) expect(l).toBeCloseTo(1, 3);
    // the fused rings flat, the bridge in front of them or behind
    expect(depth.slice(0, 14).every((d) => d === 0)).toBe(true);
    expect(Math.abs(depth[14]!)).toBe(1);
    expect(depth[15]).toBe(depth[14]);
    const m = layoutMetrics({ x, y, edges: input.bonds.map(({ a, b }) => [a, b] as const), depth });
    expect(m.overlaps + m.crossings).toBe(0);
    expect(m.ringError).toBeLessThan(0.05);
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
