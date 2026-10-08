/**
 * Who does a step (docs/WORKFLOWS.md, *Who does a step*): a step is one
 * plugin's - or Meno's, which stands among the plugins for the steps it
 * does itself - and of one of the kinds of step it fills (its manifest's
 * `steps`), which can be changed in the step to another it fills. Only
 * the plugins added are offered. Who does a step says what options it
 * takes.
 */
import { pluginById, PLUGINS } from "../../../../lib/calc/catalog";
import { useReaders } from "../../../../lib/calc/workers";
import type { Option } from "../../../../lib/options";
import type { WorkflowStep } from "../store/types";
import { KINDS, kindInfo, MENO_DOES, type StepKind } from "./kinds";

export type Doer = { id: string; name: string };

export const MENO: Doer = { id: "meno", name: "Meno" };

/** The kinds of step one does, in Meno's order: Meno's own; a plugin's, those of Meno's its manifest says it fills. */
export function kindsOf(by: string): StepKind[] {
  if (by === MENO.id) return [...MENO_DOES];
  const p = pluginById(by);
  return p ? KINDS.filter((k) => p.steps.some((d) => d.kind === k.kind)).map((k) => k.kind) : [];
}

/** Those that do steps, as they are offered: the plugins added that fill any, in Meno's order - those that run a program first - then Meno. */
export function doersAdded(): Doer[] {
  const added = useReaders.getState().state;
  const plugins = PLUGINS.filter((p) => added[p.id] === "added" && kindsOf(p.id).length);
  const programs = (id: string) => kindsOf(id).some((k) => kindInfo(k).runs === "program");
  return [...plugins.filter((p) => programs(p.id)), ...plugins.filter((p) => !programs(p.id)), MENO].map((p) => ({ id: p.id, name: p.name }));
}

/** Whether one is added, and so can run a step: Meno always. */
export const isAdded = (by: string) => by === MENO.id || useReaders.getState().state[by] === "added";

/** Who does a step, by id: as it says - or, a step saved before steps said, Meno where Meno does its kind. */
export const byOf = (step: Pick<WorkflowStep, "kind" | "by">): string => step.by ?? (MENO_DOES.includes(step.kind) ? MENO.id : "");

/** Who does a step, by name: Meno, or a plugin Meno knows of - by its id, one it does not. */
export function doerOf(step: Pick<WorkflowStep, "kind" | "by">): Doer | undefined {
  const by = byOf(step);
  if (!by) return undefined;
  return by === MENO.id ? MENO : { id: by, name: pluginById(by)?.name ?? by };
}

/**
 * The options a kind of step takes, done by `by`: Meno's own, or those the
 * plugin declares for the kind - whether it is added now or not, so that a
 * step keeps saying how it was set.
 */
export function optionsFor(kind: StepKind, by: string): readonly Option[] {
  if (by === MENO.id) return kindInfo(kind).options ?? [];
  return pluginById(by)?.steps.find((d) => d.kind === kind)?.options ?? [];
}

/** The options a step takes, as who does it declares them. */
export const stepOptions = (step: Pick<WorkflowStep, "kind" | "by">) => optionsFor(step.kind, byOf(step));

/** The programs a plugin runs for a kind of step; none, where it does the step in its worker - or Meno does it. */
export function programsFor(kind: StepKind, by: string): readonly string[] {
  return pluginById(by)?.steps.find((d) => d.kind === kind)?.programs ?? [];
}
