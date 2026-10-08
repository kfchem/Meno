/**
 * A workflow as a workspace file keeps it (docs/WORKFLOWS.md, *Saving and
 * sharing*): its boxes, steps and wires as they are, by their ids - read
 * back as data, what does not read left out, and a wire whose ends are
 * not there with it.
 */
import type { AsideEntry, Wire, WireEnd, WorkflowBox, WorkflowStep } from "../store/types";
import type { OptionValues } from "../../../../lib/options";
import { KINDS, type SetKind, type StepKind } from "./kinds";

export type SavedWorkflow = { boxes: WorkflowBox[]; steps: WorkflowStep[]; wires: Wire[] };

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isId = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;
const SETS: readonly SetKind[] = ["structures", "molecules", "conformers"];

function readBox(v: unknown): WorkflowBox | null {
  const b = v as Partial<Record<keyof WorkflowBox, unknown>> | null;
  if (!b || !isId(b.id) || !isNum(b.x0) || !isNum(b.y0) || !isNum(b.x1) || !isNum(b.y1)) return null;
  const made = b.made as { step?: unknown; set?: unknown } | undefined;
  const aside = (Array.isArray(b.aside) ? b.aside : []).flatMap((a: Partial<Record<keyof AsideEntry, unknown>>): AsideEntry[] =>
    Number.isInteger(a?.compound) && (a.compound as number) >= 0 && Number.isInteger(a.number)
      ? [{ compound: a.compound as number, number: a.number as number, ...(isNum(a.energy) ? { energy: a.energy } : {}) }]
      : [],
  );
  return {
    id: b.id,
    x0: Math.min(b.x0, b.x1),
    y0: Math.min(b.y0, b.y1),
    x1: Math.max(b.x0, b.x1),
    y1: Math.max(b.y0, b.y1),
    ...(made && isId(made.step) && SETS.includes(made.set as SetKind) ? { made: { step: made.step, set: made.set as SetKind } } : {}),
    ...(aside.length ? { aside } : {}),
  };
}

function readStep(v: unknown): WorkflowStep | null {
  const s = v as Partial<Record<keyof WorkflowStep, unknown>> | null;
  if (!s || !isId(s.id) || !KINDS.some((k) => k.kind === s.kind) || !isNum(s.x) || !isNum(s.y)) return null;
  const options: OptionValues = {};
  if (s.options && typeof s.options === "object" && !Array.isArray(s.options)) {
    for (const [k, o] of Object.entries(s.options)) if (typeof o === "string" || typeof o === "boolean" || isNum(o)) options[k] = o;
  }
  const r = s.ran as { at?: unknown; ok?: unknown; said?: unknown; input?: unknown } | undefined;
  const ran = r && isNum(r.at) && typeof r.ok === "boolean" && typeof r.said === "string" && typeof r.input === "string" ? { at: r.at, ok: r.ok, said: r.said, input: r.input } : undefined;
  return {
    id: s.id,
    kind: s.kind as StepKind,
    x: s.x,
    y: s.y,
    ...(typeof s.by === "string" && /^[a-z0-9-]{1,40}$/.test(s.by) ? { by: s.by } : {}),
    ...(Object.keys(options).length ? { options } : {}),
    ...(ran ? { ran } : {}),
  };
}

function readEnd(v: unknown): WireEnd | null {
  const e = v as { box?: unknown; step?: unknown } | null;
  return e && isId(e.box) ? { box: e.box } : e && isId(e.step) ? { step: e.step } : null;
}

/** A workflow from a workspace's JSON; none where it holds none. Ids are each one's own: one used twice keeps the first. */
export function readWorkflow(data: unknown): SavedWorkflow | undefined {
  const r = data as { boxes?: unknown; steps?: unknown; wires?: unknown } | null;
  const seen = new Set<number>();
  const fresh = <T extends { id: number }>(t: T | null): t is T => !!t && !seen.has(t.id) && !!seen.add(t.id);
  const boxes = (Array.isArray(r?.boxes) ? r.boxes : []).map(readBox).filter(fresh);
  const steps = (Array.isArray(r?.steps) ? r.steps : []).map(readStep).filter(fresh);
  const boxIds = new Set(boxes.map((b) => b.id));
  const stepIds = new Set(steps.map((s) => s.id));
  const wires = (Array.isArray(r?.wires) ? r.wires : [])
    .map((w: { id?: unknown; from?: unknown; to?: unknown }): Wire | null => {
      const from = readEnd(w?.from);
      if (!w || !isId(w.id) || !from || !isId(w.to) || !stepIds.has(w.to)) return null;
      if ("box" in from ? !boxIds.has(from.box) : !stepIds.has(from.step)) return null;
      return { id: w.id, from, to: w.to };
    })
    .filter(fresh);
  // (a box made by a step not there is a box like any other)
  const kept = boxes.map((b) => (b.made && !stepIds.has(b.made.step) ? (({ made: _m, aside: _a, ...rest }) => rest)(b) : b));
  return kept.length || steps.length ? { boxes: kept, steps, wires } : undefined;
}

/** The counter a workflow's next part is numbered from: past every id it has. */
export const nextIdAfter = (w: SavedWorkflow) => 1 + Math.max(0, ...w.boxes.map((b) => b.id), ...w.steps.map((s) => s.id), ...w.wires.map((x) => x.id));
