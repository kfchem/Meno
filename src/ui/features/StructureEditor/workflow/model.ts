/**
 * A workflow's parts as the document holds them (docs/WORKFLOWS.md): boxes,
 * steps and wires, numbered from one counter - each change an edit to the
 * document, so that undo takes it back and Save keeps it.
 */
import type { StructureDocument } from "../document";
import type { WireEnd, WorkflowBox, WorkflowStep } from "../store/types";
import type { OptionValues } from "../../../../lib/options";
import { boxMembers, type Frame } from "./entries";
import { canWire, wireInto } from "./flow";
import type { StepKind } from "./kinds";

const idOf = (doc: StructureDocument) => doc.nextWorkflowId ?? 1;

/** A frame with its corners in order: x0 left of x1, y0 below y1. */
export const framed = (f: Frame): Frame => ({ x0: Math.min(f.x0, f.x1), y0: Math.min(f.y0, f.y1), x1: Math.max(f.x0, f.x1), y1: Math.max(f.y0, f.y1) });

/** `doc` with a box round `frame`; it is numbered `nextWorkflowId`. Made by a step, it says so. */
export function addBox(doc: StructureDocument, frame: Frame, made?: WorkflowBox["made"]): StructureDocument {
  const id = idOf(doc);
  return { ...doc, nextWorkflowId: id + 1, boxes: [...(doc.boxes ?? []), { id, ...framed(frame), ...(made ? { made } : {}) }] };
}

function withBox(doc: StructureDocument, id: number, change: (b: WorkflowBox) => WorkflowBox): StructureDocument {
  const boxes = doc.boxes ?? [];
  const i = boxes.findIndex((b) => b.id === id);
  if (i < 0) return doc;
  const next = change(boxes[i]);
  return next === boxes[i] ? doc : { ...doc, boxes: boxes.map((b, k) => (k === i ? next : b)) };
}

/** A box's frame, sized anew. */
export function setBoxFrame(doc: StructureDocument, id: number, frame: Frame): StructureDocument {
  const f = framed(frame);
  return withBox(doc, id, (b) => (b.x0 === f.x0 && b.y0 === f.y0 && b.x1 === f.x1 && b.y1 === f.y1 ? b : { ...b, ...f }));
}

/** A box moved by (dx, dy), with all it holds: the structures drawn and the molecules in 3D inside it. */
export function moveBox(doc: StructureDocument, id: number, dx: number, dy: number): StructureDocument {
  const box = doc.boxes?.find((b) => b.id === id);
  if (!box || (dx === 0 && dy === 0)) return doc;
  const { structures, molecules } = boxMembers(doc, box);
  const atoms = new Set(structures.flat());
  const moved = new Set(molecules);
  return {
    ...withBox(doc, id, (b) => ({ ...b, x0: b.x0 + dx, x1: b.x1 + dx, y0: b.y0 + dy, y1: b.y1 + dy })),
    model: atoms.size ? { ...doc.model, atoms: doc.model.atoms.map((a) => (atoms.has(a.id) ? { ...a, x: a.x + dx, y: a.y + dy } : a)) } : doc.model,
    molecules3d: moved.size ? (doc.molecules3d ?? []).map((m) => (moved.has(m.id) ? { ...m, at: { ...m.at, x: m.at.x + dx, y: m.at.y + dy } } : m)) : doc.molecules3d,
  };
}

/** `doc` without a box - and the wires from it: what it held stays where it is. */
export function removeBox(doc: StructureDocument, id: number): StructureDocument {
  const boxes = (doc.boxes ?? []).filter((b) => b.id !== id);
  if (boxes.length === (doc.boxes ?? []).length) return doc;
  return { ...doc, boxes, wires: (doc.wires ?? []).filter((w) => !("box" in w.from && w.from.box === id)) };
}

/** `doc` with a step of `kind` whose card's top left is at (x, y); it is numbered `nextWorkflowId`. */
export function addStep(doc: StructureDocument, kind: StepKind, x: number, y: number, options?: OptionValues): StructureDocument {
  const id = idOf(doc);
  const step: WorkflowStep = { id, kind, x, y, ...(options && Object.keys(options).length ? { options } : {}) };
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

/** A step's options, or who does it (null: as Settings says), changed. */
export function updateStep(doc: StructureDocument, id: number, patch: { options?: OptionValues; by?: string | null }): StructureDocument {
  return withStep(doc, id, (s) => {
    const { by: _by, ...rest } = s;
    const by = patch.by === undefined ? s.by : (patch.by ?? undefined);
    const next: WorkflowStep = { ...rest, ...(patch.options ? { options: patch.options } : {}), ...(by != null ? { by } : {}) };
    return JSON.stringify(next) === JSON.stringify(s) ? s : next;
  });
}

/** What a step did when it ran, kept with it. */
export function setRan(doc: StructureDocument, id: number, ran: NonNullable<WorkflowStep["ran"]>): StructureDocument {
  return withStep(doc, id, (s) => ({ ...s, ran }));
}

/** `doc` without a step and the wires into it and out of it. The box it made stays, with what it holds - a box like any the chemist drew. */
export function removeStep(doc: StructureDocument, id: number): StructureDocument {
  const steps = (doc.steps ?? []).filter((s) => s.id !== id);
  if (steps.length === (doc.steps ?? []).length) return doc;
  return {
    ...doc,
    steps,
    wires: (doc.wires ?? []).filter((w) => w.to !== id && !("step" in w.from && w.from.step === id)),
    boxes: (doc.boxes ?? []).map((b) => (b.made?.step === id ? (({ made: _m, aside: _a, ...rest }) => rest)(b) : b)),
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

/** What made a box, and the entries it set aside, said of it. */
export function setBoxMade(doc: StructureDocument, id: number, made: NonNullable<WorkflowBox["made"]>, aside: WorkflowBox["aside"]): StructureDocument {
  return withBox(doc, id, ({ aside: _a, ...b }) => ({ ...b, made, ...(aside?.length ? { aside } : {}) }));
}
