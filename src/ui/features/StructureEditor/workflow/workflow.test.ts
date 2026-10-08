import { describe, expect, it } from "vitest";
import { addMolecule3d, emptyStructureDocument, type StructureDocument } from "../document";
import type { Molecule3D } from "../store/types";
import { boxMembers, countOf, setEntries, setOf } from "./entries";
import { canWire, givesOf, inputOf, resultOf, stateOf, stepsBefore } from "./flow";
import { boxList } from "./list";
import { KCAL_PER_HARTREE, boltzmann, runMeno } from "./meno";
import { addBox, addStep, connect, moveBox, removeBox, removeStep, removeWire, updateStep } from "./model";
import { runStep, type RunWith } from "./run";
import { offeredSteps } from "./offered";
import { selectionFrame } from "./boxing";

/** Three atoms, bent, at `at` on the page: frame k opened out by k * `step` ångströms, with energies `e` (hartrees). */
function bent(at: { x: number; y: number }, n = 1, e?: number[], step = 0.4, el = "O"): Omit<Molecule3D, "id"> {
  const geo = (k: number) => [0, 0, 0, 1, 0, 0, -0.3, 0.95 + k * step, 0];
  const atoms = [0, 1, 2].map((i) => ({ el: i === 0 ? el : "H", x: geo(0)[3 * i], y: geo(0)[3 * i + 1], z: geo(0)[3 * i + 2] }));
  return {
    atoms,
    bonds: [{ a1: 0, a2: 1, order: 1 }, { a1: 0, a2: 2, order: 1 }],
    at,
    ...(n > 1 ? { frames: Array.from({ length: n - 1 }, (_, k) => geo(k + 1)) } : {}),
    ...(e ? { energies: e } : {}),
  };
}

const kcal = (k: number) => k / KCAL_PER_HARTREE;
const W: RunWith = { extentOf: () => ({ w: 1, h: 1 }), byOf: () => "meno", now: 1000 };

/** A page with one molecule of five frames - energies 0, 0.5, 2, 4 and 0.5 kcal/mol above -76 - boxed: box 1. */
function page(): StructureDocument {
  let doc = addMolecule3d(emptyStructureDocument(), bent({ x: 0, y: 0 }, 5, [0, 0.5, 2, 4, 0.5].map((k) => -76 + kcal(k))));
  doc = addBox(doc, { x0: -3, y0: -3, x1: 3, y1: 3 });
  return doc;
}

describe("what a box holds", () => {
  it("is what lies inside its frame, in the order it lies", () => {
    let doc = addMolecule3d(emptyStructureDocument(), bent({ x: 4, y: 0 }));
    doc = addMolecule3d(doc, bent({ x: 0, y: 5 }));
    doc = addMolecule3d(doc, bent({ x: 20, y: 0 }));
    doc = addBox(doc, { x0: -2, y0: -2, x1: 6, y1: 7 });
    const box = doc.boxes![0];
    // (the one higher on the page first; the one outside left out)
    expect(boxMembers(doc, box).molecules).toEqual([2, 1]);
    expect(setOf(doc, box)).toBe("molecules");
    expect(countOf(doc, box)).toEqual({ set: "molecules", entries: 2, compounds: 2 });
  });

  it("is a set of structures where any is drawn in it", () => {
    let doc = emptyStructureDocument();
    doc = { ...doc, model: { atoms: [{ id: 1, el: "C", x: 0, y: 0, r: 0.9 } as never], bonds: [] }, nextId: 2 };
    doc = addMolecule3d(doc, bent({ x: 1, y: 0 }));
    doc = addBox(doc, { x0: -2, y0: -2, x1: 2, y1: 2 });
    expect(setOf(doc, doc.boxes![0])).toBe("structures");
  });

  it("goes with it when its box is moved", () => {
    const doc = moveBox(page(), 1, 10, -2);
    expect(doc.boxes![0]).toMatchObject({ x0: 7, x1: 13, y0: -5, y1: 1 });
    expect(doc.molecules3d![0].at).toMatchObject({ x: 10, y: -2 });
  });

  it("stays where it is when its box is deleted", () => {
    const doc = removeBox(page(), 1);
    expect(doc.boxes).toEqual([]);
    expect(doc.molecules3d).toHaveLength(1);
  });

  it("is a compound per frame, unless it is a conformer set", () => {
    const m = { ...bent({ x: 0, y: 0 }, 3), id: 1 };
    expect(setEntries([m], "molecules").map((e) => [e.compound, e.number])).toEqual([[0, 1], [1, 1], [2, 1]]);
    expect(setEntries([m], "conformers").map((e) => [e.compound, e.number])).toEqual([[0, 1], [0, 2], [0, 3]]);
  });
});

describe("wires", () => {
  it("join what a port gives to a step that takes it, and nothing else", () => {
    let doc = addStep(page(), "energy-window", 5, 0);
    doc = addStep(doc, "as-conformers", 5, 5);
    // (a compound set does not go into an energy window: As conformers goes between)
    expect(canWire(doc, { box: 1 }, 2)).toBe(false);
    expect(connect(doc, { box: 1 }, 2)).toBe(doc);
    expect(canWire(doc, { box: 1 }, 3)).toBe(true);
    doc = connect(doc, { box: 1 }, 3);
    expect(givesOf(doc, { step: 3 })).toBe("conformers");
    doc = connect(doc, { step: 3 }, 2);
    expect(doc.wires!.map((w) => [w.from, w.to])).toEqual([[{ box: 1 }, 3], [{ step: 3 }, 2]]);
    expect(stepsBefore(doc, 2)).toEqual([3]);
    // (no loop)
    expect(canWire(doc, { step: 2 }, 3)).toBe(false);
  });

  it("into a step replace the one it had; deleted, go", () => {
    let doc = addStep(page(), "duplicates", 5, 0);
    doc = addBox(doc, { x0: 30, y0: 0, x1: 31, y1: 1 });
    doc = connect(doc, { box: 1 }, 2);
    doc = connect(doc, { box: 3 }, 2);
    expect(doc.wires!.map((w) => w.from)).toEqual([{ box: 3 }]);
    doc = removeWire(doc, doc.wires![0].id);
    expect(doc.wires).toEqual([]);
  });

  it("go with the step they join", () => {
    let doc = addStep(page(), "as-conformers", 5, 0);
    doc = connect(doc, { box: 1 }, 2);
    doc = runStep(doc, 2, W);
    expect(resultOf(doc, 2)).toBeTruthy();
    doc = removeStep(doc, 2);
    expect(doc.wires).toEqual([]);
    // (what it made stays, a box like any the chemist drew: a compound set)
    expect(doc.boxes).toHaveLength(2);
    expect(doc.boxes![1].made).toBeUndefined();
    expect(setOf(doc, doc.boxes![1])).toBe("molecules");
  });
});

describe("Meno's own steps", () => {
  const entries = (m: Omit<Molecule3D, "id">, set: "molecules" | "conformers") => setEntries([{ ...m, id: 1 }], set);

  it("make a compound set a conformer set by constitution", () => {
    const water = setEntries([{ ...bent({ x: 0, y: 0 }, 2), id: 1 }], "molecules");
    const sulfane = setEntries([{ ...bent({ x: 0, y: 0 }, 1, undefined, 0.4, "S"), id: 2 }], "molecules").map((e) => ({ ...e, compound: 2 }));
    const out = runMeno("as-conformers", [...water, ...sulfane], "molecules");
    expect(out.ok && out.set).toBe("conformers");
    expect(out.ok && out.kept.map((e) => [e.compound, e.number])).toEqual([[0, 1], [0, 2], [1, 1]]);
    expect(out.said).toBe("2 compounds · 3");
  });

  it("keep each compound's conformers within the window", () => {
    const out = runMeno("energy-window", entries(bent({ x: 0, y: 0 }, 4, [0, 1, 2.9, 3.1].map(kcal)), "conformers"), "conformers", { window: 3 });
    expect(out.ok && out.kept.map((e) => e.number)).toEqual([1, 2, 3]);
    expect(out.ok && out.aside.map((e) => e.number)).toEqual([4]);
    expect(out.said).toBe("3 of 4 kept");
  });

  it("need energies for a window and for populations", () => {
    const set = entries(bent({ x: 0, y: 0 }, 2), "conformers");
    expect(runMeno("energy-window", set, "conformers")).toEqual({ ok: false, said: "Not every entry has an energy" });
    expect(runMeno("populations", set, "conformers").ok).toBe(false);
  });

  it("set aside entries alike, keeping the lower in energy", () => {
    // frames 1 and 2 0.01 Å apart; frame 3 far from both
    const m = bent({ x: 0, y: 0 }, 3, [kcal(1), 0, kcal(2)], 0.01);
    m.frames![1] = [0, 0, 0, 1, 0, 0, -0.3, 2, 0];
    const out = runMeno("duplicates", entries(m, "conformers"), "conformers", { rmsd: 0.125 });
    expect(out.ok && out.kept.map((e) => e.number)).toEqual([2, 3]);
    expect(out.ok && out.aside.map((e) => e.number)).toEqual([1]);
  });

  it("find each conformer's population at the temperature asked", () => {
    const out = runMeno("populations", entries(bent({ x: 0, y: 0 }, 2, [0, kcal(1)]), "conformers"), "conformers", { temperature: 298.15 });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.shares![0] + out.shares![1]).toBeCloseTo(1, 10);
    // exp(-1 kcal/mol / RT) at 298.15 K: 0.1849
    expect(out.shares![1] / out.shares![0]).toBeCloseTo(0.1849, 3);
    const hot = boltzmann([0, kcal(1)], 1000);
    expect(hot[1]).toBeGreaterThan(out.shares![1]);
  });
});

describe("running", () => {
  /** box 1 → As conformers (2) → Energy window (3), 1 kcal/mol. */
  function chain(): StructureDocument {
    let doc = addStep(page(), "as-conformers", 5, 0);
    doc = addStep(doc, "energy-window", 20, 0, { window: 1 });
    doc = connect(doc, { box: 1 }, 2);
    return connect(doc, { step: 2 }, 3);
  }

  it("runs the steps before a step first, each making its result box", () => {
    const doc = runStep(chain(), 3, W);
    const by = () => "meno";
    expect(stateOf(doc, doc.steps![0], by())).toBe("done");
    expect(stateOf(doc, doc.steps![1], by())).toBe("done");
    expect(doc.steps![1].ran).toMatchObject({ ok: true, said: "3 of 5 kept", at: 1000 });
    const made = resultOf(doc, 3)!;
    expect(made.made).toEqual({ step: 3, set: "conformers" });
    expect(made.aside).toEqual([
      { compound: 0, number: 3, energy: -76 + kcal(2) },
      { compound: 0, number: 4, energy: -76 + kcal(4) },
    ]);
    // a conformer set: one molecule, its conformers in play as frames, numbered as they were
    const input = inputOf({ ...doc, wires: [{ id: 99, from: { box: made.id }, to: 3 }] }, 3)!;
    expect(input.set).toBe("conformers");
    expect(input.molecules).toHaveLength(1);
    expect(input.molecules[0]).toMatchObject({ conformerSet: true, numbers: [1, 2, 5] });
    // (to the right of its step, clear of it)
    expect(made.x0).toBeGreaterThan(doc.steps![1].x);
  });

  it("says a step has changed when its options, or what comes in, change", () => {
    let doc = runStep(chain(), 3, W);
    doc = updateStep(doc, 3, { options: { window: 5 } });
    expect(stateOf(doc, doc.steps![1], "meno")).toBe("changed");
    const before = doc.molecules3d!.length;
    doc = runStep(doc, 3, W);
    expect(stateOf(doc, doc.steps![1], "meno")).toBe("done");
    expect(doc.steps![1].ran!.said).toBe("5 of 5 kept");
    // (its result box's entries replaced, not added to)
    expect(doc.molecules3d!.length).toBe(before);
    expect(resultOf(doc, 3)!.aside).toBeUndefined();
  });

  it("fails, saying why, where it cannot run", () => {
    let doc = addStep(page(), "energy-window", 5, 0);
    doc = runStep(doc, 2, W);
    expect(doc.steps![0].ran).toMatchObject({ ok: false, said: "Nothing comes into it" });
    doc = connect(addStep(doc, "as-conformers", 5, 9), { box: 1 }, 3);
    doc = runStep(doc, 3, { ...W, byOf: () => "some-plugin" });
    expect(doc.steps![1].ran).toMatchObject({ ok: false, said: "Nothing added does this step" });
  });

  it("lists a conformer set's entries, lowest first, and those set aside", () => {
    const doc = runStep(chain(), 3, W);
    const made = resultOf(doc, 3)!;
    const molecules = boxMembers(doc, made).molecules.map((id) => doc.molecules3d!.find((m) => m.id === id)!);
    expect(boxList(molecules, made.aside!, "conformers")).toEqual([
      { label: "a · 1", energy: "0.00", share: expect.stringMatching(/%$/) },
      { label: "a · 2", energy: "0.50", share: expect.stringMatching(/%$/) },
      { label: "a · 5", energy: "0.50", share: expect.stringMatching(/%$/) },
      { label: "a · 3", energy: "2.00", aside: true },
      { label: "a · 4", energy: "4.00", aside: true },
    ]);
  });
});

describe("saving", () => {
  it("keeps boxes, steps and wires as they are, and leaves out what does not read", async () => {
    const { readWorkflow, nextIdAfter } = await import("./saved");
    const doc = runStep(
      connect(addStep(page(), "as-conformers", 5, 0), { box: 1 }, 2),
      2,
      W,
    );
    const saved = JSON.parse(JSON.stringify({ boxes: doc.boxes, steps: doc.steps, wires: doc.wires }));
    expect(readWorkflow(saved)).toEqual({ boxes: doc.boxes, steps: doc.steps, wires: doc.wires });
    expect(nextIdAfter(readWorkflow(saved)!)).toBe(doc.nextWorkflowId);
    // a wire into a step not there, a step of a kind Meno does not know, a box made by nothing there
    const odd = readWorkflow({
      boxes: [{ id: 1, x0: 2, y0: 2, x1: 0, y1: 0, made: { step: 9, set: "conformers" } }],
      steps: [{ id: 2, kind: "teleport", x: 0, y: 0 }],
      wires: [{ id: 3, from: { box: 1 }, to: 2 }],
    });
    expect(odd).toEqual({ boxes: [{ id: 1, x0: 0, y0: 0, x1: 2, y1: 2 }], steps: [], wires: [] });
    expect(readWorkflow({})).toBeUndefined();
  });
});

describe("Quick Add's calculations", () => {
  it("are the kinds something added does, As conformers only from a compound set's wire", () => {
    let doc = addStep(page(), "as-conformers", 5, 0);
    doc = connect(doc, { box: 1 }, 2);
    // (no plugin added runs a program: Meno's own steps on entries)
    expect(offeredSteps(doc).map((k) => k.kind)).toEqual(["energy-window", "duplicates", "populations"]);
    expect(offeredSteps(doc).every((k) => k.who === "Meno")).toBe(true);
    // a compound set's wire: what takes it, then the conversion
    expect(offeredSteps(doc, { box: 1 }).map((k) => k.kind)).toEqual(["duplicates", "as-conformers"]);
    // a conformer set's
    expect(offeredSteps(doc, { step: 2 }).map((k) => k.kind)).toEqual(["energy-window", "duplicates", "populations"]);
  });
});

describe("boxing the selection", () => {
  it("takes whole structures, not a few atoms of one", () => {
    const model = {
      atoms: [
        { id: 1, el: "C", x: 0, y: 0 },
        { id: 2, el: "C", x: 1.8, y: 0 },
      ] as never[],
      bonds: [{ id: 3, a: 1, b: 2, order: 1 }] as never[],
    };
    const style = {} as never;
    expect(selectionFrame(model, new Set([1]), [], new Set(), style, {}, {})).toBeNull();
    const f = selectionFrame(model, new Set([1, 2]), [], new Set(), style, {}, {})!;
    expect(f.x0).toBeLessThan(0);
    expect(f.x1).toBeGreaterThan(1.8);
    // (room under its tab)
    expect(f.y1 - 0).toBeGreaterThan(0 - f.y0);
  });
});
