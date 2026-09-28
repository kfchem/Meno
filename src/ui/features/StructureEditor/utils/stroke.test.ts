import { describe, expect, it } from "vitest";
import {
  advanceStroke,
  finishStroke,
  holdStroke,
  startStroke,
  strokeTarget,
} from "./stroke";

const L = 1;
// one carbon, and a second to the left of it
const methyl = {
  atoms: [
    { id: 1, x: 0, y: 0 },
    { id: 2, x: -1, y: 0 },
  ],
  bonds: [{ a: 1, b: 2 }],
};

describe("a bond stroke", () => {
  it("points 120 degrees from the bond already there", () => {
    const s = startStroke("bond", 1);
    const t = strokeTarget(methyl, s, { x: 0.4, y: 0.9 }, L)!;
    expect(t.end.x).toBeCloseTo(0.5, 6);
    expect(t.end.y).toBeCloseTo(Math.sqrt(3) / 2, 6);
    expect(t.trigonalTo).toBeDefined();
    // released: one bond, to a new atom there
    expect(finishStroke(methyl, s, { x: 0.4, y: 0.9 }, L)).toHaveLength(1);
  });

  it("goes exactly where the pointer is after a pause", () => {
    const s = holdStroke(methyl, startStroke("bond", 1), { x: 0.3, y: 0.3 }, L);
    expect(strokeTarget(methyl, s, { x: 0.7, y: 0.2 }, L)!.end).toEqual({
      x: 0.7,
      y: 0.2,
    });
  });

  it("closes onto the atom the pointer is on, however far away", () => {
    // an atom two bonds off, the pointer on it: a long bond closes the ring
    const far = {
      atoms: [...methyl.atoms, { id: 3, x: 1.2, y: 1.5 }],
      bonds: methyl.bonds,
    };
    const t = strokeTarget(far, startStroke("bond", 1), { x: 1.25, y: 1.45 }, L)!;
    expect(t.atomId).toBe(3);
    expect(t.end).toEqual({ x: 1.2, y: 1.5 });
  });

  it("closes onto an atom within reach", () => {
    const three = {
      atoms: [...methyl.atoms, { id: 3, x: 0.5, y: 0.9 }],
      bonds: methyl.bonds,
    };
    const t = strokeTarget(three, startStroke("bond", 1), { x: 0.4, y: 0.9 }, L)!;
    expect(t.atomId).toBe(3);
    expect(t.end).toEqual({ x: 0.5, y: 0.9 });
  });
});

describe("a chain stroke", () => {
  it("lays down an atom for every bond length the pointer goes, zigzagging", () => {
    let s = startStroke("chain", 1);
    // the pointer runs off to the right, four bond lengths
    for (let x = 0.1; x <= 4; x += 0.1) s = advanceStroke(methyl, s, { x, y: 0 }, L);
    expect(s.nodes.length).toBeGreaterThanOrEqual(3);
    // each bond one long, and alternately up and down
    let prev = { x: 0, y: 0 };
    const ups: number[] = [];
    for (const n of s.nodes) {
      expect(Math.hypot(n.x - prev.x, n.y - prev.y)).toBeCloseTo(1, 6);
      ups.push(Math.sign(n.y - prev.y));
      prev = n;
    }
    for (let i = 1; i < ups.length; i++) expect(ups[i]).not.toBe(ups[i - 1]);
  });

  it("lays down the bond it is on at a pause, snapped, but not right after the last", () => {
    const s = startStroke("chain", 1);
    const held = holdStroke(methyl, s, { x: 0.5, y: 0.6 }, L);
    expect(held.nodes).toHaveLength(1);
    expect(Math.hypot(held.nodes[0].x, held.nodes[0].y)).toBeCloseTo(1, 6);
    // a second pause where it already is adds nothing
    const again = holdStroke(methyl, held, held.nodes[0], L);
    expect(again.nodes).toHaveLength(1);
  });

  it("ends without a bond when released near the last atom", () => {
    const s = holdStroke(methyl, startStroke("chain", 1), { x: 0.5, y: 0.6 }, L);
    expect(finishStroke(methyl, s, { x: 0.55, y: 0.85 }, L)).toHaveLength(1);
  });
});
