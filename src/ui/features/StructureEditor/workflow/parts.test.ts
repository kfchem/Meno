import { describe, expect, it } from "vitest";
import { emptyStructureDocument, type StructureDocument } from "../document";
import { readRecord, recordText, centredAt } from "../utils/copyPaste";
import { addSet, addStep, connect, markMade, setRan } from "./model";
import { CARD_H, CARD_W } from "./look";
import { appendParts, flowIn, flowOf, partsBounds, partsOf, procedureParts, removeParts } from "./parts";

/** A flow: an input set (1) wired (3) into an optimisation (2), whose result set (4) is wired (6) into an energy (5); and a step on its own (7). */
function flow(): StructureDocument {
  let d = addSet(emptyStructureDocument(), { x0: 0, y0: 0, x1: 4, y1: 4 });
  d = addStep(d, "optimise", 6, 3, { method: "gfn2" }, "xtb");
  d = connect(d, { set: 1 }, 2);
  d = addSet(d, { x0: 12, y0: 0, x1: 16, y1: 4 });
  d = markMade(d, 4, { step: 2, holds: "molecules" }, undefined);
  d = setRan(d, 2, { at: 1, ok: true, said: "done", input: "x" });
  d = addStep(d, "energy", 18, 3, { method: "gfn2" }, "xtb");
  d = connect(d, { set: 4 }, 5);
  d = addStep(d, "frequencies", 30, 30, {}, "xtb");
  return d;
}

describe("a workflow's parts taken together", () => {
  it("are those sets and steps - without what the steps did - and the wires among them", () => {
    const d = flow();
    const parts = partsOf(d, new Set([1, 4]), new Set([2]));
    expect(parts.sets.map((b) => b.id)).toEqual([1, 4]);
    // (the set step 2 made, made by it still)
    expect(parts.sets[1].made).toEqual({ step: 2, holds: "molecules" });
    expect(parts.steps).toEqual([{ id: 2, kind: "optimise", x: 6, y: 3, by: "xtb", options: { method: "gfn2" } }]);
    // (the wire from set 4 into step 5 is not among them)
    expect(parts.wires.map((w) => [w.from, w.to])).toEqual([[{ set: 1 }, 2]]);
    // a set whose step is not among them: a set the chemist drew
    expect(partsOf(d, new Set([4]), new Set()).sets[0].made).toBeUndefined();
  });

  it("are added numbered on, moved, wired as they were - and taken away with every wire into and out of them", () => {
    const d = flow();
    const parts = partsOf(d, new Set([1, 4]), new Set([2, 5]));
    const added = appendParts(d, parts, 100, -10);
    const next = d.nextWorkflowId!;
    expect(added.sets).toEqual([next, next + 1]);
    expect(added.steps).toEqual([next + 2, next + 3]);
    const sets = added.doc.sets!.slice(-2);
    expect(sets[0]).toMatchObject({ x0: 100, x1: 104, y0: -10, y1: -6 });
    expect(sets[1].made).toEqual({ step: next + 2, holds: "molecules" });
    expect(added.doc.steps!.slice(-2).map((s) => [s.kind, s.x, s.y])).toEqual([
      ["optimise", 106, -7],
      ["energy", 118, -7],
    ]);
    expect(added.doc.wires!.slice(-2).map((w) => [w.from, w.to])).toEqual([
      [{ set: next }, next + 2],
      [{ set: next + 1 }, next + 3],
    ]);
    const gone = removeParts(added.doc, added.sets, added.steps);
    expect(gone.sets).toEqual(d.sets);
    expect(gone.steps).toEqual(d.steps);
    expect(gone.wires).toEqual(d.wires);
  });

  it("are taken by a box or a lasso where their middles are inside it", () => {
    const d = flow();
    expect(flowIn(d, "box", [{ x: -1, y: -1 }, { x: 10, y: 5 }])).toEqual({ sets: [1], steps: [2] });
    const lasso = [{ x: 10, y: -5 }, { x: 40, y: -5 }, { x: 40, y: 40 }, { x: 10, y: 40 }];
    expect(flowIn(d, "lasso", lasso)).toEqual({ sets: [4], steps: [5, 7] });
    expect(partsBounds(partsOf(d, new Set([1]), new Set([2])))).toEqual({ x0: 0, y0: Math.min(0, 3 - CARD_H), x1: 6 + CARD_W, y1: 4 });
    expect(partsBounds(partsOf(d, new Set(), new Set([7])))).toEqual({ x0: 30, y0: 30 - CARD_H, x1: 30 + CARD_W, y1: 30 });
  });

  it("go to the clipboard in Meno's record and come back, moved with the rest", () => {
    const d = flow();
    const flowParts = partsOf(d, new Set([1]), new Set([2]));
    const read = readRecord(recordText({ atoms: [], bonds: [], flow: flowParts }));
    expect(read?.flow).toEqual(flowParts);
    // (what a step did is never carried; nor a wire to what is not there)
    const withRun = { ...flowParts, steps: [{ ...flowParts.steps[0], ran: { at: 1, ok: true, said: "x", input: "y" } }], wires: [...flowParts.wires, { id: 99, from: { set: 42 }, to: 2 }] };
    expect(readRecord(recordText({ atoms: [], bonds: [], flow: withRun }))?.flow).toEqual(flowParts);
    const moved = centredAt({ atoms: [], bonds: [], flow: flowParts }, { x: 0, y: 0 });
    const b = partsBounds(moved.flow!)!;
    expect((b.x0 + b.x1) / 2).toBeCloseTo(0);
    expect((b.y0 + b.y1) / 2).toBeCloseTo(0);
  });
});

describe("a whole flow", () => {
  it("is every set and step joined to one by wires, either way, and the sets its steps made", () => {
    const d = flow();
    const whole = { sets: new Set([1, 4]), steps: new Set([2, 5]) };
    expect(flowOf(d, { step: 5 })).toEqual(whole);
    expect(flowOf(d, { set: 1 })).toEqual(whole);
    expect(flowOf(d, { step: 7 })).toEqual({ sets: new Set(), steps: new Set([7]) });
  });

  it("as a procedure: its steps as set, its inputs empty frames - not what its steps made - placed from its top left", () => {
    const d = flow();
    const proc = procedureParts(d, flowOf(d, { step: 2 }));
    expect(proc.sets).toEqual([{ id: 1, x0: 0, x1: 4, y0: -4, y1: 0 }]);
    expect(proc.steps.map((s) => [s.id, s.kind, s.x, s.y, s.by])).toEqual([
      [2, "optimise", 6, -1, "xtb"],
      [5, "energy", 18, -1, "xtb"],
    ]);
    // (what came from the set step 2 made comes from step 2 itself)
    expect(proc.wires.map((w) => [w.from, w.to])).toEqual([
      [{ set: 1 }, 2],
      [{ step: 2 }, 5],
    ]);
    // put down again: the chain, wired, ready for an input
    const down = appendParts(emptyStructureDocument(), proc, 50, 50).doc;
    expect(down.sets).toHaveLength(1);
    expect(down.steps!.map((s) => s.kind)).toEqual(["optimise", "energy"]);
    expect(down.wires).toHaveLength(2);
  });
});
