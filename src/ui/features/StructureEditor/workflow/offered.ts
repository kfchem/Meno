/**
 * The kinds of step Quick Add offers (docs/WORKFLOWS.md, *A step: from
 * Quick Add*): only those something added does - those that run a program
 * first, then those on entries alone. For a wire let go on empty space,
 * those that take what it carries - and *As conformers*, the conversion
 * taken on purpose, at the end, from a compound set only.
 */
import type { WireEnd } from "../store/types";
import { defaultDoer, doable } from "./doers";
import { givesOf } from "./flow";
import { KINDS, takes, type StepIcon, type StepKind } from "./kinds";

/** A kind of step Quick Add offers: what it is called, its icon, who does it, and whether it runs a program. */
export type QuickStep = { kind: StepKind; name: string; icon: StepIcon; who: string; runs: "program" | "entries" };

type Flow = Parameters<typeof givesOf>[0];

export function offeredSteps(flow: Flow, wire?: WireEnd): QuickStep[] {
  const set = wire ? givesOf(flow, wire) : null;
  const kinds = KINDS.filter((k) => k.kind !== "as-conformers" && doable(k.kind) && (!wire || set == null || takes(k.kind, set)));
  const program = kinds.filter((k) => k.runs === "program");
  const entries = kinds.filter((k) => k.runs === "entries");
  const convert = wire && set === "molecules" && doable("as-conformers") ? KINDS.filter((k) => k.kind === "as-conformers") : [];
  return [...program, ...entries, ...convert].map((k) => ({ kind: k.kind, name: k.name, icon: k.icon, runs: k.runs, who: defaultDoer(k.kind)?.name ?? "" }));
}
