/**
 * Who does a kind of step (docs/WORKFLOWS.md, *Who does a step*): Meno,
 * for the steps on entries alone, and the plugins added that fill the kind
 * (their manifests' `steps`). A step says who does it, or Settings,
 * Calculations, does; unset there, the first that can. Who does it says
 * what options it takes.
 */
import { pluginById, PLUGINS } from "../../../../lib/calc/catalog";
import { useReaders } from "../../../../lib/calc/workers";
import type { Option } from "../../../../lib/options";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import type { WorkflowStep } from "../store/types";
import { kindInfo, MENO_DOES, type StepKind } from "./kinds";

export type Doer = { id: string; name: string };

export const MENO: Doer = { id: "meno", name: "Meno" };

/** Who can do a kind of step: Meno, where it does it; then each plugin added that fills it, in Meno's order. */
export function doersOf(kind: StepKind): Doer[] {
  const added = useReaders.getState().state;
  const plugins = PLUGINS.filter((p) => added[p.id] === "added" && p.steps.some((d) => d.kind === kind)).map((p) => ({ id: p.id, name: p.name }));
  return [...(MENO_DOES.includes(kind) ? [MENO] : []), ...plugins];
}

/** Whether something added does a kind of step: only those are offered (Quick Add). */
export const doable = (kind: StepKind) => doersOf(kind).length > 0;

/** Who does a kind by default: as Settings says, where that one can; else the first that can. */
export function defaultDoer(kind: StepKind): Doer | undefined {
  const can = doersOf(kind);
  const chosen = useAppSettings.getState().calculations.by[kind];
  return can.find((d) => d.id === chosen) ?? can[0];
}

/** Who does a step: as it says, or by default; none, where nothing added does its kind. */
export function doerOf(step: Pick<WorkflowStep, "kind" | "by">): Doer | undefined {
  if (step.by) return doersOf(step.kind).find((d) => d.id === step.by) ?? { id: step.by, name: pluginById(step.by)?.name ?? step.by };
  return defaultDoer(step.kind);
}

/** Who does a step, by id: "" where nothing does. */
export const byOf = (step: Pick<WorkflowStep, "kind" | "by">) => doerOf(step)?.id ?? "";

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
