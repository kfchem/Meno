/**
 * Who does a kind of step (docs/WORKFLOWS.md, *Who does a step*): Meno,
 * for the steps on entries alone - and, from the job runner on, plugins
 * added that fill a kind. A step says who does it, or Settings,
 * Calculations, does; unset there, the first that can.
 */
import { useAppSettings } from "../../../../lib/settings/appSettings";
import type { WorkflowStep } from "../store/types";
import { MENO_DOES, type StepKind } from "./kinds";

export type Doer = { id: string; name: string };

export const MENO: Doer = { id: "meno", name: "Meno" };

/** Who can do a kind of step: Meno, where it does it. */
export function doersOf(kind: StepKind): Doer[] {
  return MENO_DOES.includes(kind) ? [MENO] : [];
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
  if (step.by) return doersOf(step.kind).find((d) => d.id === step.by) ?? { id: step.by, name: step.by };
  return defaultDoer(step.kind);
}

/** Who does a step, by id: "" where nothing does. */
export const byOf = (step: Pick<WorkflowStep, "kind" | "by">) => doerOf(step)?.id ?? "";
