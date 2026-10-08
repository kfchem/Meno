/**
 * How a workflow's parts are joined (docs/WORKFLOWS.md, *Wires*): what
 * each port gives, what may be wired to what, what comes into a step, and
 * what state a step is in.
 */
import type { StructureDocument } from "../document";
import type { Molecule3D, Wire, WireEnd, WorkflowBox, WorkflowStep } from "../store/types";
import { boxMembers, setOf } from "./entries";
import { kindInfo, optionsOf, takes, type SetKind } from "./kinds";

type Flow = Pick<StructureDocument, "model" | "molecules3d" | "boxes" | "steps" | "wires">;

export const stepOf = (doc: Flow, id: number): WorkflowStep | undefined => doc.steps?.find((s) => s.id === id);
export const boxOf = (doc: Flow, id: number): WorkflowBox | undefined => doc.boxes?.find((b) => b.id === id);

/** The wire into a step, where it has one. */
export const wireInto = (doc: Flow, step: number): Wire | undefined => doc.wires?.find((w) => w.to === step);

/** The box a step made, where it has run. */
export const resultOf = (doc: Flow, step: number): WorkflowBox | undefined => doc.boxes?.find((b) => b.made?.step === step);

/** What a port gives: a box, the kind of set it holds; a step, what it made - or, not run, what it will make of what comes into it. Null where that is not known yet. */
export function givesOf(doc: Flow, end: WireEnd, seen: ReadonlySet<number> = new Set()): SetKind | null {
  if ("box" in end) {
    const box = boxOf(doc, end.box);
    return box ? setOf(doc, box) : null;
  }
  const step = stepOf(doc, end.step);
  if (!step || seen.has(step.id)) return null;
  const made = resultOf(doc, step.id);
  if (made?.made) return made.made.set;
  const g = kindInfo(step.kind).gives;
  if (g !== "same") return g;
  const into = wireInto(doc, step.id);
  return into ? givesOf(doc, into.from, new Set([...seen, step.id])) : null;
}

/** The steps before a step, nearest first, as its wires lead back. */
export function stepsBefore(doc: Flow, step: number): number[] {
  const out: number[] = [];
  let at = wireInto(doc, step)?.from;
  for (let guard = 0; at && guard < 1000; guard++) {
    if ("box" in at) {
      const made = boxOf(doc, at.box)?.made?.step;
      if (made == null || out.includes(made) || made === step) break;
      out.push(made);
      at = wireInto(doc, made)?.from;
    } else {
      if (out.includes(at.step) || at.step === step) break;
      out.push(at.step);
      at = wireInto(doc, at.step)?.from;
    }
  }
  return out;
}

/** Whether a wire may go from `from` into the step `to`: the step takes what it gives - or what that is is not known yet - and no loop is made. */
export function canWire(doc: Flow, from: WireEnd, to: number): boolean {
  const step = stepOf(doc, to);
  if (!step) return false;
  if ("step" in from && (from.step === to || !stepOf(doc, from.step))) return false;
  if ("box" in from) {
    const box = boxOf(doc, from.box);
    if (!box || box.made?.step === to) return false;
  }
  // (nothing it gives may come back round to it)
  const madeBy = "step" in from ? from.step : boxOf(doc, from.box)?.made?.step;
  if (madeBy != null && [madeBy, ...stepsBefore(doc, madeBy)].includes(to)) return false;
  const set = givesOf(doc, from);
  return set == null || takes(step.kind, set);
}

/** What comes into a step: the kind of set, and its molecules in 3D and structures drawn, in order. Null where nothing does - or what would has not been made yet. */
export function inputOf(doc: Flow, step: number): { set: SetKind; molecules: Molecule3D[]; structures: number[][] } | null {
  const from = wireInto(doc, step)?.from;
  if (!from) return null;
  const box = "box" in from ? boxOf(doc, from.box) : resultOf(doc, from.step);
  if (!box) return null;
  const { structures, molecules } = boxMembers(doc, box);
  const byId = new Map((doc.molecules3d ?? []).map((m) => [m.id, m]));
  return { set: setOf(doc, box), molecules: molecules.map((id) => byId.get(id)!), structures };
}

/** FNV-1a over a string: a short key for what came into a step. */
function hash(text: string, h = 0x811c9dc5): number {
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** A key for what a step would run on: what comes into it, its options, and who does it - so that its card can say it has changed since its run. */
export function inputKey(doc: Flow, step: WorkflowStep, by: string): string {
  const input = inputOf(doc, step.id);
  if (!input) return "";
  let h = hash(`${input.set}|${by}|${JSON.stringify(optionsOf(step.kind, step.options))}`);
  for (const m of input.molecules) {
    h = hash(m.atoms.map((a) => `${a.el}${a.x.toFixed(5)},${a.y.toFixed(5)},${a.z.toFixed(5)}`).join(";"), h);
    h = hash(`${m.bonds.map((b) => `${b.a1}-${b.a2}:${b.order}`).join(";")}|${(m.frames ?? []).map((f) => f.map((v) => v.toFixed(5)).join(",")).join(";")}`, h);
    h = hash(`${(m.energies ?? []).join(",")}|${(m.numbers ?? []).join(",")}|${(m.shares ?? []).join(",")}`, h);
  }
  h = hash(input.structures.map((s) => s.join(",")).join(";"), h);
  return h.toString(36);
}

/** What a step's card says it is: nothing coming in; ready to run; done, or failed - or changed since, in what comes in, its options or who does it. */
export type StepState = "no-input" | "ready" | "done" | "failed" | "changed";

export function stateOf(doc: Flow, step: WorkflowStep, by: string): StepState {
  const into = wireInto(doc, step.id);
  if (!step.ran) return into ? "ready" : "no-input";
  // (what comes from a step not run yet, or run since, has changed)
  if (!into) return "changed";
  const key = inputKey(doc, step, by);
  if (key !== step.ran.input) return "changed";
  return step.ran.ok ? "done" : "failed";
}
