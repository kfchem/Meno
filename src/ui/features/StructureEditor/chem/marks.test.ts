import { describe, expect, it } from "vitest";
import type { Model } from "../store/types";
import {
  bondSide,
  exitDistance,
  marksOf,
  placeMark,
  segmentHitsRect,
  valenceMessage,
  waysOut,
} from "./marks";

const atom = (id: number, x: number, y: number, el = "C") => ({
  id,
  x,
  y,
  r: 0.9,
  el,
});
const bond = (id: number, a: number, b: number, order: 1 | 2 | 3 = 1) => ({
  id,
  a,
  b,
  order,
});

// but-2-ene, drawn trans, with ids that are not positions
const butene: Model = {
  atoms: [atom(10, 0, 0), atom(11, 1.3, 0.75), atom(12, 2.6, 0), atom(13, 3.9, 0.75)],
  bonds: [bond(20, 10, 11), bond(21, 11, 12, 2), bond(22, 12, 13)],
};

describe("marksOf", () => {
  it("puts RDKit's answer on the atoms and bonds it is about, by id", () => {
    const marks = marksOf(butene, {
      atoms: [
        { index: 0, hydrogens: 3 },
        { index: 1, hydrogens: 1, cip: "R" },
        { index: 2, hydrogens: 0, valenceError: { valence: 5, most: 4 } },
        { index: 3, hydrogens: 3 },
      ],
      bonds: [{ index: 1, cip: "E" }],
      smiles: null,
    });
    expect([...marks.centres]).toEqual([[11, "R"]]);
    expect([...marks.valence]).toEqual([[12, { valence: 5, most: 4 }]]);
    expect([...marks.doubleBonds]).toEqual([[21, "E"]]);
  });
});

describe("valenceMessage", () => {
  it("says what is wrong in words", () => {
    expect(valenceMessage("C", { valence: 5, most: 4 })).toBe(
      "Too many bonds: a valence of 5, where carbon takes at most 4.",
    );
    expect(valenceMessage("Fe", { valence: 9 })).toBe(
      "Too many bonds: a valence of 9 is more than iron takes.",
    );
  });
});

describe("where marks go", () => {
  it("leaves an atom by the widest gap between its bonds first", () => {
    // the middle of a zigzag: bonds down-left and down-right, so up
    const [up, down] = waysOut(butene, 11);
    expect(up.x).toBeCloseTo(0, 6);
    expect(up.y).toBeCloseTo(1, 6);
    expect(down.y).toBeCloseTo(-1, 6);
    // the end of a chain: straight back from its one bond
    const [back] = waysOut(butene, 10);
    expect(back.x).toBeCloseTo(-Math.cos(Math.PI / 6), 2);
    // an atom on its own: below it, then round the compass
    const lone = waysOut({ atoms: [atom(1, 0, 0)], bonds: [] }, 1);
    expect(lone).toHaveLength(12);
    expect(lone[0].x).toBeCloseTo(0, 9);
    expect(lone[0].y).toBeCloseTo(-1, 9);
  });

  it("puts a mark where it covers no bond, label or other mark", () => {
    const from = { x: 0, y: 0 };
    const half = { x: 0.4, y: 0.2 };
    const common = { from, start: () => 0.1, half, step: 0.3 };
    // nothing in the way: the first way out, as close as it goes
    const up = placeMark({
      ...common,
      dirs: [{ x: 0, y: 1 }, { x: 0, y: -1 }],
      segments: [],
      rects: [],
    });
    expect(up.minY).toBeCloseTo(0.1, 9);
    // a bond across the way up: down instead
    const down = placeMark({
      ...common,
      dirs: [{ x: 0, y: 1 }, { x: 0, y: -1 }],
      segments: [[{ x: -2, y: 0.4 }, { x: 2, y: 0.4 }]],
      rects: [{ minX: -1, maxX: 1, minY: -1.5, maxY: -1.2 }],
    });
    expect(down.maxY).toBeCloseTo(-0.1, 9);
  });

  it("knows when a line passes through a box", () => {
    const box = { minX: 0, maxX: 1, minY: 0, maxY: 1 };
    expect(segmentHitsRect([{ x: -1, y: 0.5 }, { x: 2, y: 0.5 }], box)).toBe(true);
    expect(segmentHitsRect([{ x: 0.5, y: 0.5 }, { x: 5, y: 5 }], box)).toBe(true);
    expect(segmentHitsRect([{ x: -1, y: 2 }, { x: 2, y: 2 }], box)).toBe(false);
  });

  it("puts a double bond's mark on the side with fewer of its neighbours", () => {
    // trans: one neighbour either side - above, then
    const s = bondSide(butene, 21)!;
    expect(s.at.x).toBeCloseTo(1.95, 9);
    expect(s.at.y).toBeCloseTo(0.375, 9);
    expect(s.out.y).toBeGreaterThan(0);
    // cis, both neighbours below: above
    const cis: Model = {
      atoms: [atom(1, -0.75, -1.3), atom(2, 0, 0), atom(3, 1.5, 0), atom(4, 2.25, -1.3)],
      bonds: [bond(5, 1, 2), bond(6, 2, 3, 2), bond(7, 3, 4)],
    };
    expect(bondSide(cis, 6)!.out.y).toBe(1);
    // both above: below
    const flipped: Model = {
      ...cis,
      atoms: cis.atoms.map((a) => ({ ...a, y: -a.y })),
    };
    expect(bondSide(flipped, 6)!.out.y).toBe(-1);
  });

  it("finds where a line from an atom leaves its label", () => {
    const box = { left: 0.2, right: 1, top: 0.5, bottom: 0.5 };
    expect(exitDistance(box, { x: 1, y: 0 })).toBe(1);
    expect(exitDistance(box, { x: -1, y: 0 })).toBe(0.2);
    expect(exitDistance(box, { x: 0, y: -1 })).toBe(0.5);
  });
});
