/**
 * A step run (docs/WORKFLOWS.md, *Running*), where Meno does it: first any
 * step before it that has not run or has changed, then it, on what comes
 * in - what it gave coming in as a result box to the right of it, or in
 * the one it made before, in place of what that held. One edit: an undo
 * takes the run's results away.
 */
import { addMolecule3d, removeMolecules3d, type StructureDocument } from "../document";
import type { AsideEntry, Molecule3D, WorkflowStep } from "../store/types";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { boxMembers, inside, setEntries, type Frame, type SetEntry } from "./entries";
import { boxOf, inputKey, inputOf, resultOf, stateOf, stepOf, wireInto } from "./flow";
import { kindInfo, MENO_DOES, takes, type SetKind } from "./kinds";
import { boxList } from "./list";
import { BETWEEN, BOX_PAD, BOX_TOP, CARD_H, CARD_W, CHIP, GAP, LIST_W, PX, ROW } from "./look";
import { runMeno, type Outcome } from "./meno";
import { addBox, setBoxFrame, setBoxMade, setRan } from "./model";

/** What a run needs of the canvas: how far a molecule in 3D reaches from its middle on the page, across and up, in any of its frames; who does a step; and the time. */
export type RunWith = { extentOf: (m: Omit<Molecule3D, "id">) => { w: number; h: number }; byOf: (step: WorkflowStep) => string; now: number };

/** What each kind of set is called, where a step says what it takes. */
const SET_NAMES: Record<SetKind, string> = { structures: "structures drawn", molecules: "molecules in 3D", conformers: "conformer sets" };

/** `doc` with the step `id` run - and first the steps before it that need it. */
export function runStep(doc: StructureDocument, id: number, w: RunWith, depth = 0): StructureDocument {
  const step = stepOf(doc, id);
  if (!step || depth > 200) return doc;
  // what comes in, made first where it has not been, or is out of date
  const from = wireInto(doc, id)?.from;
  const before = from ? ("step" in from ? from.step : boxOf(doc, from.box)?.made?.step) : undefined;
  const prior = before != null ? stepOf(doc, before) : undefined;
  if (prior && stateOf(doc, prior, w.byOf(prior)) !== "done") doc = runStep(doc, prior.id, w, depth + 1);

  const by = w.byOf(step);
  const input = inputOf(doc, id);
  const key = inputKey(doc, step, by);
  const fail = (said: string) => setRan(doc, id, { at: w.now, ok: false, said, input: key });
  // (not on what a step before it gave on an earlier run: it failed this time)
  if (prior && stepOf(doc, prior.id)?.ran?.ok === false) return fail("The step before it failed");
  if (!input) return fail("Nothing comes into it");
  if (!takes(step.kind, input.set)) return fail(`Takes ${kindInfo(step.kind).takes.map((s) => SET_NAMES[s]).join(" or ")}`);
  if (by !== "meno" || !MENO_DOES.includes(step.kind)) return fail("Nothing added does this step");
  const outcome = runMeno(step.kind, setEntries(input.molecules, input.set as "molecules" | "conformers"), input.set, step.options);
  if (!outcome.ok) return fail(outcome.said);
  return setRan(withResults(doc, step, outcome, w), id, { at: w.now, ok: true, said: outcome.said, input: key });
}

/** A frame `w` wide and `h` tall, its top left at (x, y). */
const frameAt = (x: number, y: number, w: number, h: number): Frame => ({ x0: x, x1: x + w, y0: y - h, y1: y });

/** The most a row of molecules in a result box spans before the next row begins. */
const ROW_MOST = 12 * NOMINAL_BOND_LENGTH;

/** `doc` with what a step gave as the entries of its result box: made to the right of it, or the one it made before, emptied of what it held. */
function withResults(doc: StructureDocument, step: WorkflowStep, outcome: Extract<Outcome, { ok: true }>, w: RunWith): StructureDocument {
  const made = moleculesOf(outcome);
  const aside: AsideEntry[] = outcome.aside.map((e) => ({ compound: e.compound, number: e.number, ...(e.energy != null ? { energy: e.energy } : {}) }));
  // its list under the box's tab; below it, the molecules in rows, left to
  // right - each with room for its frames chip below it, where it has frames
  const sizes = made.map((m) => {
    const e = w.extentOf({ ...m, at: { x: 0, y: 0 } });
    return { w: Math.max(e.w, NOMINAL_BOND_LENGTH / 2), h: Math.max(e.h, NOMINAL_BOND_LENGTH / 2), chip: m.frames?.length ? CHIP : 0 };
  });
  const places: { x: number; y: number }[] = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  let wide = 0;
  sizes.forEach((size) => {
    const d = 2 * size.w;
    if (x > 0 && x + d > ROW_MOST) {
      y -= rowH + BETWEEN;
      x = 0;
      rowH = 0;
    }
    places.push({ x: x + size.w, y: y - size.h });
    x += d + BETWEEN;
    rowH = Math.max(rowH, 2 * size.h + size.chip);
    wide = Math.max(wide, x - BETWEEN);
  });
  const tall = -y + rowH;
  const rows = boxList(made, aside, outcome.set).length;
  const listH = rows ? rows * ROW + BETWEEN : 0;
  const width = Math.max(wide, rows ? LIST_W : 0, 120 * PX) + 2 * BOX_PAD;
  const height = BOX_TOP + tall + listH + BOX_PAD;

  const was = resultOf(doc, step.id);
  if (was) doc = removeMolecules3d(doc, boxMembers(doc, was).molecules);
  const frame = was ? frameAt(was.x0, was.y1, width, height) : placeFor(doc, step, width, height);
  for (const [i, m] of made.entries()) doc = addMolecule3d(doc, { ...m, at: { x: frame.x0 + BOX_PAD + places[i].x, y: frame.y1 - BOX_TOP - listH + places[i].y } });
  const set = { step: step.id, set: outcome.set };
  if (was) return setBoxMade(setBoxFrame(doc, was.id, frame), was.id, set, aside);
  const id = doc.nextWorkflowId ?? 1;
  return setBoxMade(addBox(doc, frame, set), id, set, aside);
}

/**
 * Where a step's new result box goes: to the right of the step, level with
 * it - or, where something is there already, lower, as far as it must to
 * keep clear of the page's boxes, steps, structures and molecules.
 */
function placeFor(doc: StructureDocument, step: WorkflowStep, width: number, height: number): Frame {
  const taken: Frame[] = [
    ...(doc.boxes ?? []),
    ...(doc.steps ?? []).map((s) => frameAt(s.x, s.y, CARD_W, CARD_H)),
  ];
  const points = [...doc.model.atoms.map((a) => ({ x: a.x, y: a.y })), ...(doc.molecules3d ?? []).map((m) => m.at)];
  const clear = (f: Frame) =>
    !taken.some((t) => t.x0 < f.x1 + BETWEEN && t.x1 > f.x0 - BETWEEN && t.y0 < f.y1 + BETWEEN && t.y1 > f.y0 - BETWEEN) &&
    !points.some((p) => inside({ x0: f.x0 - BETWEEN, x1: f.x1 + BETWEEN, y0: f.y0 - BETWEEN, y1: f.y1 + BETWEEN }, p));
  const x = step.x + CARD_W + GAP;
  for (let k = 0; k < 40; k++) {
    const f = frameAt(x, step.y - k * (CARD_H / 2), width, height);
    if (clear(f)) return f;
  }
  return frameAt(x, step.y, width, height);
}

/** What a step kept, as molecules in 3D: a conformer set's compounds, each a molecule with its conformers as frames; a compound set's entries, each a molecule of its own. */
function moleculesOf(outcome: Extract<Outcome, { ok: true }>): Omit<Molecule3D, "id" | "at">[] {
  const atomsAt = (e: SetEntry) => e.atoms.map((a, i) => ({ ...a, x: e.xyz[3 * i], y: e.xyz[3 * i + 1], z: e.xyz[3 * i + 2] }));
  const share = new Map(outcome.kept.map((e, i) => [e, outcome.shares?.[i]]));
  if (outcome.set !== "conformers") {
    return outcome.kept.map((e) => ({
      atoms: atomsAt(e),
      bonds: e.bonds.map((b) => ({ ...b })),
      ...(e.energy != null ? { energies: [e.energy] } : {}),
      ...(e.name ? { name: e.name } : {}),
    }));
  }
  const groups = new Map<number, SetEntry[]>();
  for (const e of outcome.kept) groups.set(e.compound, [...(groups.get(e.compound) ?? []), e]);
  return [...groups.values()].map((g) => {
    const first = g[0];
    const energies = g.every((e) => e.energy != null) ? g.map((e) => e.energy!) : undefined;
    const shares = g.every((e) => share.get(e) != null) ? g.map((e) => share.get(e)!) : undefined;
    return {
      atoms: atomsAt(first),
      bonds: first.bonds.map((b) => ({ ...b })),
      ...(g.length > 1 ? { frames: g.slice(1).map((e) => [...e.xyz]) } : {}),
      ...(energies ? { energies } : {}),
      numbers: g.map((e) => e.number),
      ...(shares ? { shares } : {}),
      conformerSet: true,
      ...(first.name ? { name: first.name } : {}),
    };
  });
}
