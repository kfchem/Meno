/**
 * A workflow's parts as the document holds them (docs/WORKFLOWS.md): sets,
 * steps and wires, numbered from one counter - each change an edit to the
 * document, so that undo takes it back and Save keeps it.
 */
import type { StructureDocument } from "../document";
import type { WireEnd, WorkflowSet, WorkflowStep } from "../store/types";
import type { OptionValues } from "../../../../lib/options";
import { setMembers, type Frame } from "./entries";
import { canWire, wireInto } from "./flow";
import type { StepKind } from "./kinds";

const idOf = (doc: StructureDocument) => doc.nextWorkflowId ?? 1;

/** A frame with its corners in order: x0 left of x1, y0 below y1. */
export const framed = (f: Frame): Frame => ({ x0: Math.min(f.x0, f.x1), y0: Math.min(f.y0, f.y1), x1: Math.max(f.x0, f.x1), y1: Math.max(f.y0, f.y1) });

/** `doc` with a set round `frame`; it is numbered `nextWorkflowId`. Made by a step, it says so. */
export function addSet(doc: StructureDocument, frame: Frame, made?: WorkflowSet["made"]): StructureDocument {
  const id = idOf(doc);
  return { ...doc, nextWorkflowId: id + 1, sets: [...(doc.sets ?? []), { id, ...framed(frame), ...(made ? { made } : {}) }] };
}

function withSet(doc: StructureDocument, id: number, change: (b: WorkflowSet) => WorkflowSet): StructureDocument {
  const sets = doc.sets ?? [];
  const i = sets.findIndex((b) => b.id === id);
  if (i < 0) return doc;
  const next = change(sets[i]);
  return next === sets[i] ? doc : { ...doc, sets: sets.map((b, k) => (k === i ? next : b)) };
}

/** A set's frame, sized anew. */
export function resizeSet(doc: StructureDocument, id: number, frame: Frame): StructureDocument {
  const f = framed(frame);
  return withSet(doc, id, (b) => (b.x0 === f.x0 && b.y0 === f.y0 && b.x1 === f.x1 && b.y1 === f.y1 ? b : { ...b, ...f }));
}

/** A set moved by (dx, dy), with all it holds: the structures drawn and the molecules in 3D inside it. */
export function moveSet(doc: StructureDocument, id: number, dx: number, dy: number): StructureDocument {
  const set = doc.sets?.find((b) => b.id === id);
  if (!set || (dx === 0 && dy === 0)) return doc;
  const { structures, molecules } = setMembers(doc, set);
  const atoms = new Set(structures.flat());
  const moved = new Set(molecules);
  return {
    ...withSet(doc, id, (b) => ({ ...b, x0: b.x0 + dx, x1: b.x1 + dx, y0: b.y0 + dy, y1: b.y1 + dy })),
    model: atoms.size ? { ...doc.model, atoms: doc.model.atoms.map((a) => (atoms.has(a.id) ? { ...a, x: a.x + dx, y: a.y + dy } : a)) } : doc.model,
    molecules3d: moved.size ? (doc.molecules3d ?? []).map((m) => (moved.has(m.id) ? { ...m, at: { ...m.at, x: m.at.x + dx, y: m.at.y + dy } } : m)) : doc.molecules3d,
  };
}

/** `doc` without a set - and the wires from it: what it held stays where it is. */
export function removeSet(doc: StructureDocument, id: number): StructureDocument {
  const sets = (doc.sets ?? []).filter((b) => b.id !== id);
  if (sets.length === (doc.sets ?? []).length) return doc;
  return { ...doc, sets, wires: (doc.wires ?? []).filter((w) => !("set" in w.from && w.from.set === id)) };
}

/** `doc` with a step of `kind`, done by `by` - Meno, or a plugin - whose card's top left is at (x, y); it is numbered `nextWorkflowId`. */
export function addStep(doc: StructureDocument, kind: StepKind, x: number, y: number, options?: OptionValues, by?: string): StructureDocument {
  const id = idOf(doc);
  const step: WorkflowStep = { id, kind, x, y, ...(by ? { by } : {}), ...(options && Object.keys(options).length ? { options } : {}) };
  return { ...doc, nextWorkflowId: id + 1, steps: [...(doc.steps ?? []), step] };
}

function withStep(doc: StructureDocument, id: number, change: (s: WorkflowStep) => WorkflowStep): StructureDocument {
  const steps = doc.steps ?? [];
  const i = steps.findIndex((s) => s.id === id);
  if (i < 0) return doc;
  const next = change(steps[i]);
  return next === steps[i] ? doc : { ...doc, steps: steps.map((s, k) => (k === i ? next : s)) };
}

export function moveStep(doc: StructureDocument, id: number, x: number, y: number): StructureDocument {
  return withStep(doc, id, (s) => (s.x === x && s.y === y ? s : { ...s, x, y }));
}

/** A step's options changed - or its kind, to another who does it fills, with the options it takes for that one. */
export function updateStep(doc: StructureDocument, id: number, patch: { options?: OptionValues; kind?: StepKind }): StructureDocument {
  return withStep(doc, id, (s) => {
    const next: WorkflowStep = { ...s, ...(patch.kind ? { kind: patch.kind } : {}), ...(patch.options ? { options: patch.options } : {}) };
    return JSON.stringify(next) === JSON.stringify(s) ? s : next;
  });
}

/** What a step did when it ran, kept with it. */
export function setRan(doc: StructureDocument, id: number, ran: NonNullable<WorkflowStep["ran"]>): StructureDocument {
  return withStep(doc, id, (s) => ({ ...s, ran }));
}

/** A step's run while its jobs wait or run - or, ended, none: the step as it was otherwise. */
export function setRunning(doc: StructureDocument, id: number, running: WorkflowStep["running"]): StructureDocument {
  return withStep(doc, id, (s) => {
    if (running) return { ...s, running };
    if (!s.running) return s;
    const { running: _r, ...rest } = s;
    return rest;
  });
}

/** `doc` without a step and the wires into it and out of it. The set it made stays, with what it holds - a set like any the chemist drew (of conformers, where its molecules' frames are a conformer search's: entries `holdsOf`). */
export function removeStep(doc: StructureDocument, id: number): StructureDocument {
  const steps = (doc.steps ?? []).filter((s) => s.id !== id);
  if (steps.length === (doc.steps ?? []).length) return doc;
  return {
    ...doc,
    steps,
    wires: (doc.wires ?? []).filter((w) => w.to !== id && !("step" in w.from && w.from.step === id)),
    sets: (doc.sets ?? []).map((b) => (b.made?.step === id ? (({ made: _m, aside: _a, ...rest }) => rest)(b) : b)),
  };
}

/** `doc` with a wire from `from` into the step `to` - in place of one it had - where it may go there (flow `canWire`). */
export function connect(doc: StructureDocument, from: WireEnd, to: number): StructureDocument {
  if (!canWire(doc, from, to)) return doc;
  const was = wireInto(doc, to);
  if (was && JSON.stringify(was.from) === JSON.stringify(from)) return doc;
  const id = idOf(doc);
  return { ...doc, nextWorkflowId: id + 1, wires: [...(doc.wires ?? []).filter((w) => w.to !== to), { id, from, to }] };
}

export function removeWire(doc: StructureDocument, id: number): StructureDocument {
  const wires = (doc.wires ?? []).filter((w) => w.id !== id);
  return wires.length === (doc.wires ?? []).length ? doc : { ...doc, wires };
}

/** What made a set, and the entries it set aside, said of it. */
export function markMade(doc: StructureDocument, id: number, made: NonNullable<WorkflowSet["made"]>, aside: WorkflowSet["aside"]): StructureDocument {
  return withSet(doc, id, ({ aside: _a, ...b }) => ({ ...b, made, ...(aside?.length ? { aside } : {}) }));
}
